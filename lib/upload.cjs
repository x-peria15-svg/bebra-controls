const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {Readable}=require('node:stream');
const {randomBytes}=require('node:crypto');
async function uploadFile(url,file,{fetchFn=fetch,onProgress=()=>{},signal}={}){
 const stat=await fsp.stat(file);if(!stat.isFile()||!Number.isSafeInteger(stat.size))throw Error('Выбери обычный файл.');
 const boundary='bebra-'+randomBytes(18).toString('hex');
 const name=path.basename(file).replace(/[\r\n"\\]/g,'_');
 const head=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
 const tail=Buffer.from(`\r\n--${boundary}--\r\n`);
 let sent=0,last=0;
 async function* parts(){yield head;for await(const chunk of fs.createReadStream(file,{highWaterMark:256*1024})){sent+=chunk.length;if(Date.now()-last>250){onProgress({name,sent,total:stat.size});last=Date.now();}yield chunk;}yield tail;onProgress({name,sent,total:stat.size});}
 const stream=Readable.from(parts());
 try{
  const result=await fetchFn(url,{method:'POST',headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':String(head.length+stat.size+tail.length)},body:stream,duplex:'half',redirect:'error',signal});
  await result.body?.cancel();if(!result.ok)throw Error(result.status===413?'Файл превышает лимит загрузки узла.':result.status===507?'Недостаточно места на сервере.':'Не удалось загрузить файл (HTTP '+result.status+'). Проверь квоту диска.');
  return {name,size:stat.size};
 }finally{stream.destroy();}
}
module.exports={uploadFile};
