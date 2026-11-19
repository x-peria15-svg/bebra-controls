import {h,btn,ibtn,bytes,date,empty,toast,run,confirm,promptFields,field,serverName,runtime,isPumpkin,isApps,stateName} from './util.js';
import {icon} from './icons.js';
import {configEditor,validateConfig} from './config-editor.js';
import {transferDialog} from './workspace.js';
function section(title,subtitle,actions=[]){const body=h('div',{class:'section-body'});return {root:h('section',{class:'section-panel'},h('div',{class:'section-heading'},h('div',{},h('h2',{},title),h('p',{},subtitle)),h('div',{class:'section-actions'},actions)),body),body};}
function loading(body){body.replaceChildren(h('div',{class:'initial-loading'},h('span',{class:'spinner'}),'Загрузка…'));}
function errorView(body,e){body.replaceChildren(empty('Не удалось загрузить',e.message,'info'));}
export function filesView(ctx,plugins=false){
 let directory=plugins?'/plugins':'/',disposed=false,dirty=false,currentFile=null,loadGeneration=0,editor=null;
 const view=section(plugins?'Плагины':'Файлы сервера',plugins?(isPumpkin(ctx.state.selected)?'Нативные плагины Pumpkin — .wasm. JAR требуют настроенного PatchBukkit.':'Загружай свои плагины и редактируй их настройки.'):'Загружай ядра, конфигурации и миры.',[
  btn('Новая папка','plus',()=>run(async()=>{const data=await promptFields('Новая папка',[{name:'name',label:'Название папки',placeholder:'Например, plugins'}],'Создать');if(!data)return;await ctx.api('/files/create-folder','POST',{root:directory,name:data.name});await load(directory);})),
  btn('Загрузить','upload',()=>run(async()=>{const r=await window.bebra.upload({server:ctx.server,directory,plugins});if(!r.canceled){toast('Загружено файлов: '+r.files.length);await load(directory);}}),'primary'),
  ibtn('Обновить файлы','restart',()=>run(()=>load(directory))),
 ]);
 const breadcrumb=h('div',{class:'path-bar'});view.root.insertBefore(breadcrumb,view.body);
 const safeLeave=async()=>!dirty||await confirm('Есть несохранённые изменения','Закрыть редактор и потерять изменения?','Закрыть без сохранения');
 async function edit(file,sourceDirectory=directory){
  if(!await safeLeave())return;
  if(file.size>2*1024*1024||/\.(jar|wasm|zip|gz|7z|rar|png|jpg|ico|mca|pump|dat|db)$/i.test(file.name)){await window.bebra.download({server:ctx.server,file:join(sourceDirectory,file.name)});return;}
  const generation=++loadGeneration,name=join(sourceDirectory,file.name);loading(view.body);
  try{const text=await ctx.api('/files/contents','GET',undefined,{file:name});if(disposed||generation!==loadGeneration)return;
   currentFile=name;dirty=false;
   editor?.destroy();const area=h('div',{class:'config-editor','aria-label':'Редактор '+file.name});
   editor=configEditor(area,file.name,text,()=>{dirty=true;mark.textContent='Не сохранено';});
   area.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save.click();}});
   const mark=h('span',{class:'subtle'},'Все изменения сохранены');
   const save=btn('Сохранить','save',()=>run(async()=>{const snapshot=editor.value,validation=validateConfig(file.name,snapshot);if(validation.supported&&!validation.valid){mark.textContent='Ошибка синтаксиса: '+validation.error;toast('Исправь синтаксис перед сохранением.','error');return;}save.disabled=true;try{await ctx.api('/files/write','POST',snapshot,{file:name});dirty=editor.value!==snapshot;mark.textContent=dirty?'Есть новые несохранённые изменения':'Все изменения сохранены';toast('Файл сохранён');}finally{save.disabled=false;}}),'primary');
   view.body.replaceChildren(h('div',{class:'file-editor'},h('div',{class:'editor-heading'},ibtn('К списку файлов','back',()=>run(()=>load(directory))),h('strong',{},file.name),mark,save),area));
  }catch(e){if(!disposed&&generation===loadGeneration)errorView(view.body,e);}
 }
 function join(root,name){return (root==='/'?'':root)+'/'+name;}
 async function load(next){
  if(!await safeLeave())return;editor?.destroy();editor=null;const generation=++loadGeneration;dirty=false;currentFile=null;directory=next;const sourceDirectory=next;
  breadcrumb.replaceChildren(ibtn('Папка выше','back',()=>run(()=>load(directory.split('/').slice(0,-1).join('/')||'/'))),h('span',{},directory));
  loading(view.body);
  try{const result=await ctx.api('/files/list','GET',undefined,{directory:sourceDirectory});if(disposed||generation!==loadGeneration)return;
   const list=result.data.map(x=>x.attributes).sort((a,b)=>Number(a.is_file)-Number(b.is_file)||a.name.localeCompare(b.name));
   if(!list.length){view.body.replaceChildren(empty(plugins?'Плагины ещё не загружены':'Папка пуста',plugins?'Нажми «Загрузить», чтобы добавить свой плагин.':'Загрузи файлы или создай новую папку.',plugins?'puzzle':'folder'));return;}
   const table=h('table',{class:'file-list'},h('thead',{},h('tr',{},...['Название','Размер','Изменён',''].map(t=>h('th',{},t)))));
   const tbody=h('tbody');
   for(const f of list){
    const open=()=>run(()=>f.is_file?edit(f,sourceDirectory):load(join(sourceDirectory,f.name)));
    const actions=h('div',{class:'row-actions'},f.is_file?ibtn('Скачать '+f.name,'download',()=>run(()=>window.bebra.download({server:ctx.server,file:join(sourceDirectory,f.name)}))):null,ibtn('Переименовать '+f.name,'settings',()=>run(async()=>{const d=await promptFields('Переименовать',[{name:'name',label:'Новое имя',value:f.name}]);if(d){await ctx.api('/files/rename','PUT',{root:sourceDirectory,files:[{from:f.name,to:d.name}]});await load(sourceDirectory);}})),ibtn('Удалить '+f.name,'trash',()=>run(async()=>{if(await confirm('Удалить '+f.name+'?',f.is_file?'Файл будет удалён с VPS.':'Папка будет удалена вместе со всем содержимым.','Удалить',true)){await ctx.api('/files/delete','POST',{root:sourceDirectory,files:[f.name]});await load(sourceDirectory);}})));
    if(f.is_file&&ctx.state.resourceAdmin)actions.prepend(ibtn('Скопировать или перенести '+f.name,'folder',()=>run(()=>transferDialog(ctx.state,{kind:'server',server:ctx.server,path:join(sourceDirectory,f.name)},()=>load(sourceDirectory)))));
    tbody.append(h('tr',{},h('td',{},h('button',{class:'file-name',onClick:open},icon(f.is_file?'file':'folder',18),f.name)),h('td',{},f.is_file?bytes(f.size):'Папка'),h('td',{},date(f.modified_at)),h('td',{},actions)));
   }table.append(tbody);view.body.replaceChildren(table);
  }catch(e){if(disposed||generation!==loadGeneration)return;if(plugins&&e.message.includes('не найден'))view.body.replaceChildren(empty('Папка plugins ещё не создана','Создай папку, затем загрузи плагины.','puzzle'),btn('Создать папку plugins','plus',()=>run(async()=>{await ctx.api('/files/create-folder','POST',{root:'/',name:'plugins'});await load('/plugins');}),'primary'));else errorView(view.body,e);}
 }
 view.root.prepend(h('div',{class:'drop-hint'},'Перетащи файлы из Проводника сюда — они загрузятся в открытую папку. Размер ограничен квотой и свободным местом. Существующие файлы с теми же именами заменяются.'));
 async function dropFiles(files){if(!await safeLeave())return;const r=await window.bebra.uploadDropped({server:ctx.server,directory,plugins,files:Array.from(files)});toast('Загружено файлов: '+r.files.length);await load(directory);}
 load(directory);return {...view,dropFiles,canLeave:safeLeave,dispose(){disposed=true;editor?.destroy();}};
}
export function backupsView(ctx){
 let disposed=false;
 const create=btn('Создать копию','plus',()=>run(async()=>{const d=await promptFields('Новая резервная копия',[{name:'name',label:'Название',value:'Ручная копия '+new Date().toLocaleDateString('ru-RU')}],'Создать');if(!d)return;create.disabled=true;try{await ctx.api('/backups','POST',{name:d.name,is_locked:false});toast('Резервное копирование запущено');await load();}finally{create.disabled=false;}}),'primary');
 const view=section('Резервные копии','Ежедневные локальные копии около 04:00 по Москве. Важные копии скачивай на компьютер.',[create,ibtn('Обновить копии','restart',()=>load())]);
 async function load(){loading(view.body);try{const r=await ctx.api('/backups');if(disposed)return;view.body.replaceChildren();
  if(!r.data.length){view.body.append(empty('Резервных копий пока нет','Создай копию перед обновлением ядра или изменением мира.','archive'));return;}
  for(const {attributes:b} of r.data){const status=b.completed_at?(b.is_successful?'Готова':'Ошибка'):'Создаётся';
   view.body.append(h('div',{class:'backup-card'},h('span',{class:'backup-icon'},icon('archive',21)),h('div',{class:'item-info'},h('strong',{},b.name),h('p',{},date(b.created_at)+' · '+bytes(b.bytes))),h('span',{class:'tag '+(b.is_successful?'good':'')},status),b.is_successful?ibtn('Скачать копию','download',()=>run(()=>window.bebra.download({server:ctx.server,backup:b.uuid}))):null,b.is_successful?ibtn('Восстановить копию','restart',()=>run(async()=>{if(await confirm('Восстановить сервер из копии?','Текущие файлы будут заменены. Сначала останови сервер и сохрани нужные данные.','Восстановить',true)){await ctx.api('/backups/'+b.uuid+'/restore','POST',{truncate:true});toast('Восстановление запущено');}})):null,ibtn('Удалить копию','trash',()=>run(async()=>{if(await confirm('Удалить резервную копию?',b.name,'Удалить',true)){await ctx.api('/backups/'+b.uuid,'DELETE');await load();}}))));
  }
 }catch(e){errorView(view.body,e);}}
 load();return {...view,dispose(){disposed=true;}};
}
export function schedulesView(ctx){
 let disposed=false;
 const view=section('Расписание','Управляй командами, перезапусками и копиями по времени VPS: Москва.',[
  btn('Добавить задачу','plus',()=>run(async()=>{
   const d=await promptFields('Новое расписание',[{name:'name',label:'Название',value:'Ежедневная задача'},{name:'hour',label:'Час по Москве (0–23)',type:'number',value:'5',min:0,max:23},{name:'minute',label:'Минута (0–59)',type:'number',value:'0',min:0,max:59},{name:'command',label:'Команда сервера',value:'save-all',help:'Выполняется ежедневно. Для выключенного сервера задача пропускается.'}],'Создать');if(!d)return;
   const r=await ctx.api('/schedules','POST',{name:d.name,minute:d.minute,hour:d.hour,day_of_month:'*',month:'*',day_of_week:'*',is_active:true,only_when_online:true});
   try{await ctx.api('/schedules/'+r.attributes.id+'/tasks','POST',{action:'command',payload:d.command,time_offset:0,continue_on_failure:false});}catch(e){await ctx.api('/schedules/'+r.attributes.id,'DELETE');throw e;}
   toast('Расписание создано');await load();
  }),'primary'),ibtn('Обновить расписание','restart',()=>load()),
 ]);
 async function load(){loading(view.body);try{const r=await ctx.api('/schedules');if(disposed)return;view.body.replaceChildren(h('div',{class:'notice neutral'},'Общий автоматический бэкап настроен на VPS отдельно от расписаний панели: ежедневно около 04:00. При нехватке места он пропускается.'));
  if(!r.data.length)view.body.append(empty('Своих расписаний пока нет','Добавь ежедневную команду. Более сложное расписание можно настроить в веб-панели.','calendar'));
  for(const {attributes:s}of r.data)view.body.append(h('div',{class:'schedule-card'},h('span',{class:'backup-icon'},icon('calendar',21)),h('div',{class:'item-info'},h('strong',{},s.name),h('p',{},'Следующий запуск: '+date(s.next_run_at))),h('span',{class:'tag '+(s.is_active?'good':'')},s.is_active?'Включено':'Выключено'),ibtn('Выполнить сейчас','play',()=>run(async()=>{await ctx.api('/schedules/'+s.id+'/execute','POST',{});toast('Задача отправлена на выполнение');})),ibtn('Удалить расписание','trash',()=>run(async()=>{if(await confirm('Удалить расписание?',s.name,'Удалить',true)){await ctx.api('/schedules/'+s.id,'DELETE');await load();}}))));
 }catch(e){errorView(view.body,e);}}
 load();return {...view,dispose(){disposed=true;}};
}
export function propertiesView(ctx){
 let disposed=false;const s=ctx.state.selected;
 const view=section('Свойства сервера','Параметры запуска и выделенные ресурсы.',ctx.state.resourceAdmin?[btn('Лимиты ресурсов','cpu',()=>run(()=>ctx.selectTab('resources')))]:[]);
 async function load(){loading(view.body);try{const r=await ctx.api('/startup');if(disposed)return;
  const attrs=r.meta||{},left=h('div'),right=h('div');
  left.append(h('div',{class:'notice'},isPumpkin(s)?'Pumpkin работает напрямую на Rust. Флаги JVM и eula.txt ему не нужны. Игровые настройки находятся в pumpkin.toml.':isApps(s)?'Запуск задаётся в start.sh. Здесь доступны Node.js и Python.':s.name==='Proxy'?'Velocity принимает игроков и направляет их в лобби. Маршруты настраиваются в velocity.toml.':'Загрузи свой server.jar через раздел «Файлы».'));
  left.append(field('Команда запуска',h('textarea',{rows:'3',readonly:'',value:attrs.startup_command||attrs.raw_startup_command||s.description,spellcheck:'false'})));
  for(const {attributes:v} of r.data||[]){const input=h('input',{value:v.server_value||v.default_value,disabled:!v.is_editable});left.append(field(v.name,input,v.description),v.is_editable?btn('Сохранить '+v.name,'save',()=>run(async()=>{await ctx.api('/startup/variable','PUT',{key:v.env_variable,value:input.value});toast('Параметр сохранён. Перезапусти сервер для применения.');})):null);}
  if(attrs.docker_images&&Object.keys(attrs.docker_images).length>1){const select=h('select');for(const [name,image] of Object.entries(attrs.docker_images))select.append(h('option',{value:image},name));select.value=attrs.docker_image;left.append(field('Среда запуска',select),btn('Сменить среду','check',()=>run(async()=>{if(await confirm('Сменить среду запуска?','Новая среда применится при следующем запуске.')){await ctx.api('/startup/docker-image','PUT',{docker_image:select.value});toast('Среда запуска изменена');}})));}
  right.append(h('h3',{},'Выделенные ресурсы'),...[
   ['Оперативная память',bytes(s.limits.memory*1024**2)],['CPU, максимум',s.limits.cpu+'% ('+(s.limits.cpu/100)+' vCPU)'],['Диск',bytes(s.limits.disk*1024**2)],['Порт',s.allocation.port+' TCP'],['Адрес',s.allocation.ip],['Ядро',runtime(s)],['Резервных копий',s.feature_limits.backups],
  ].map(([a,b])=>h('div',{class:'detail-row'},h('span',{},a),h('span',{},b))),h('div',{class:'notice neutral',style:'margin-top:25px'},'CPU общий для всех контейнеров. Администратор VPS может изменить выделение во вкладке «Ресурсы».'));
  view.body.replaceChildren(h('div',{class:'properties-grid'},left,right));
 }catch(e){errorView(view.body,e);}}load();return {...view,dispose(){disposed=true;}};
}
export function playersView(ctx){
 const view=section('Игроки','Список запрашивается у работающего сервера командой list.',[btn('Запросить список','restart',()=>run(async()=>{await ctx.api('/command','POST',{command:'list'});toast('Запрос отправлен. Ответ появится здесь и в консоли.');}))]);
 function update(){const data=ctx.state.players.get(ctx.server);if(!data){view.body.replaceChildren(empty('Список ещё не запрошен','Нажми «Запросить список». Сервер должен быть включён.','users'));return;}
  view.body.replaceChildren(h('p',{class:'players-summary'},'Онлайн: '+data.count+' · обновлено '+date(data.timestamp)),data.names.length?h('div',{class:'player-list'},...data.names.map(name=>h('div',{class:'player-chip'},name))):empty(data.count===0?'Игроков пока нет':'Сервер ответил',data.count===0?'Когда игроки подключатся, запроси список ещё раз.':'Полный ответ доступен в консоли.','users'));
 }update();return {...view,onPlayers:update};
}

