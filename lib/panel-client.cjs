const routes=[
 ['GET',/^\/users$/],
 ['POST',/^\/users(?:\/[a-f0-9-]{36})?$/],
 ['DELETE',/^\/users\/[a-f0-9-]{36}$/],
 ['GET',/^\/(resources|websocket|startup|network\/allocations|backups|schedules)$/],
 ['GET',/^\/files\/(list|contents|download|upload)$/],
 ['POST',/^\/(power|command|backups|schedules)$/],
 ['POST',/^\/files\/(write|delete|create-folder|rename|compress|decompress|chmod)$/],
 ['PUT',/^\/files\/rename$/],
 ['PUT',/^\/startup\/(variable|docker-image)$/],
 ['GET',/^\/backups\/[a-f0-9-]{36}\/download$/],
 ['POST',/^\/backups\/[a-f0-9-]{36}\/restore$/],
 ['DELETE',/^\/backups\/[a-f0-9-]{36}$/],
 ['POST',/^\/schedules\/\d+(\/tasks|\/execute)?$/],
 ['DELETE',/^\/schedules\/\d+(\/tasks\/\d+)?$/],
 ['GET',/^\/schedules\/\d+$/],
];
function validateConfig({url,token}={}){
 let u;try{u=new URL(url);}catch{throw Error('Укажи корректный HTTPS-адрес панели.');}
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!['','443'].includes(u.port))throw Error('Нужен HTTPS-адрес панели без пути и параметров.');
 if(typeof token!=='string'||!/^ptlc_[a-zA-Z0-9]{20,100}$/.test(token.trim()))throw Error('Нужен клиентский API-ключ панели с префиксом ptlc_.');
 return {url:u.origin,token:token.trim()};
}
function apiPath({server,route='',method='GET',host=false,management=false}={}){
 method=method.toUpperCase();
 if(management){
  if(!server&&route===''&&method==='GET')return '/api/client/bebra/account';
  if(!server&&route==='/system-reserve'&&['GET','POST'].includes(method))return '/api/client/bebra/system-reserve';
  if(!server&&((route==='/keys'&&['GET','POST'].includes(method))||(/^\/keys\/\d+$/.test(route)&&method==='DELETE')))return '/api/client/bebra'+route;
  if(/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/.test(server||'')&&route==='/history'&&method==='GET')return '/api/client/bebra/servers/'+server+'/history';
  if(!server&&((route==='/templates'&&method==='GET')||(route==='/environments'&&method==='POST')))return '/api/client/bebra'+route;
  if(/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/.test(server||'')&&route==='/limits'&&['GET','POST'].includes(method))return '/api/client/bebra/servers/'+server+'/limits';
  throw Error('Недопустимый запрос управления.');
 }
 if(host){if(method==='GET'&&!server&&!route)return '/api/client/bebra/host';throw Error('Недопустимый запрос.');}
 if(!server){if(route===''&&method==='GET')return '/api/client';throw Error('Недопустимый запрос.');}
 if(!/^[a-f0-9]{8}(?:-[a-f0-9-]{27})?$/.test(server))throw Error('Некорректный идентификатор сервера.');
 if(route===''&&method==='GET')return '/api/client/servers/'+server;
 if(!routes.some(([m,re])=>m===method&&re.test(route)))throw Error('Операция не поддерживается.');
 return '/api/client/servers/'+server+route;
}
function signedURL(base,url){
 const b=new URL(base),u=new URL(url);
 if(u.protocol!=='https:'||u.hostname!==b.hostname||u.username||u.password||!['','443','8443'].includes(u.port))throw Error('Панель вернула недоверенный адрес файла.');
 return u;
}
async function boundedText(response,max=4*1024*1024){
 const reader=response.body?.getReader();if(!reader)return '';
 let chunks=[],n=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw Error('Ответ слишком большой. Скачай файл вместо открытия в редакторе.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
class PanelClient{
 constructor(config,fetchFn=fetch){this.config=validateConfig(config);this.fetch=fetchFn;}
 async request(options={}){
  const {query={},body,method='GET'}=options;
  const url=new URL(apiPath(options),this.config.url);
  for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
  let res;
  try{res=await this.fetch(url.toString(),{method,headers:{Accept:'application/json',Authorization:'Bearer '+this.config.token,...(body===undefined?{}:{'Content-Type':typeof body==='string'?'text/plain':'application/json'})},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});}
  catch{throw Error('Нет соединения с панелью. Проверь интернет и доступность VPS.');}
  if(!res.ok){
   if(options.management&&[409,422].includes(res.status)){
    let detail='';try{const data=JSON.parse(await boundedText(res,65536));detail=data.errors?.[0]?.detail||'';}catch{}
    const safe=['Сначала останови сервер','Недостаточно памяти:','Сумма лимитов диска','Новый лимит диска'];
    if(safe.some(prefix=>detail.startsWith(prefix)))throw Error(detail.slice(0,250));
   }else await res.body?.cancel();
   const messages={401:'API-ключ недействителен. Подключи панель заново.',403:'Недостаточно прав для этой операции.',404:'Сервер или файл не найден.',409:'Операция сейчас недоступна. Дождись завершения текущей задачи.',413:'Файл превышает допустимый размер загрузки.',422:'Проверь введённые значения: панель отклонила запрос.',429:'Слишком много запросов. Подожди несколько секунд.'};
   throw Error(messages[res.status]||'Панель временно не выполнила запрос (HTTP '+res.status+').');
  }
  if(res.status===204)return null;
  const text=await boundedText(res);
  if(options.route==='/files/contents')return text;
  if(!text)return null;
  try{return JSON.parse(text);}catch{throw Error('Панель вернула некорректный ответ.');}
 }
}
module.exports={validateConfig,apiPath,signedURL,boundedText,PanelClient};

