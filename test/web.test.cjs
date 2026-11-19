const {test}=require('node:test');const assert=require('node:assert/strict');const {createWebServer}=require('../web/server.cjs');
const origin='http://127.0.0.1';const key='ptlc_'+'k'.repeat(32);
async function fixture(fn){let calls=[];const server=createWebServer({panelURL:'https://panel.example.com',publicURL:origin+'/bebra/',secure:false,fetchFn:async(url,options)=>{calls.push({url,method:options.method});return new Response(JSON.stringify({data:[]}));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/bebra';try{await fn(base,calls);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('web gateway requires a session and protects mutation with origin and CSRF',async()=>fixture(async(base,calls)=>{
 let r=await fetch(base+'/api/config');assert.equal((await r.json()).connected,false);
 r=await fetch(base+'/api/request',{method:'POST',body:'{}'});assert.equal(r.status,401);
 r=await fetch(base+'/api/connect',{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify({url:'https://panel.example.com',token:key})});assert.equal(r.status,403);
 r=await fetch(base+'/api/connect',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({url:'https://panel.example.com',token:key})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);const session=await r.json();assert.ok(session.csrf);assert.ok(!JSON.stringify(session).includes(key));
 r=await fetch(base+'/api/request',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:'{}'});assert.equal(r.status,403);
 r=await fetch(base+'/api/request',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-Bebra-CSRF':session.csrf},body:'{}'});assert.equal(r.status,200);
 r=await fetch(base+'/api/request',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-Bebra-CSRF':session.csrf},body:JSON.stringify({server:'12345678',route:'/../../application/users'})});assert.equal(r.status,400);assert.equal(calls.length,2);
 r=await fetch(base+'/api/disconnect',{method:'POST',headers:{Cookie:cookie,Origin:origin,'X-Bebra-CSRF':session.csrf},body:'{}'});assert.equal(r.status,200);
 r=await fetch(base+'/api/config',{headers:{Cookie:cookie}});assert.equal((await r.json()).connected,false);
}));
test('web service cannot be used as an arbitrary panel proxy or serve source files',async()=>fixture(async base=>{
 let r=await fetch(base+'/api/connect',{method:'POST',headers:{Origin:origin},body:JSON.stringify({url:'https://other.example.com',token:key})});assert.equal(r.status,400);
 r=await fetch(base+'/../main.cjs');assert.equal(r.status,404);r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/platform.js/);
}));
