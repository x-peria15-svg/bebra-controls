const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {uploadFile}=require('../lib/upload.cjs');
test('multipart upload streams files and keeps content length exact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bebra-upload-'));const file=path.join(dir,'тест.txt');await fs.writeFile(file,'hello-world');let progress;
 try{await uploadFile('https://node.example/upload',file,{onProgress:p=>progress=p,fetchFn:async(url,options)=>{assert.equal(options.duplex,'half');assert.equal(options.redirect,'error');let chunks=[];for await(const chunk of options.body)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks);assert.equal(Number(options.headers['Content-Length']),body.length);assert.match(body.toString(),/hello-world/);assert.match(body.toString(),/name="files"/);return new Response(null,{status:204});}});assert.equal(progress.sent,11);assert.equal(progress.total,11);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('upload rejects server errors and directories',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bebra-upload-'));const file=path.join(dir,'x');await fs.writeFile(file,'x');try{await assert.rejects(uploadFile('https://node.example',dir),/обычный файл/);await assert.rejects(uploadFile('https://node.example',file,{fetchFn:async()=>new Response(null,{status:507})}),/Недостаточно места/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
