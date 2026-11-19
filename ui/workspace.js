import {h,btn,bytes,toast,run,dialog,field,confirm,serverName,isApps} from './util.js';
const api=(route,method='GET',body)=>window.bebra.api({management:true,route,method,body});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function watch(id,status){for(let i=0;i<600;i++){const job=await api('/operations/'+id);status.textContent=job.status==='queued'?'В очереди…':'Выполняется на VPS…';if(job.status==='failed')throw Error(job.error);if(job.status==='done'){status.textContent=job.result.message;toast(job.result.message);return;}await sleep(1500);}throw Error('Операция продолжается. Проверь журнал задач, прежде чем повторять.');}
export async function transferDialog(state,source,onDone=()=>{}){
 const select=h('select',{'aria-label':'Назначение'},h('option',{value:'shared'},'Общие файлы'),...state.servers.map(s=>h('option',{value:s.identifier},serverName(s))));
 const path=h('input',{required:true,value:'/'+source.path.split('/').at(-1)}),move=h('input',{type:'checkbox'}),status=h('p',{class:'subtle','aria-live':'polite'});
 const form=h('form',{class:'form-grid'},h('p',{},'Файл: '+source.path),field('Куда',select),field('Полный путь назначения',path,'Папка должна существовать. Существующие файлы не заменяются.'),h('label',{class:'permission-row'},move,'Удалить исходник после проверки копии (перенос)'),status);
 const start=btn('Выполнить','folder',()=>form.requestSubmit(),'primary'),d=dialog('Копирование и перенос',form,[start]);
 form.addEventListener('submit',e=>{e.preventDefault();if(start.disabled)return;run(async()=>{if(move.checked&&!await confirm('Перенести файл?', 'Исходник будет удалён только после проверки копии.','Перенести'))return;start.disabled=true;try{const target={kind:select.value==='shared'?'shared':'server',server:select.value==='shared'?undefined:select.value,path:path.value};const job=await api('/transfers','POST',{source,target,move:move.checked});await watch(job.id,status);d.close();await onDone();}catch(error){status.textContent=error.message;}finally{start.disabled=false;}});});
}
export function workspaceView(state,domains=false){
 let disposed=false;const body=h('div',{class:'section-body'}),root=h('section',{class:'section-panel'},h('div',{class:'section-heading'},h('div',{},h('h2',{},domains?'Домены и HTTPS':'Общие файлы'),h('p',{},domains?'Подключение домена к сайту в выбранном окружении.':'Архивы, сборки и плагины отдельно от серверов. Доступно администратору.')),btn('Обновить','restart',()=>run(load))),body);
 async function load(){const data=await api('/operations');if(disposed)return;body.replaceChildren();
  if(domains){const websites=state.servers.filter(isApps),select=h('select',{'aria-label':'Окружение сайта'},...websites.map(s=>h('option',{value:s.identifier},serverName(s))));
   const name=h('input',{placeholder:'site.example.com',required:true,'aria-label':'Домен'}),status=h('p',{class:'subtle','aria-live':'polite'}),form=h('form',{class:'form-grid'},field('Окружение сайта',select),field('Домен',name),h('p',{class:'notice neutral'},'Сначала направь DNS A на публичный IP этого VPS. Удали чужие AAAA-записи и временно отключи проксирование DNS. Сайт должен слушать 0.0.0.0 и выделенный порт. Выпуск сертификата начнётся после проверки DNS; существующий домен панели не заменяется.'),status),submit=btn('Подключить HTTPS','shield',()=>form.requestSubmit(),'primary');submit.disabled=!websites.length;form.append(submit);
   form.addEventListener('submit',e=>{e.preventDefault();if(submit.disabled)return;run(async()=>{submit.disabled=true;try{const job=await api('/domains','POST',{server:select.value,domain:name.value.trim()});await watch(job.id,status);await load();}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}});});body.append(form);
   for(const item of data.domains)body.append(h('div',{class:'access-person'},h('strong',{},item.domain),h('span',{class:'tag'},item.https?'HTTPS включён':'Ожидание')));
  }else{body.append(h('p',{class:'notice neutral'},'Чтобы добавить файл, открой «Файлы» любого сервера, нажми действие копирования и выбери «Общие файлы». Для папки сначала создай архив. Загрузка с компьютера доступна через обычную вкладку файлов сервера.'));
   if(!data.files.length)body.append(h('p',{class:'subtle'},'Общее хранилище пока пусто.'));
   for(const file of data.files)body.append(h('div',{class:'access-person'},h('strong',{},file.name),h('span',{},bytes(file.size)),btn('Копировать / перенести','folder',()=>run(()=>transferDialog(state,{kind:'shared',path:'/'+file.name},load)))));
  }
  if(data.jobs?.length){body.append(h('h3',{},'Последние задачи'));for(const j of data.jobs)body.append(h('p',{class:'subtle'},({queued:'В очереди',running:'Выполняется',done:'Готово',failed:'Ошибка'}[j.status]||j.status)+' · '+(j.error||j.result?.message||j.id)));}
 }
 run(load).catch(()=>{});return {root,dispose(){disposed=true;}};
}
