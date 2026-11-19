import {h,btn,ibtn,bytes,empty,toast,run,confirm,field,serverName,runtime,isPumpkin,isApps,stateName,cleanLog} from './util.js';
import {icon} from './icons.js';
import {createConsole} from './console.js';
import {normalizeServer} from './model.mjs';
import {appendLog} from './logs.mjs';
import {filesView,backupsView,schedulesView,propertiesView,playersView} from './views.js';
import {resourcesView,accessView,creationView,allowed} from './management.js';
import {systemReserveView} from './system-reserve.js';
import {historyView,keysView} from './analytics.js';
const $=s=>document.querySelector(s);
const state={servers:[],selected:null,resources:new Map(),logs:new Map(),players:new Map(),host:null,tab:'console',overview:false,connected:false};
let view=null,pollBusy=false,lastHost=0,refreshing=false;
const tabItems=[['console','Консоль','terminal'],['players','Игроки','users'],['files','Файлы','folder'],['plugins','Плагины','puzzle'],['backups','Резервные копии','archive'],['schedules','Расписание','calendar'],['properties','Свойства','settings'],['history','Графики','cpu'],['resources','Ресурсы','cpu'],['access','Доступ','shield']];
const serverCode={Proxy:'P',Lobby:'L',Build:'B',Survival:'S',Test:'T',Apps:'A'};
function context(){const server=state.selected?.identifier;return {state,server,api:(route='',method='GET',body,query)=>window.bebra.api({server,route,method,body,query}),selectTab,parsePlayers,refreshServer:async()=>{const r=await window.bebra.api({server});Object.assign(state.selected,normalizeServer(r.attributes),{user_permissions:r.meta?.user_permissions||[]});renderHeader();renderMetrics();lastHost=0;}};}
function connectionStatus(ok,message){const n=$('#connection-state');n.replaceChildren(h('span',{class:'tiny-dot '+(ok?'':'offline')}),message);}
function parsePlayers(text){
 if(!state.selected)return;
 let m=text.match(/(?:There are|There is)\s+(\d+)\s+(?:of a max(?:imum)?\s+(?:of\s+)?\d+\s+players? online|players? online)(?:\s*[:.]\s*(.*))?/i)||text.match(/(?:Игроков|Онлайн)\s*[:：]\s*(\d+)(?:.*?[:：]\s*(.*))?/i);
 if(m){state.players.set(state.selected.identifier,{count:Number(m[1]),names:(m[2]||'').split(',').map(x=>x.trim()).filter(Boolean),timestamp:Date.now()});view?.onPlayers?.();renderMetrics();}
}
function renderNav(){
 const nav=$('#server-nav');nav.replaceChildren(...state.servers.map(s=>{const r=state.resources.get(s.identifier);return h('button',{class:'server-shortcut '+(!state.overview&&s.identifier===state.selected?.identifier?'active ':'')+(r?.current_state==='running'?'running':''),title:serverName(s),'aria-label':serverName(s),onClick:()=>run(()=>selectServer(s))},serverCode[s.name]||s.name.slice(0,1));}));
 $('#overview-button').classList.toggle('active',state.overview===true);
}
function renderHeader(){
 const s=state.selected,header=$('#server-header');
 if(state.overview){header.replaceChildren(h('div',{class:'server-emblem'},icon('network',25)),h('div',{class:'server-heading'},h('div',{class:'heading-line'},h('h1',{},'Моя сеть')),h('div',{class:'server-subtitle'},'Управление серверами и приложениями')),btn('Веб-панель','external',()=>run(()=>window.bebra.openPanel('home'))));return;}
 if(!s){header.replaceChildren();return;}
 const current=state.resources.get(s.identifier)?.current_state||'unknown';
 const running=['running','starting'].includes(current);
 header.replaceChildren(h('div',{class:'server-emblem '+(isPumpkin(s)?'pumpkin':'')},icon(isApps(s)?'code':s.name==='Proxy'?'network':'cube',25)),h('div',{class:'server-heading'},h('div',{class:'heading-line'},h('h1',{},serverName(s)),h('span',{class:'status '+current},stateName(current))),h('div',{class:'server-subtitle'},h('span',{},runtime(s)),h('span',{class:'subtle'},'·'),h('code',{},s.allocation.ip+':'+s.allocation.port))),h('div',{class:'header-actions'},btn(running?'Выключить':'Включить',running?'stop':'play',()=>run(()=>power(running?'stop':'start')),running?'':'primary',current==='stopping'||current==='unknown'||s.is_installing||s.status==='installing'),btn('Перезапуск','restart',()=>run(async()=>{if(await confirm('Перезапустить '+serverName(s)+'?','Игроки будут отключены на время перезапуска.','Перезапустить'))await power('restart');}),'',!running),ibtn('Свойства сервера','settings',()=>run(()=>selectTab('properties')))));
 const actions=header.querySelectorAll('.header-actions button');if(actions[0])actions[0].disabled ||= !allowed(s,'control.'+(running?'stop':'start'));if(actions[1])actions[1].disabled ||= !allowed(s,'control.restart');if(actions[2])actions[2].disabled = !allowed(s,'startup.read');
}
async function power(signal){if(!allowed(state.selected,'control.'+signal))throw Error('Нет разрешения на это действие.');await window.bebra.api({server:state.selected.identifier,route:'/power',method:'POST',body:{signal}});toast(signal==='start'?'Запуск отправлен':signal==='stop'?'Остановка отправлена':'Перезапуск отправлен');await poll();}
function metric(label,name,value,detail,pct=0){return h('div',{class:'metric'},h('div',{class:'metric-label'},h('span',{class:'metric-icon'},icon(name,16)),label),h('div',{class:'metric-value'},value,h('small',{},detail)),h('div',{class:'metric-meter'},h('span',{style:'width:'+Math.max(0,Math.min(100,pct))+'%'})));}
function renderMetrics(){
 const s=state.selected;if(!s||state.overview){$('#metrics').hidden=true;return;}$('#metrics').hidden=false;
 const r=state.resources.get(s.identifier),v=r?.resources,players=state.players.get(s.identifier);const offline=r?.current_state==='offline';
 $('#metrics').replaceChildren(metric('Процессор','cpu',v?Number(v.cpu_absolute).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'—','из '+s.limits.cpu+'%',v?.cpu_absolute/s.limits.cpu*100),metric('Память','memory',bytes(v?.memory_bytes),'из '+bytes(s.limits.memory*1024**2),(v?.memory_bytes||0)/(s.limits.memory*1024**2)*100),metric(isApps(s)?'Работа приложения':'Игроки',isApps(s)?'code':'users',isApps(s)?(r?.current_state==='running'?'Онлайн':offline?'Отключено':'—'):offline?'—':players?.count??'—',isApps(s)?'Node.js / Python':offline?'сервер выключен':players?'онлайн':'запроси список'),metric('Диск','disk',bytes(v?.disk_bytes),'из '+bytes(s.limits.disk*1024**2),(v?.disk_bytes||0)/(s.limits.disk*1024**2)*100));
}
function renderTabs(){const tabs=$('#tabs');tabs.hidden=state.overview;const permissions={players:'control.console',files:'file.read',plugins:'file.read',backups:'backup.read',schedules:'schedule.read',properties:'startup.read',access:'user.read'};tabs.replaceChildren(...tabItems.filter(([id])=>(!isApps(state.selected)||!['players','plugins'].includes(id))&&(id==='resources'?state.resourceAdmin:!permissions[id]||allowed(state.selected,permissions[id]))).map(([id,title,name])=>h('button',{class:'tab '+(state.tab===id?'active':''),'aria-selected':state.tab===id,onClick:()=>run(()=>selectTab(id))},icon(name,17),title)));}
async function canLeave(){return !view?.canLeave||await view.canLeave();}
function renderView(){
 view?.dispose?.();view=null;
 if(state.overview==='keys'){view=keysView(state);$('#content').replaceChildren(view.root);return;}
 if(state.overview==='reserve'){view=systemReserveView(async()=>{lastHost=0;await overview();});$('#content').replaceChildren(view.root);return;}
 if(state.overview==='create'){view=creationView(async id=>{state.overview=false;const r=await window.bebra.api({});state.servers=r.data.map(x=>normalizeServer(x.attributes));await selectServer(state.servers.find(s=>s.identifier===id)||state.servers.at(-1));});$('#content').replaceChildren(view.root);return;}
 if(state.overview){renderOverview();return;}
 const ctx=context();
 const builders={console:createConsole,files:filesView,plugins:c=>filesView(c,true),backups:backupsView,schedules:schedulesView,properties:propertiesView,players:playersView,resources:resourcesView,access:accessView,history:historyView};
 view=(builders[state.tab]||createConsole)(ctx);$('#content').replaceChildren(view.root);
}
async function selectTab(tab){if(!await canLeave())return;state.overview=false;state.tab=tab;renderNav();renderHeader();renderTabs();renderMetrics();renderView();}
async function selectServer(s){if(!await canLeave())return;const r=await window.bebra.api({server:s.identifier});Object.assign(s,normalizeServer(r.attributes),{user_permissions:r.meta?.user_permissions||[]});state.selected=s;state.overview=false;state.tab='console';localStorage.setItem('selected',s.identifier);renderNav();renderHeader();renderTabs();renderMetrics();renderView();if(allowed(s,'websocket.connect'))await window.bebra.openConsole(s.identifier);else await window.bebra.closeConsole();await poll();}
async function overview(){if(!await canLeave())return;state.overview=true;await window.bebra.closeConsole();renderNav();renderHeader();renderTabs();renderMetrics();renderView();await poll();}
async function newEnvironment(){if(!await canLeave())return;state.overview='create';await window.bebra.closeConsole();renderNav();renderHeader();renderTabs();renderMetrics();renderView();}
async function systemReserve(){if(!await canLeave())return;state.overview='reserve';await window.bebra.closeConsole();renderNav();renderHeader();renderTabs();renderMetrics();renderView();}
async function accessKeys(){if(!await canLeave())return;state.overview='keys';await window.bebra.closeConsole();renderNav();renderHeader();renderTabs();renderMetrics();renderView();}
function renderOverview(){
 const root=h('div',{class:'overview-content'},h('div',{class:'overview-intro'},h('div',{},h('h2',{},'Все серверы'),h('p',{},'Твоя сеть. Все окружения под рукой.')),h('span',{class:'tag'},state.servers.length+' окружений')));
 if(state.resourceAdmin)root.firstChild.append(btn('Создать окружение','plus',()=>run(newEnvironment),'primary'));
 if(state.resourceAdmin)root.firstChild.append(btn('Ключи доступа','shield',()=>run(accessKeys)));
 const grid=h('div',{class:'server-grid'});
 for(const s of state.servers){const r=state.resources.get(s.identifier),v=r?.resources;
  const usage=(label,value,limit,format)=>{const bounded=Number(limit)>0;const percent=value==null||!bounded?0:Math.max(0,Math.min(100,value/limit*100));return h('div',{class:'card-usage'},h('div',{class:'card-usage-label'},h('span',{},label),h('strong',{},value==null?'—':format(value))),h('div',{class:'card-usage-track'},h('span',{style:'width:'+percent+'%'})),h('small',{},bounded?'из '+format(limit):'без лимита'));};
  grid.append(h('button',{class:'server-card',onClick:()=>run(()=>selectServer(s))},h('div',{class:'card-top'},icon(isApps(s)?'code':s.name==='Proxy'?'network':'cube',29),h('strong',{},serverName(s)),h('span',{class:'status '+(r?.current_state||'')},stateName(r?.current_state))),h('div',{class:'card-meta'},h('span',{},icon('cube',14),runtime(s))),h('div',{class:'card-usage-grid'},usage('RAM',v?.memory_bytes,s.limits.memory*1024**2,bytes),usage('CPU',v?.cpu_absolute,s.limits.cpu,n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%'),usage('Диск',v?.disk_bytes,s.limits.disk*1024**2,bytes))));}
 root.append(grid);
 if(state.resourceAdmin)root.append(h('div',{class:'actions-line',style:'margin-bottom:16px'},btn('Настроить память системы','memory',()=>run(systemReserve))));
 const x=state.host;
 if(x){const stat=(title,used,total,free)=>h('div',{class:'host-stat'},h('span',{},title),h('strong',{},bytes(used)+' / '+bytes(total)),h('span',{},'Доступно: '+bytes(free)));root.insertBefore(h('section',{class:'host-panel vps-capacity','aria-label':'Свободные ресурсы VPS'},h('h3',{},'Ресурсы всего VPS'),h('div',{class:'host-grid'},stat('Оперативная память · занято / всего',x.used_bytes,x.total_bytes,x.available_bytes),stat('Диск · занято / всего',x.disk_used_bytes,x.disk_total_bytes,x.disk_total_bytes==null||x.disk_used_bytes==null?null:Math.max(0,x.disk_total_bytes-x.disk_used_bytes)),h('div',{class:'host-stat'},h('span',{},'Можно выделить окружениям'),h('strong',{},bytes(x.unallocated_server_bytes)),h('span',{},'RAM из бюджета серверов'))),h('p',{class:'subtle'},'Доступная RAM учитывает освобождаемый кэш Linux. Остаток бюджета — память, ещё не выделенная окружениям; это отдельный показатель.')),grid);}
 root.append(h('div',{class:'host-panel'},h('h3',{},'VPS · система и панель'),h('div',{class:'host-grid'},h('div',{class:'host-stat'},h('strong',{},bytes(x?.system_bytes)),h('span',{},'Ubuntu и системные процессы')),h('div',{class:'host-stat'},h('strong',{},bytes(x?.panel_bytes)),h('span',{},'Панель, база данных и службы')),h('div',{class:'host-stat'},h('strong',{},bytes(x?Math.max(0,x.reserve_budget_bytes-x.reserve_used_bytes):null)),h('span',{},'Свободно из резерва '+bytes(x?.reserve_budget_bytes)))),h('div',{class:'host-memory'},h('div',{class:'reserve-bar'},h('span',{class:'system-memory',style:'width:'+Math.min(100,(x?.system_bytes||0)/(x?.reserve_budget_bytes||1)*100)+'%'}),h('span',{class:'panel-memory',style:'width:'+Math.min(100,(x?.panel_bytes||0)/(x?.reserve_budget_bytes||1)*100)+'%'})),h('div',{class:'detail-row'},h('span',{},'Расход резерва: '+bytes(x?.reserve_used_bytes)+' из '+bytes(x?.reserve_budget_bytes)),h('span',{},'Всего RAM: '+bytes(x?.total_bytes)))),h('p',{class:'subtle'},'Обновление каждые 10 секунд. Память контейнеров исключена из расхода системы. Резерв — бюджет, а не жёсткий лимит.')));
 $('#content').replaceChildren(root);view={root};
}
async function poll(){
 if(pollBusy||!state.connected)return;pollBusy=true;
 try{
  const servers=state.overview?state.servers:state.selected?[state.selected]:[];
  if(state.selected?.is_installing||state.selected?.status==='installing'){const detail=await window.bebra.api({server:state.selected.identifier});Object.assign(state.selected,normalizeServer(detail.attributes));}
  await Promise.all(servers.map(async s=>{const r=await window.bebra.api({server:s.identifier,route:'/resources'});state.resources.set(s.identifier,r.attributes);}));
  if(Date.now()-lastHost>10000){try{state.host=await window.bebra.api({host:true});lastHost=Date.now();}catch{state.host=null;}}
  connectionStatus(true,'VPS подключён');renderNav();renderHeader();renderMetrics();view?.host?.();if(state.overview===true)renderOverview();
 }catch(e){connectionStatus(false,e.message);}
 finally{pollBusy=false;}
}
async function connectScreen(){
 if(!await canLeave())return;view?.dispose?.();view=null;await window.bebra.closeConsole();
 const config=await window.bebra.config();$('#metrics').hidden=true;$('#tabs').hidden=true;
 $('#server-header').replaceChildren(h('div',{class:'server-emblem'},icon('shield',24)),h('div',{class:'server-heading'},h('div',{class:'heading-line'},h('h1',{},'Подключение')),h('div',{class:'server-subtitle'},'Твой VPS. Безопасное соединение.')));
 const url=h('input',{value:config.url,type:'url',required:true,'aria-label':'Адрес панели'}),token=h('input',{type:'password',placeholder:'ptlc_…',required:true,autocomplete:'off','aria-label':'API-ключ'});
 const errors=h('p',{class:'inline-error','aria-live':'polite'});const submit=btn('Подключить VPS','check',()=>form.requestSubmit(),'primary');
 const form=h('form',{class:'connection-form',onSubmit:async e=>{e.preventDefault();submit.disabled=true;errors.textContent='';try{await window.bebra.connect({url:url.value.trim(),token:token.value.trim()});token.value='';await initialize();toast('VPS подключён');}catch(err){errors.textContent=err.message;}finally{submit.disabled=false;}}},field('Адрес панели',url),field('Клиентский API-ключ',token,document.documentElement.dataset.platform==='web'?'Ключ хранится на сервере панели только до завершения сессии. Браузер получает защищённую cookie.':'Ключ хранится локально в зашифрованном виде средствами Windows.'),errors,h('div',{class:'actions-line'},submit,btn('Создать API-ключ','external',()=>run(()=>window.bebra.openPanel('api')))));
 const box=h('section',{class:'connection-screen'},h('h2',{},config.connected?'Настройки подключения':'Подключи свой VPS'),h('p',{},'Укажи адрес Pterodactyl и клиентский API-ключ из настроек аккаунта. Пароль root и пароль от панели здесь не нужны.'),form);
 if(config.connected)box.append(h('div',{class:'actions-line'},btn('Назад к серверам','back',()=>run(()=>initialize())),btn('Отключить','close',()=>run(async()=>{if(await confirm('Отключить этот VPS?','Зашифрованный ключ будет удалён с этого компьютера. Сами серверы продолжат работать.','Отключить')){await window.bebra.disconnect();state.connected=false;connectionStatus(false,'Панель не подключена');await connectScreen();}}),'quiet')));
 $('#content').replaceChildren(box);
}
async function initialize(){
 const config=await window.bebra.config();state.connected=config.connected;
 if(!config.connected){connectionStatus(false,'Панель не подключена');await connectScreen();return;}
 try{
  const [result,account]=await Promise.all([window.bebra.api({}),window.bebra.api({management:true}).catch(()=>({resource_admin:false}))]);state.resourceAdmin=account.resource_admin;state.servers=result.data.map(x=>normalizeServer(x.attributes));
  if(!state.servers.length){$('#content').replaceChildren(empty('Серверов пока нет','Добавь сервер в своей панели Pterodactyl.','cube'));return;}
  const previous=state.selected?.identifier||localStorage.getItem('selected');const selected=state.servers.find(s=>s.identifier===previous)||state.servers.find(s=>s.name==='Lobby')||state.servers[0];
  state.connected=true;await selectServer(selected);
  $('#footer-info').textContent=''+state.servers.length+' окружений · v'+config.version;
 }catch(e){connectionStatus(false,e.message);$('#content').replaceChildren(empty('Не удалось подключиться',e.message,'network'),btn('Настроить подключение','settings',()=>run(connectScreen),'primary'));}
}
window.bebra.onConsole(packet=>{
 if(packet.server!==state.selected?.identifier)return;
 if(packet.event==='connected'){const logs=state.logs.get(packet.server);if(logs)logs.length=0;}
 if(['console output','install output','daemon message','daemon error'].includes(packet.event))packet={...packet,entries:appendLog(state.logs,packet.server,packet.args?.[0]||'',packet.event==='daemon message'?'system':packet.event==='daemon error'?'error':'')};
 if(packet.event==='stats'){try{const stats=JSON.parse(packet.args[0]);const previous=state.resources.get(packet.server)||{};state.resources.set(packet.server,{...previous,resources:stats});renderMetrics();}catch{}}
 if(packet.event==='status'){const r=state.resources.get(packet.server)||{};state.resources.set(packet.server,{...r,current_state:packet.args[0]});renderHeader();renderMetrics();renderNav();}
 if(['console output','daemon message'].includes(packet.event))parsePlayers(cleanLog(packet.args?.[0]||''));
 view?.onPacket?.(packet);
});
window.bebra.onCloseRequest(()=>run(async()=>{if(await canLeave())await window.bebra.window('close');}));
const uploadProgress=h('div',{class:'transfer-progress',hidden:true,role:'status'});document.body.append(uploadProgress);
window.bebra.onUploadProgress(p=>{uploadProgress.hidden=!!p.done;if(!p.done)uploadProgress.textContent='Загрузка '+p.name+' · '+bytes(p.sent)+' из '+bytes(p.total)+' · '+(p.total?Math.floor(p.sent/p.total*100):100)+'%';});
for(const b of document.querySelectorAll('[data-window]'))b.addEventListener('click',()=>run(async()=>{if(b.dataset.window==='close'&&!await canLeave())return;await window.bebra.window(b.dataset.window);}));
$('#overview-button').append(icon('grid',21));$('#overview-button').onclick=()=>run(overview);$('#brand').onclick=()=>run(overview);
$('#panel-button').append(icon('external',20));$('#panel-button').onclick=()=>run(()=>window.bebra.openPanel('home'));
$('#settings-button').append(icon('settings',20));$('#settings-button').onclick=()=>run(connectScreen);
$('#account-button').onclick=()=>run(()=>window.bebra.openPanel('account'));
$('#refresh-all').onclick=()=>run(async()=>{if(refreshing)return;refreshing=true;try{if(!await canLeave())return;await initialize();}finally{refreshing=false;}});
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();if(state.tab==='console')view?.focus?.();}});
window.addEventListener('unhandledrejection',e=>{e.preventDefault();toast(e.reason?.message||'Не удалось выполнить операцию.','error');});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect=view?.dropFiles?'copy':'none';document.body.classList.toggle('file-drag',!!view?.dropFiles);}});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('file-drag');});
document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('file-drag');if(!e.dataTransfer?.files.length)return;if(!view?.dropFiles){toast('Выбери сервер и открой «Файлы» или «Плагины», затем перетащи файлы сюда.');return;}const droppedFiles=Array.from(e.dataTransfer.files);run(()=>view.dropFiles(droppedFiles));});
setInterval(poll,6000);
run(initialize);





