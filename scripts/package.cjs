const fs=require('node:fs'),path=require('node:path');const packager=require('@electron/packager');
(async()=>{
 const root=path.resolve(__dirname,'..'),stage=path.resolve(root,'.package-stage-'+Date.now());
 const outArg=process.argv.find(x=>x.startsWith('--out='));
 const out=outArg?path.resolve(outArg.slice(6)):path.join(root,'dist');
 fs.mkdirSync(stage,{recursive:true});
 for(const name of ['main.cjs','preload.cjs','lib','ui','assets'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true,dereference:true});
 const original=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8').replace(/^\uFEFF/,''));
 for(const name of ['devDependencies','scripts','pnpm'])delete original[name];
 fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(original,null,2));
 fs.mkdirSync(path.join(stage,'node_modules'),{recursive:true});fs.cpSync(fs.realpathSync(path.join(root,'node_modules/ws')),path.join(stage,'node_modules/ws'),{recursive:true,dereference:true});
 const result=await packager.packager({dir:stage,out,name:'Bebra Control',executableName:'Bebra Control',platform:'win32',arch:'x64',electronVersion:'45.3.4',icon:path.join(root,'assets/icon.ico'),asar:true,prune:false,overwrite:true,appVersion:original.version,buildVersion:original.version,win32metadata:{CompanyName:'Bebra',FileDescription:'Bebra Control - Minecraft Server Manager',ProductName:'Bebra Control',InternalName:'BebraControl'}});
 console.log('PACKAGED',result);
})();
