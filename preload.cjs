const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=async(channel,...args)=>{const r=await ipcRenderer.invoke(channel,...args);if(!r.ok)throw Error(r.error);return r.data;};
contextBridge.exposeInMainWorld('bebra',Object.freeze({
 config:()=>invoke('config'),connect:c=>invoke('connect',c),disconnect:()=>invoke('disconnect'),
 api:o=>invoke('api',o),openPanel:p=>invoke('panel',p),upload:o=>invoke('upload',o),download:o=>invoke('download',o),
 copyText:t=>invoke('copy-text',t),
 uploadDropped:({files,...options})=>invoke('upload-dropped',{...options,filePaths:Array.from(files).map(file=>webUtils.getPathForFile(file))}),
 openConsole:s=>invoke('console-open',s),closeConsole:()=>invoke('console-close'),exportLog:t=>invoke('export-log',t),window:a=>invoke('window',a),
 onConsole:handler=>{const fn=(_event,data)=>handler(data);ipcRenderer.on('console',fn);return()=>ipcRenderer.removeListener('console',fn);},
 onUploadProgress:handler=>{const fn=(_event,data)=>handler(data);ipcRenderer.on('upload-progress',fn);return()=>ipcRenderer.removeListener('upload-progress',fn);},
 onCloseRequest:handler=>{const fn=()=>handler();ipcRenderer.on('close-request',fn);return()=>ipcRenderer.removeListener('close-request',fn);},
}));

