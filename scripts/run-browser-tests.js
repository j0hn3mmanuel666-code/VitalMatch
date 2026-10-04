import { spawn } from 'node:child_process';
if (!/^vitalmatch_audit_test_/.test(process.env.DB_NAME || '') || process.env.NODE_ENV !== 'test') throw new Error('Browser tests require a disposable audit database');
const server=spawn(process.execPath,['index.js'],{env:{...process.env,ELECTRON:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
let output='';server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
try {
  let ready=false;
  for(let attempt=0;attempt<100;attempt++) {
    try { const r=await fetch(`${process.env.BASE_URL}/health`);if(r.ok){ready=true;break;} }catch{}
    if(server.exitCode!==null)throw new Error('Test server exited before readiness');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('Test server did not become ready');
  const code=await new Promise((resolve,reject)=>{const test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=playwright.config.js'],{env:process.env,stdio:'inherit',windowsHide:true});test.once('error',reject);test.once('exit',resolve);});
  if(code!==0)throw new Error('Browser regression suite failed');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{server.kill();}
