import {h,btn,ibtn,bytes,serverName,runtime,isApps,stateName,cleanLog,toast,run} from './util.js';
import {icon} from './icons.js';
import {appendLog} from './logs.mjs';
import {allowed} from './management.js';
export function createConsole(ctx){
 const s=ctx.state.selected,server=s.identifier;let paused=false,query='',disposed=false;
 const lines=h('div',{class:'console-lines',role:'log','aria-label':'Вывод консоли'});
 const search=h('input',{class:'console-search',placeholder:'Найти в журнале…','aria-label':'Поиск по журналу',onInput:e=>{query=e.target.value.toLowerCase();filter();}});
 const pause=ibtn('Приостановить прокрутку','pause',()=>{paused=!paused;pause.replaceChildren(icon(paused?'play':'pause',17));pause.title=paused?'Продолжить прокрутку':'Приостановить прокрутку';});
 const indicator=h('span',{class:'tiny-dot offline'});
 const logs=ctx.state.logs.get(server)||[];ctx.state.logs.set(server,logs);
 const renderLine=entry=>h('div',{class:'log-line '+entry.type+(query&&!entry.text.toLowerCase().includes(query)?' hidden':''),text:entry.text});
 function filter(){for(const n of lines.children)n.classList.toggle('hidden',!!query&&!n.textContent.toLowerCase().includes(query));}
 function add(text,type=''){
  for(const entry of appendLog(ctx.state.logs,server,text,type))lines.append(renderLine(entry));
  while(lines.children.length>logs.length)lines.firstChild?.remove();
  if(!paused)lines.scrollTop=lines.scrollHeight;
 }
 logs.forEach(entry=>lines.append(renderLine(entry)));
 if(!logs.length)add('Bebra: подключаюсь к консоли '+serverName(s)+'…','system');
 const input=h('input',{placeholder:'Введите команду…','aria-label':'Команда сервера',autocomplete:'off'});
 const submit=async e=>{e.preventDefault();const command=input.value.trim();if(!command)return;try{await ctx.api('/command','POST',{command});input.value='';}catch(err){toast(err.message,'error');}};
 const toolbar=h('div',{class:'panel-toolbar'},h('div',{class:'panel-title'},indicator,'Консоль · '+serverName(s)),search,pause,ibtn('Очистить видимый журнал','trash',()=>{logs.length=0;lines.replaceChildren();}),ibtn('Сохранить журнал','download',()=>run(()=>window.bebra.exportLog(logs.map(x=>x.text).join('\n')))));
 const form=h('form',{class:'command-bar',onSubmit:submit},icon('terminal',20),input,ibtn('Отправить команду','chevron',()=>form.requestSubmit()));
 input.disabled=!allowed(s,'control.console');
 if(input.disabled)input.placeholder='Нет разрешения на отправку команд';
 const details=h('div',{class:'side-panel'},h('h3',{},'Сведения'),...[
  ['Ядро',runtime(s)],['Память',s.limits.memory+' МБ'],['Адрес',s.allocation.ip+':'+s.allocation.port],['Доступ',s.name==='Proxy'||isApps(s)?'Публичный':'Через прокси'],['Состояние',stateName(ctx.state.resources.get(server)?.current_state)],
 ].map(([a,b])=>h('div',{class:'detail-row'},h('span',{},a),h('span',{},b))));
 const reserve=h('div',{class:'side-panel'});
 function host(){details.querySelector('.detail-row:last-child span:last-child').textContent=stateName(ctx.state.resources.get(server)?.current_state);const x=ctx.state.host;reserve.replaceChildren(h('h3',{},'Система и панель'),h('div',{class:'reserve-value'},bytes(x?.reserve_used_bytes),' ',h('small',{},'из '+bytes(x?.reserve_budget_bytes))),h('div',{class:'reserve-bar'},h('span',{class:'system-memory',style:'width:'+Math.min(100,(x?.system_bytes||0)/(x?.reserve_budget_bytes||1)*100)+'%'}),h('span',{class:'panel-memory',style:'width:'+Math.min(100,(x?.panel_bytes||0)/(x?.reserve_budget_bytes||1)*100)+'%'})),h('div',{class:'detail-row'},h('span',{},'Ubuntu'),h('span',{},bytes(x?.system_bytes))),h('div',{class:'detail-row'},h('span',{},'Панель и службы'),h('span',{},bytes(x?.panel_bytes))),h('div',{class:'detail-row'},h('span',{},'Осталось'),h('span',{},bytes(x?Math.max(0,x.reserve_budget_bytes-x.reserve_used_bytes):null))));}
 host();
 const links=h('div',{class:'side-panel'},...[
  ['Резервная копия','archive',()=>ctx.selectTab('backups')],['Файлы сервера','folder',()=>ctx.selectTab('files')],['Настройки запуска','settings',()=>ctx.selectTab('properties')],
 ].map(([label,name,action])=>h('button',{class:'side-link',onClick:action},icon(name,16),label)));
 const root=h('div',{class:'console-layout'},h('div',{class:'console-panel'},toolbar,lines,form),h('aside',{class:'side-stack'},details,reserve,links));
 return {root,host,
  onPacket(packet){if(disposed||packet.server!==server)return;
   if(packet.event==='connected'){indicator.classList.remove('offline');lines.replaceChildren();add('Bebra: защищённое соединение с консолью установлено.','system');}
   else if(packet.event==='disconnected')indicator.classList.add('offline');
   else if(packet.event==='connection-error'){indicator.classList.add('offline');add('Bebra: '+packet.message,'warn');}
   else if(packet.entries){for(const entry of packet.entries)lines.append(renderLine(entry));while(lines.children.length>logs.length)lines.firstChild?.remove();if(!paused)lines.scrollTop=lines.scrollHeight;}
  },dispose(){disposed=true;},focus(){input.focus();}};
}

