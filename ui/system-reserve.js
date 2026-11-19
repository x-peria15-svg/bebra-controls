import {h,btn,field,bytes,run,toast,confirm} from './util.js';
export function systemReserveView(onSaved){
 const body=h('div',{class:'section-body'}),root=h('section',{class:'section-panel'},h('div',{class:'section-heading'},h('div',{},h('h2',{},'Память системы и панели'),h('p',{},'Настрой бюджет Ubuntu, панели и служб.'))),body);let dirty=false,disposed=false;
 (async()=>{try{const d=await window.bebra.api({management:true,route:'/system-reserve'});if(disposed)return;
 const input=h('input',{type:'number',min:d.minimum_mib,max:d.total_mib-128,step:1,required:true,value:d.reserve_mib,onInput:()=>dirty=true});
 const error=h('p',{class:'inline-error','aria-live':'polite'}),form=h('form'),save=btn('Сохранить резерв','save',()=>form.requestSubmit(),'primary');save.type='button';
 form.append(h('p',{class:'notice neutral'},'Это бюджет, а не жёсткое ограничение Linux. Уменьшение резерва освобождает бюджет для серверов; увеличение не отнимает уже выделенную им память.'),h('p',{},'Всего: '+bytes(d.total_mib*1048576)+' · Выделено серверам: '+bytes(d.allocated_mib*1048576)+' · Система сейчас: '+bytes(d.system_used_bytes)),field('Резерв системы и панели, МБ',input,'1024 МБ = 1 ГБ. Минимум 1 ГБ; для текущих служб разумно оставлять запас относительно фактического расхода.'),error,save);
 form.addEventListener('submit',e=>{e.preventDefault();run(async()=>{if(!await confirm('Изменить системный резерв?',`Новый резерв: ${input.value} МБ. Изменится доступный бюджет для создания и расширения серверов.`,'Сохранить'))return;save.disabled=true;try{await window.bebra.api({management:true,route:'/system-reserve',method:'POST',body:{reserve_mib:Number(input.value)}});dirty=false;toast('Системный резерв сохранён');await onSaved();}catch(e){error.textContent=e.message;}finally{save.disabled=false;}});});body.replaceChildren(form);
 }catch(e){if(!disposed)body.replaceChildren(h('p',{class:'inline-error'},e.message));}})();
 return {root,canLeave:async()=>!dirty||await confirm('Выйти без сохранения?','Резерв памяти не изменится.','Выйти'),dispose(){disposed=true;}};
}
