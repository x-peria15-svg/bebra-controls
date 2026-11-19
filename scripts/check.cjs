const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(item.isSymbolicLink()||['node_modules','.git','dist'].includes(item.name)||item.name.startsWith('.package-stage-'))continue;const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(/\.(cjs|mjs|js)$/.test(item.name)){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stderr);process.exit(1);}count++;}}}
walk(root);console.log('JavaScript syntax verified:',count);require('./privacy-check.cjs');
