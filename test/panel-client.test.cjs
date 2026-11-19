const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConfig,apiPath,signedURL,PanelClient}=require('../lib/panel-client.cjs');
const config={url:'https://panel.example.com',token:'ptlc_'+'a'.repeat(43)};
test('management routes and user routes cannot escape their bounded API scope',()=>{
 assert.equal(apiPath({management:true}),'/api/client/bebra/account');
 assert.equal(apiPath({management:true,route:'/system-reserve',method:'POST'}),'/api/client/bebra/system-reserve');
 assert.equal(apiPath({management:true,route:'/environments',method:'POST'}),'/api/client/bebra/environments');
 assert.throws(()=>apiPath({management:true,route:'/system-reserve',method:'DELETE'}));
 assert.equal(apiPath({management:true,server:'a1b2c3d4',route:'/limits',method:'POST'}),'/api/client/bebra/servers/a1b2c3d4/limits');
 assert.equal(apiPath({server:'a1b2c3d4',route:'/users',method:'POST'}),'/api/client/servers/a1b2c3d4/users');
 for(const route of ['/limits/../users','/application/users','/limits?server=other'])assert.throws(()=>apiPath({management:true,server:'a1b2c3d4',route}));
 assert.throws(()=>apiPath({management:true,server:'../escape',route:'/limits'}));
 assert.throws(()=>apiPath({management:true,server:'a1b2c3d4',route:'/limits',method:'DELETE'}));
 assert.throws(()=>apiPath({server:'a1b2c3d4',route:'/users/../../account',method:'POST'}));
});
test('connection only accepts an HTTPS origin and client key',()=>{
 assert.equal(validateConfig(config).url,config.url);
 for(const url of ['http://panel.example.com','https://u:p@panel.example.com','https://panel.example.com/api','file:///etc/passwd'])assert.throws(()=>validateConfig({...config,url}));
 assert.throws(()=>validateConfig({...config,token:'root-password'}));
});
test('renderer cannot escape client API or call admin endpoints',()=>{
 assert.equal(apiPath({server:'1a2b3c4d',route:'/resources'}),'/api/client/servers/1a2b3c4d/resources');
 assert.equal(apiPath({}),'/api/client');
 assert.equal(apiPath({host:true}),'/api/client/bebra/host');
 assert.throws(()=>apiPath({host:true,method:'POST'}));
 for(const route of ['/../../application/users','//evil.com','/files/../power','/backups/a?x=1'])assert.throws(()=>apiPath({server:'1a2b3c4d',route}));
 assert.throws(()=>apiPath({server:'../../../etc',route:'/resources'}));
 assert.throws(()=>apiPath({server:'1a2b3c4d',route:'/resources',method:'DELETE'}));
});
test('downloads only trust configured panel and Wings HTTPS endpoints',()=>{
 assert.equal(signedURL(config.url,'https://panel.example.com:8443/download?token=a').hostname,'panel.example.com');
 for(const u of ['http://panel.example.com','https://evil.example.com','https://panel.example.com:22','https://u:p@panel.example.com'])assert.throws(()=>signedURL(config.url,u));
});
test('authentication and backend errors do not leak response traces or credentials',async()=>{
 const c=new PanelClient(config,async()=>new Response('{"exception":"secret-stack"}',{status:401}));
 await assert.rejects(c.request({}),e=>e.message.includes('API-ключ')&&!e.message.includes('secret-stack'));
 const bad=new PanelClient(config,async()=>new Response('SECRET DEBUG TRACE',{status:500}));
 await assert.rejects(bad.request({}),e=>!e.message.includes('SECRET'));
});
test('file text remains text and paths are encoded as query data',async()=>{
 let called;
 const c=new PanelClient(config,async(url,opts)=>{called={url,opts};return new Response('<script>bad()</script>');});
 const content=await c.request({server:'1a2b3c4d',route:'/files/contents',query:{file:'/hello & test.toml'}});
 assert.equal(content,'<script>bad()</script>');
 assert.equal(new URL(called.url).searchParams.get('file'),'/hello & test.toml');
 assert.equal(called.opts.redirect,'error');
});
test('oversized responses are rejected before loading into the renderer',async()=>{
 const c=new PanelClient(config,async()=>new Response('x'.repeat(4*1024*1024+1)));
 await assert.rejects(c.request({}),/слишком большой/);
});
