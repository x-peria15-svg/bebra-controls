export function appendLog(logsByServer,server,text,type=''){
 const logs=logsByServer.get(server)||[];logsByServer.set(server,logs);
 const clean=String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,'').replace(/\r/g,'');
 const added=[];
 for(const line of clean.split('\n')){if(!line.trim()||/^\s*(?:\[\d{2}:\d{2}:\d{2}\s+INFO\]:?|\d{2}:\d{2}:\d{2}\s+INFO)\s*$/.test(line))continue;const entry={text:line,type:type||(/\bERROR\b|Exception|panic/i.test(line)?'error':/\bWARN\b/i.test(line)?'warn':'')};logs.push(entry);added.push(entry);}
 if(logs.length>1500)logs.splice(0,logs.length-1500);
 return added;
}
