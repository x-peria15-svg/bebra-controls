import {h,btn,field,bytes,run,toast,confirm} from './util.js';

export function allowed(server,permission){return server?.user_permissions?.includes('*')||server?.user_permissions?.includes(permission);}
function panel(title,description){const body=h('div',{class:'section-body'});return {root:h('section',{class:'section-panel'},h('div',{class:'section-heading'},h('div',{},h('h2',{},title),h('p',{},description))),body),body};}
export function resourcesView(ctx){
 const v=panel('Ресурсы сервера','Перед сохранением останови сервер. Изменения применяются к контейнеру на VPS.');let disposed=false,dirty=false;
 async function load(){try{
  const d=await window.bebra.api({management:true,server:ctx.server,route:'/limits'});if(disposed)return;
  const controls={};const form=h('form',{class:'resource-form'});
  const specs=[['memory','Память, МБ',128,65536,d.limits.memory,'1024 МБ = 1 ГБ'],['cpu','CPU, %',1,800,d.limits.cpu,'100% = 1 ядро, 800% = 8 ядер. CPU общий, это верхний предел.'],['disk','Диск, МБ',256,204800,d.limits.disk,'Лимит не может быть меньше занятого места.'],['swap','Swap, МБ',0,4096,d.limits.swap,'0 — не использовать swap для контейнера.'],['io','Приоритет диска',10,1000,d.limits.io,'Обычное значение: 500.'],['backups','Резервные копии, шт.',0,30,d.backups],['databases','Базы данных, шт.',0,20,d.databases??0],['allocations','Дополнительные порты, шт.',0,20,d.allocations??0]];
  const inputs=h('div',{class:'management-grid'});
  for(const [key,label,min,max,value,help]of specs){const input=h('input',{type:'number',min,max,step:1,required:true,value,onInput:()=>dirty=true});controls[key]=input;inputs.append(field(label,input,help));}
  const status=h('p',{class:'inline-error','aria-live':'polite'});
  const save=btn('Сохранить ресурсы','save',()=>form.requestSubmit(),'primary');
  form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{const body=Object.fromEntries(Object.entries(controls).map(([k,n])=>[k,Number(n.value)]));
   const summary=`Память: ${body.memory} МБ · CPU: ${body.cpu}% · Диск: ${body.disk} МБ · Копий: ${body.backups}. Сервер останется выключенным.`;
   if(!await confirm('Применить выделение ресурсов?',summary,'Применить'))return;
   save.disabled=true;status.textContent='';try{const result=await window.bebra.api({management:true,server:ctx.server,route:'/limits',method:'POST',body});dirty=false;await ctx.refreshServer();toast(result.synced?'Ресурсы сохранены. Теперь можно включить сервер.':'Лимиты сохранены в панели. Синхронизация с узлом не подтверждена — применятся при следующем запуске.');await load();}catch(e){status.textContent=e.message;}finally{save.disabled=false;}
  });});
  form.append(h('p',{class:'notice neutral'},'Выделено серверам: '+bytes(d.allocated_memory_mib*1048576)+' из '+bytes(d.physical_memory_mib*1048576)+'. Настроенный резерв системы — '+bytes(d.system_reserve_mib*1048576)+'. Неиспользованная память не занимается заранее.'),inputs,status,save);for(const b of form.querySelectorAll('button'))b.type='button';v.body.replaceChildren(form);
 }catch(e){if(!disposed)v.body.replaceChildren(h('p',{class:'inline-error'},e.message));}}
 load();return {...v,canLeave:async()=>!dirty||await confirm('Есть несохранённые изменения','Выйти без сохранения ресурсов?','Выйти'),dispose(){disposed=true;}};
}
export function creationView(onCreated){
 const v=panel('Новое окружение','Отдельные файлы, ресурсы, консоль и права доступа. Новое окружение создаётся выключенным.');let disposed=false,dirty=false;
 (async()=>{try{const d=await window.bebra.api({management:true,route:'/templates'});if(disposed)return;
  const name=h('input',{required:true,minlength:2,maxlength:80,placeholder:'Например, Discord-бот'}),type=h('select'),memory=h('input',{type:'number',required:true,min:128,max:65536,value:512}),cpu=h('input',{type:'number',required:true,min:1,max:800,value:100}),disk=h('input',{type:'number',required:true,min:256,max:204800,value:2048}),image=h('input',{placeholder:'ghcr.io/…/image:tag'}),startup=h('input',{value:'bash start.sh'}),publicPort=h('input',{type:'checkbox'});
  for(const [key,t]of Object.entries(d.templates))type.append(h('option',{value:key},t.title));
  const custom=h('div',{class:'management-grid',hidden:true},field('Docker-образ',image,'Образ должен поддерживать Pterodactyl: пользователя контейнера, /home/container и команду запуска. Обычный образ nginx/postgres без адаптации не гарантируется.'),field('Команда запуска',startup));
  type.addEventListener('change',()=>{custom.hidden=type.value!=='custom';image.required=type.value==='custom';startup.required=type.value==='custom';});
  const error=h('p',{class:'inline-error','aria-live':'polite'}),form=h('form'),requestId=crypto.randomUUID();
  const create=btn('Создать окружение','plus',()=>form.requestSubmit(),'primary');
  form.addEventListener('input',()=>dirty=true);
  form.append(h('p',{class:'notice neutral'},'Не распределено: '+bytes(d.memory_free_mib*1048576)+' RAM и '+bytes(d.disk_free_mib*1048576)+' диска. Если памяти не хватает, сначала уменьши лимит другого сервера.'),h('div',{class:'management-grid'},field('Название',name),field('Тип окружения',type),field('Память, МБ',memory),field('CPU, %',cpu,'100% = одно ядро'),field('Диск, МБ',disk)),custom,h('label',{class:'permission-row'},publicPort,'Публичный порт: разрешить прямое подключение из интернета'),h('p',{class:'subtle'},'По умолчанию порт внутренний. Ботам исходящего доступа обычно достаточно. Для сайта или прямого подключения к Minecraft нужен публичный порт. Для включения в Velocity маршруты настраиваются отдельно.'),error,h('div',{class:'actions-line'},create));
  form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
   const body={request_id:requestId,name:name.value.trim(),template:type.value,memory:Number(memory.value),cpu:Number(cpu.value),disk:Number(disk.value),public:publicPort.checked,...(type.value==='custom'?{image:image.value.trim(),startup:startup.value.trim()}:{})};
   if(!await confirm('Создать '+body.name+'?',`${d.templates[body.template].title}. RAM: ${body.memory} МБ, CPU: ${body.cpu}%, диск: ${body.disk} МБ. ${body.public?'Порт будет доступен из интернета.':'Порт доступен только внутри VPS.'}`,'Создать'))return;
   create.disabled=true;error.textContent='';try{const result=await window.bebra.api({management:true,route:'/environments',method:'POST',body});dirty=false;toast('Окружение создано. Загрузи файлы проекта перед запуском.');await onCreated(result.identifier);}catch(e){error.textContent=e.message;}finally{create.disabled=false;}
  });});for(const b of form.querySelectorAll('button'))b.type='button';v.body.replaceChildren(form);
 }catch(e){if(!disposed)v.body.replaceChildren(h('p',{class:'inline-error'},e.message));}})();
 return {...v,canLeave:async()=>!dirty||await confirm('Выйти из создания окружения?','Введённые параметры не будут сохранены.','Выйти'),dispose(){disposed=true;}};
}
const groups={
 'Консоль и питание':{'websocket.connect':'Просмотр консоли и статистики','control.console':'Отправка команд','control.start':'Запуск','control.stop':'Остановка','control.restart':'Перезапуск'},
 'Файлы':{'file.read':'Список файлов','file.read-content':'Чтение и скачивание','file.create':'Загрузка файлов и папок','file.update':'Редактирование','file.delete':'Удаление','file.archive':'Архивы','file.sftp':'SFTP'},
 'Копии':{'backup.read':'Список копий','backup.create':'Создание','backup.download':'Скачивание всех данных в копии','backup.delete':'Удаление копий','backup.restore':'Восстановление с заменой файлов'},
 'Расписание':{'schedule.read':'Просмотр','schedule.create':'Создание','schedule.update':'Изменение и выполнение','schedule.delete':'Удаление'},
 'Запуск и настройки':{'startup.read':'Просмотр запуска','startup.update':'Изменение переменных','startup.docker-image':'Смена Docker-образа','settings.rename':'Переименование','settings.reinstall':'Переустановка сервера','activity.read':'Журнал действий'},
 'Порты':{'allocation.read':'Просмотр','allocation.create':'Добавление','allocation.update':'Изменение','allocation.delete':'Удаление'},
 'Базы данных':{'database.read':'Просмотр','database.create':'Создание','database.update':'Изменение пароля','database.delete':'Удаление','database.view_password':'Просмотр пароля'},
 'Управление людьми':{'user.read':'Просмотр людей и прав','user.create':'Добавление людей','user.update':'Изменение чужих прав','user.delete':'Отзыв доступа'},
};
export function accessView(ctx){
 const v=panel('Доступ к серверу','Права действуют только для выбранного сервера. Вход — через личный аккаунт и личный API-ключ.');let disposed=false,dirty=false;
 const can=p=>allowed(ctx.state.selected,p);
 async function edit(user){
  dirty=false;const email=h('input',{type:'email',required:true,value:user?.email||'',disabled:!!user,autocomplete:'off','aria-label':'Email пользователя'});
  const checks=new Map(),form=h('form'),notice=h('p',{class:'notice neutral'},'Доступ к файлам, копиям и консоли может раскрывать конфигурации и секреты сервера. Права управления людьми позволяют делегировать доступ. Лимиты VPS здесь никому не выдаются.');
  const permissions=h('div',{class:'permission-groups'});
  for(const [title,items]of Object.entries(groups)){const box=h('fieldset',{class:'permission-group'},h('legend',{},title));for(const [key,label]of Object.entries(items)){
   if(!can(key))continue;const check=h('input',{type:'checkbox',checked:user?.permissions?.includes(key)||key==='websocket.connect',disabled:key==='websocket.connect',onChange:()=>dirty=true});checks.set(key,check);box.append(h('label',{class:'permission-row'},check,label));
  }if(box.children.length>1)permissions.append(box);}
  const preset=(keys)=>{for(const [key,input]of checks)input.checked=key==='websocket.connect'||keys.includes(key);dirty=true;};
  const error=h('p',{class:'inline-error','aria-live':'polite'}),save=btn(user?'Сохранить права':'Предоставить доступ','check',()=>form.requestSubmit(),'primary');
  form.append(field('Email',email,user?'Аккаунт остаётся прежним.':'Если аккаунта ещё нет, панель создаст его и отправит письмо для входа при настроенной почте.'),notice,h('div',{class:'actions-line'},btn('Наблюдатель',null,()=>preset([])),btn('Оператор',null,()=>preset(['control.start','control.stop','control.restart'])),btn('Работа с файлами',null,()=>preset(['file.read','file.read-content','file.create','file.update']))),permissions,error,h('div',{class:'actions-line'},save,btn('Отмена','back',()=>run(async()=>{if(!dirty||await confirm('Отменить изменения?','Выбранные права не будут сохранены.','Отменить изменения')){dirty=false;await load();}}))));
  form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
   const chosen=[...checks].filter(([,c])=>c.checked).map(([p])=>p);
   if(!await confirm(user?'Изменить права пользователя?':'Предоставить доступ?',`${email.value}: ${chosen.length} разрешений для ${ctx.state.selected.name}.`,'Применить'))return;
   save.disabled=true;try{await ctx.api('/users'+(user?'/'+user.uuid:''),'POST',{...(user?{}:{email:email.value.trim()}),permissions:chosen});dirty=false;toast('Права сохранены');await load();}catch(e){error.textContent=e.message;}finally{save.disabled=false;}
  });});for(const b of form.querySelectorAll('button'))b.type='button';v.body.replaceChildren(form);
 }
 async function load(){try{const r=await ctx.api('/users');if(disposed)return;const box=h('div');
  if(can('user.create'))box.append(btn('Добавить человека','plus',()=>run(()=>edit(null)),'primary'));
  box.append(h('p',{class:'subtle'},'Владелец сервера сохраняет полный доступ. У каждого приглашённого — только отмеченные разрешения.'));
  if(!r.data.length)box.append(h('p',{},'Дополнительных пользователей пока нет.'));
  for(const {attributes:u}of r.data)box.append(h('div',{class:'access-person'},h('div',{},h('strong',{},u.email),h('p',{class:'subtle'},(u.username||'')+' · '+u.permissions.length+' разрешений')),h('div',{class:'actions-line'},can('user.update')?btn('Права','settings',()=>run(()=>edit(u))):null,can('user.delete')?btn('Отозвать доступ','trash',()=>run(async()=>{if(await confirm('Отозвать доступ?',u.email+' потеряет доступ только к этому серверу.','Отозвать')){await ctx.api('/users/'+u.uuid,'DELETE');toast('Доступ отозван');await load();}})):null)));
  v.body.replaceChildren(box);
 }catch(e){if(!disposed)v.body.replaceChildren(h('p',{class:'inline-error'},e.message));}}
 load();return {...v,canLeave:async()=>!dirty||await confirm('Есть несохранённые права','Выйти без сохранения?','Выйти'),dispose(){disposed=true;}};
}

