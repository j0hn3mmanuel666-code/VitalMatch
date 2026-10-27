import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import hbs from 'hbs';
const skip = new Set(['node_modules','.git','.local','.impeccable','impeccable','private','uploads','android']);
async function files(directory) {
  const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(skip.has(entry.name))continue;
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await files(file));else result.push(file);
  }
  return result;
}
let js=0,templates=0,failures=0;
for(const file of await files(process.cwd())){
  if(/\.(js|cjs|mjs)$/.test(file)){
    const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});js++;
    if(checked.status!==0){console.error(`${path.relative(process.cwd(),file)}: ${checked.stderr}`);failures++;}
  }
  if(file.endsWith('.xian')){
    templates++;try{hbs.handlebars.precompile(await fs.readFile(file,'utf8'));}
    catch(error){console.error(`${path.relative(process.cwd(),file)}: ${error.message}`);failures++;}
  }
}
console.log(`${failures?'FAIL':'PASS'}: ${js} JavaScript files syntax checked, ${templates} templates parsed; ${failures} failure(s).`);
process.exitCode=failures?1:0;
