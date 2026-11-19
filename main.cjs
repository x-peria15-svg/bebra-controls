const {app,BrowserWindow,ipcMain,safeStorage,dialog,shell,protocol,net,Menu,clipboard}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const WebSocket=require('ws');
const {PanelClient,validateConfig,signedURL}=require('./lib/panel-client.cjs');
const {closeSocket}=require('./lib/socket.cjs');
const {uploadFile}=require('./lib/upload.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setName('Bebra Control');
app.setPath('userData',path.join(app.getPath('appData'),'Bebra Control'));
let win,client,connection,ws,wsTimer,consoleServer,wsGeneration=0,allowClose=false;
const store=()=>path.join(app.getPath('userData'),'connection.json');
const send=(channel,data)=>{if(win&&!win.isDestroyed())win.webContents.send(channel,data);};
function closeConsole(){consoleServer=null;wsGeneration++;clearTimeout(wsTimer);const previous=ws;ws=null;closeSocket(previous);}
async function saveConfig(input){
 const config=validateConfig(input),next=new PanelClient(config);
 const list=await next.request({});
 if(!Array.isArray(list?.data))throw Error('Этот адрес не является панелью Pterodactyl.');
 if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Windows не предоставила безопасное хранилище. Подключение не сохранено.');
 const secret=await safeStorage.encryptStringAsync(config.token);
 await fs.mkdir(app.getPath('userData'),{recursive:true});
 await fs.writeFile(store(),JSON.stringify({url:config.url,secret:secret.toString('base64')}),{mode:0o600});
 closeConsole();connection=config;client=next;
 return {url:config.url,connected:true};
}
async function loadConfig(){
 try{const s=JSON.parse(await fs.readFile(store(),'utf8'));const decoded=await safeStorage.decryptStringAsync(Buffer.from(s.secret,'base64'));connection=validateConfig({url:s.url,token:decoded.result});client=new PanelClient(connection);}catch{connection=null;client=null;}
}
function requireClient(){if(!client)throw Error('Сначала подключи свою панель.');return client;}
let uploadBusy=false;
async function uploadPaths({server,directory='/',plugins=false,filePaths}){
 requireClient();if(uploadBusy)throw Error('Дождись завершения текущей загрузки.');
 if(!Array.isArray(filePaths)||!filePaths.length||filePaths.length>1000||filePaths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw Error('Перетащи обычные файлы из Проводника.');
 if(plugins&&filePaths.some(p=>! /\.(jar|wasm)$/i.test(p)))throw Error('В раздел плагинов можно загружать только JAR и WASM. Остальное загружай через «Файлы».');
 uploadBusy=true;const results=[];
 try{for(const file of filePaths){const signed=await client.request({server,route:'/files/upload'});const url=signedURL(connection.url,signed.attributes.url);url.searchParams.set('directory',directory);await uploadFile(url,file,{onProgress:p=>send('upload-progress',{...p,server})});results.push(path.basename(file));}return {files:results};}
 finally{uploadBusy=false;send('upload-progress',{done:true,server});}
}
async function openConsole(server){
 closeConsole();consoleServer=server;const gen=wsGeneration;
 const connect=async()=>{
  if(gen!==wsGeneration||consoleServer!==server)return;
  try{
   const r=await requireClient().request({server,route:'/websocket'});
   if(gen!==wsGeneration)return;
   const socketURL=new URL(r.data.socket),base=new URL(connection.url);
   if(socketURL.protocol!=='wss:'||socketURL.hostname!==base.hostname||!['','443','8443'].includes(socketURL.port))throw Error('Недоверенный адрес консоли.');
   ws=new WebSocket(socketURL.toString(),{origin:connection.url,handshakeTimeout:15000,maxPayload:1024*1024});
   ws.on('open',()=>ws.send(JSON.stringify({event:'auth',args:[r.data.token]})));
   ws.on('message',buffer=>{
    if(gen!==wsGeneration)return;
    try{const packet=JSON.parse(buffer.toString());
     if(packet.event==='auth success'){send('console',{server,event:'connected'});ws.send(JSON.stringify({event:'send logs',args:[null]}));ws.send(JSON.stringify({event:'send stats',args:[null]}));}
     else if(packet.event==='token expiring'||packet.event==='token expired'){ws.close();}
     else send('console',{server,event:packet.event,args:packet.args});
    }catch{}
   });
   ws.on('error',()=>send('console',{server,event:'connection-error',message:'Консоль недоступна. Подключаюсь повторно…'}));
   ws.on('close',()=>{if(gen===wsGeneration){send('console',{server,event:'disconnected'});wsTimer=setTimeout(connect,5000);}});
  }catch(e){if(gen===wsGeneration){send('console',{server,event:'connection-error',message:e.message});wsTimer=setTimeout(connect,10000);}}
 };
 await connect();return true;
}
async function saveDownload(url,defaultName){
 const target=signedURL(connection.url,url);
 const {canceled,filePath}=await dialog.showSaveDialog(win,{defaultPath:path.basename(defaultName||'download'),title:'Сохранить файл'});
 if(canceled)return {canceled:true};
 const partial=filePath+'.bebra-part';
 try{
  const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(15*60*1000)});
  if(!response.ok||!response.body)throw Error('Не удалось скачать файл.');
  const {createWriteStream}=require('node:fs');
  await pipeline(Readable.fromWeb(response.body),createWriteStream(partial,{flags:'wx'}));
  await fs.rename(partial,filePath);
  return {saved:true,name:path.basename(filePath)};
 }catch(e){await fs.rm(partial,{force:true}).catch(()=>{});throw Error(e.message.includes('скачать')?e.message:'Не удалось сохранить файл. Проверь место на диске и права доступа.');}
}
function register(channel,handler){ipcMain.handle(channel,async(event,...args)=>{
 if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||!event.senderFrame.url.startsWith('app://bebra/'))return {ok:false,error:'Доступ запрещён.'};
 try{return {ok:true,data:await handler(...args)};}catch(e){return {ok:false,error:e.message};}
});}
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);
 protocol.handle('app',async req=>{
  const u=new URL(req.url);if(u.hostname!=='bebra')return new Response('',{status:403});
  let name;try{name=decodeURIComponent(u.pathname);}catch{return new Response('',{status:400});}
  const root=path.join(__dirname,'ui'),file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep))return new Response('',{status:403});
  try{return await net.fetch(pathToFileURL(file).toString());}catch{return new Response('',{status:404});}
 });
 await loadConfig();
 const provision=process.argv.find(a=>a.startsWith('--provision='));
 if(provision){const p=path.resolve(provision.slice(12));try{await saveConfig(JSON.parse(await fs.readFile(p,'utf8')));await fs.rm(p);}catch(e){await dialog.showMessageBox({type:'error',message:'Не удалось автоматически подключить панель',detail:e.message});}}
 win=new BrowserWindow({width:1536,height:960,minWidth:1080,minHeight:730,frame:false,show:false,backgroundColor:'#080909',title:'Bebra Control',icon:path.join(__dirname,'assets','icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(e,url)=>{if(url!=='app://bebra/index.html')e.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
 register('config',()=>({connected:!!client,url:connection?.url||'https://panel.example.com',version:app.getVersion()}));
 register('connect',saveConfig);
 register('disconnect',async()=>{closeConsole();client=null;connection=null;await fs.rm(store(),{force:true});return true;});
 register('api',options=>requireClient().request(options));
 register('copy-text',text=>{if(typeof text!=='string'||text.length>16384)throw Error('Текст слишком длинный.');clipboard.writeText(text);return true;});
 register('console-open',openConsole);
 register('console-close',()=>{closeConsole();return true;});
 register('panel',async page=>{
  const c=connection?.url||'https://panel.example.com';
  const pages={home:'/',api:'/account/api',admin:'/admin',account:'/account'};
  if(!Object.hasOwn(pages,page))throw Error('Неизвестная страница.');
  await shell.openExternal(c+pages[page]);return true;
 });
 register('upload',async({server,directory='/',plugins=false})=>{
  requireClient();
  const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:plugins?'Загрузить плагины':'Загрузить файлы',properties:['openFile','multiSelections'],filters:plugins?[{name:'Плагины',extensions:['jar','wasm']}]:[]});
  if(canceled)return {canceled:true};
  return uploadPaths({server,directory,plugins,filePaths});
 });
 register('upload-dropped',uploadPaths);
 register('download',async({server,file,backup})=>{
  const r=await requireClient().request({server,route:backup?'/backups/'+backup+'/download':'/files/download',query:backup?{}:{file}});
  return saveDownload(r.attributes.url,backup?'backup-'+backup+'.tar.gz':path.basename(file));
 });
 register('export-log',async text=>{
  if(typeof text!=='string'||text.length>4*1024*1024)throw Error('Журнал слишком большой.');
  const {canceled,filePath}=await dialog.showSaveDialog(win,{defaultPath:'console-'+new Date().toISOString().slice(0,10)+'.log'});
  if(canceled)return {canceled:true};await fs.writeFile(filePath,text,'utf8');return {saved:true};
 });
 register('window',action=>{if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close'){allowClose=true;win.close();}return true;});
 win.on('close',event=>{if(!allowClose){event.preventDefault();send('close-request',null);}else closeConsole();});
 win.once('ready-to-show',()=>win.show());
 await win.loadURL('app://bebra/index.html');
});
app.on('window-all-closed',()=>app.quit());

