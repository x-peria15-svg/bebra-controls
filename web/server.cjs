const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {WebSocketServer,WebSocket}=require('ws');
const {PanelClient,validateConfig,signedURL}=require('../lib/panel-client.cjs');
const {closeSocket}=require('../lib/socket.cjs');
const VERSION=require('../package.json').version;
function createWebServer({panelURL=process.env.PANEL_URL,publicURL=process.env.PUBLIC_URL,fetchFn=fetch,secure=true}={}){
 const panel=validateConfig({url:panelURL,token:'ptlc_'+'x'.repeat(32)}).url;
 const publicOrigin=new URL(publicURL).origin;
 if(secure&&new URL(publicURL).protocol!=='https:')throw Error('PUBLIC_URL must use HTTPS.');
 if(!secure&&!['127.0.0.1','localhost','[::1]'].includes(new URL(publicURL).hostname))throw Error('HTTP development is restricted to loopback.');
 const base=new URL(publicURL).pathname.replace(/\/$/,'');
 if(base&&!/^\/[a-zA-Z0-9/_-]+$/.test(base))throw Error('Invalid public path.');
 const sessions=new Map(),attempts=new Map();const ttl=12*3600*1000;
 const cookieName='bebra_session';
 const cookie=(value,age)=>`${cookieName}=${value}; Path=${base||'/'}; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
 function sessionFor(req){const id=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);const s=sessions.get(id);if(!s||s.expires<Date.now()){if(s){for(const ws of s.sockets)ws.close();sessions.delete(id);}return null;}return s;}
 function sameOrigin(req){return req.headers.origin===publicOrigin;}
 function checkCSRF(req,s){const actual=Buffer.from(req.headers['x-bebra-csrf']||'');const expected=Buffer.from(s.csrf);return sameOrigin(req)&&actual.length===expected.length&&timingSafeEqual(actual,expected);}
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 async function readJSON(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024)throw Error('Request too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
 const wsServer=new WebSocketServer({noServer:true,maxPayload:1024*1024});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  try{
   const url=new URL(req.url,'http://localhost');if(base&&url.pathname!==base&&!url.pathname.startsWith(base+'/'))return json(res,404,{error:'Not found.'});
   const route=url.pathname.slice(base.length)||'/';let s=sessionFor(req);
   if(base&&url.pathname===base){res.writeHead(302,{Location:base+'/'});res.end();return;}
   if(route==='/api/config'&&req.method==='GET')return json(res,200,{connected:!!s,url:panel,version:VERSION,platform:'web',csrf:s?.csrf});
   if(route==='/api/connect'&&req.method==='POST'){
    if(!sameOrigin(req))return json(res,403,{error:'Origin rejected.'});
    // Reverse proxy must pass a single, trusted client address; never trust arbitrary X-Forwarded-For.
    const ip=req.socket.remoteAddress||'unknown';const a=attempts.get(ip)||{start:Date.now(),count:0};if(Date.now()-a.start>60000){a.start=Date.now();a.count=0;}if(++a.count>20)return json(res,429,{error:'Too many sign-in attempts.'});if(attempts.size>4096)attempts.clear();attempts.set(ip,a);
    if(sessions.size>=1000)return json(res,503,{error:'Session capacity reached.'});
    const input=await readJSON(req);const config=validateConfig(input);if(config.url!==panel)return json(res,400,{error:'This web instance only connects to its configured panel.'});
    const client=new PanelClient(config,fetchFn);await client.request({});
    const id=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');sessions.set(id,{id,csrf,client,expires:Date.now()+ttl,sockets:new Set()});
    res.setHeader('Set-Cookie',cookie(id,ttl/1000));return json(res,200,{connected:true,url:panel,csrf});
   }
   if(route.startsWith('/api/')){
    if(!s)return json(res,401,{error:'Войди с ключом доступа.'});
    if(req.method!=='GET'&&!checkCSRF(req,s))return json(res,403,{error:'CSRF validation failed.'});
    if(route==='/api/disconnect'&&req.method==='POST'){for(const ws of s.sockets)ws.close();sessions.delete(s.id);res.setHeader('Set-Cookie',cookie('',0));return json(res,200,true);}
    if(route==='/api/request'&&req.method==='POST')return json(res,200,await s.client.request(await readJSON(req)));
    if(route==='/api/upload'&&req.method==='POST'){
     const serverId=url.searchParams.get('server'),directory=url.searchParams.get('directory')||'/';const signed=await s.client.request({server:serverId,route:'/files/upload'});const target=signedURL(panel,signed.attributes.url);target.searchParams.set('directory',directory);
     const type=req.headers['content-type']||'';if(!type.startsWith('multipart/form-data; boundary='))return json(res,400,{error:'Multipart upload required.'});
     const controller=new AbortController();req.on('aborted',()=>controller.abort());
     const response=await fetchFn(target,{method:'POST',body:req,duplex:'half',headers:{'Content-Type':type,...(req.headers['content-length']?{'Content-Length':req.headers['content-length']}:{})},redirect:'error',signal:controller.signal});await response.body?.cancel();
     return json(res,response.ok?200:response.status,response.ok?{uploaded:true}:{error:'Upload failed. Check server disk quota.'});
    }
    if(route==='/api/download'&&req.method==='GET'){
     const serverId=url.searchParams.get('server'),file=url.searchParams.get('file'),backup=url.searchParams.get('backup');
     const signed=await s.client.request({server:serverId,route:backup?'/backups/'+backup+'/download':'/files/download',query:backup?{}:{file}});const target=signedURL(panel,signed.attributes.url);const response=await fetchFn(target,{redirect:'error'});
     if(!response.ok||!response.body)return json(res,502,{error:'Download unavailable.'});
     res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${path.basename(file||'backup.tar.gz').replace(/["\r\n\\]/g,'_')}"`});await pipeline(Readable.fromWeb(response.body),res);return;
    }
    return json(res,404,{error:'Not found.'});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed.'});
   const name=route==='/'?'/index.html':decodeURIComponent(route);const root=path.resolve(__dirname,'../ui');const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return json(res,403,{error:'Forbidden.'});
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)];if(!mime)return json(res,404,{error:'Not found.'});
   const body=await fs.readFile(file);res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
  }catch(e){if(!res.headersSent)json(res,400,{error:e.code==='ENOENT'?'Not found.':e.message});else res.destroy();}
 });
 server.requestTimeout=0;server.headersTimeout=30000;server.keepAliveTimeout=5000;
 server.on('upgrade',async(req,socket,head)=>{
  try{const u=new URL(req.url,'http://localhost'),s=sessionFor(req);if(u.pathname!==base+'/api/console'||!s||!sameOrigin(req)||s.sockets.size>=5){socket.destroy();return;}
   const result=await s.client.request({server:u.searchParams.get('server'),route:'/websocket'});const target=signedURL(panel,result.data.socket.replace(/^wss:/,'https:'));const upstreamURL=target.toString().replace(/^https:/,'wss:');
   wsServer.handleUpgrade(req,socket,head,down=>{
    s.sockets.add(down);const upstream=new WebSocket(upstreamURL,{origin:panel,handshakeTimeout:15000,maxPayload:1024*1024});
    upstream.on('open',()=>upstream.send(JSON.stringify({event:'auth',args:[result.data.token]})));
    upstream.on('message',data=>{try{const p=JSON.parse(data);if(p.event==='auth success'){down.send(JSON.stringify({event:'connected'}));upstream.send(JSON.stringify({event:'send logs',args:[null]}));upstream.send(JSON.stringify({event:'send stats',args:[null]}));}else if(['token expiring','token expired'].includes(p.event))down.close();else if(down.readyState===WebSocket.OPEN)down.send(JSON.stringify(p));}catch{}});
    // Commands go through the authenticated, permission-checked REST API only.
    upstream.on('error',()=>down.close());upstream.on('close',()=>down.close());down.on('close',()=>{s.sockets.delete(down);closeSocket(upstream);});down.on('error',()=>closeSocket(upstream));
   });
  }catch{socket.destroy();}
 });
 const timer=setInterval(()=>{for(const [id,s]of sessions)if(s.expires<Date.now()){for(const ws of s.sockets)ws.close();sessions.delete(id);}},60000);timer.unref();server.on('close',()=>{clearInterval(timer);for(const s of sessions.values())for(const ws of s.sockets)ws.close();wsServer.close();sessions.clear();});
 return server;
}
if(require.main===module){const server=createWebServer();server.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>console.log('Bebra Control web ready'));}
module.exports={createWebServer};
