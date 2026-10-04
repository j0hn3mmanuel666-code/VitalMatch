import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EmailService, smtpConfiguration } from '../services/emailService.js';
import { DEFAULT_SETTINGS } from '../services/runtimeSettings.js';
import { csvCell, UserService } from '../services/userService.js';
import { safeContentUrl } from '../services/contentSafety.js';
import { paginationFor, paginationLinks } from '../services/pagination.js';
import { safeRequestLabel, cacheControl } from '../middleware/performance.js';
import { VitalMatchBlockchain } from '../services/blockchainService.js';
import { validatePassword } from '../middleware/validation.js';
import { User } from '../models/userModel.js';
import { retryTransaction } from '../services/transactionService.js';

const settings = () => structuredClone(DEFAULT_SETTINGS);
test('SMTP uses configured host and port, does not silently create a test transport', async () => {
  const captured = [];
  const service = new EmailService({ env: {}, settings, createTransport: config => { captured.push(config); return {}; } });
  assert.equal(service.getStatus().configured, false);
  assert.equal((await service.sendVerificationEmail('donor@example.invalid', 'Donor', 'token')).success, false);
  assert.equal(captured.length, 0);
  const config = smtpConfiguration({ EMAIL_HOST: 'smtp.example.invalid', EMAIL_PORT: '2525', EMAIL_USER: 'operator', EMAIL_PASS: 'sample synthetic secret' }, settings());
  assert.equal(config.host, 'smtp.example.invalid'); assert.equal(config.port, 2525); assert.equal(config.requireTLS, true);
  assert.equal(config.auth.pass, 'sample synthetic secret');
});
test('SMTP acceptance, rejection and escaped email content have honest outcomes', async () => {
  let mode = 'accept', mail;
  const service = new EmailService({ env: { EMAIL_HOST:'smtp.example.invalid',EMAIL_USER:'operator',EMAIL_PASS:'synthetic',BASE_URL:'https://vitalmatch.example' }, settings,
    createTransport: () => ({sendMail: async options => { mail=options; if(mode==='throw') throw new Error('provider failure'); return {accepted:mode==='accept' ? [options.to] : [],rejected:mode==='reject' ? [options.to]:[]}; }, verify:async()=>true }) });
  assert.equal((await service.sendVerificationEmail('donor@example.invalid','<img onerror=alert(1)>','synthetic')).success,true);
  assert.ok(mail.html.includes('&lt;img')); assert.ok(!mail.html.includes('<img onerror'));
  assert.equal((await service.sendRequestUpdateEmail('donor@example.invalid','Donor',{id:1,actionPath:'/my-appointments'},'Appointment cancelled')).success,true);assert.ok(mail.html.includes('/my-appointments'));assert.ok(!mail.html.includes('/view-blood-request/1'));
  mode='reject'; assert.equal((await service.sendWelcomeEmail('donor@example.invalid','Donor')).success,false);
  mode='throw'; assert.equal((await service.sendWelcomeEmail('donor@example.invalid','Donor')).success,false);
  assert.equal(await service.testEmailConfiguration(),true);
});
test('optional welcome email preference does not disable account verification or reset', async () => {
  const config=settings();config.notifications.registrationNotifications=false;let sends=0;
  const service=new EmailService({env:{EMAIL_HOST:'smtp.example.invalid',EMAIL_USER:'operator',EMAIL_PASS:'synthetic'},settings:()=>config,createTransport:()=>({sendMail:async o=>{sends++;return {accepted:[o.to],rejected:[]};}})});
  assert.equal((await service.sendVerificationEmail('donor@example.invalid','Donor','synthetic')).success,true);
  assert.equal((await service.sendPasswordResetEmail('donor@example.invalid','Donor','synthetic')).success,true);
  assert.equal((await service.sendWelcomeEmail('donor@example.invalid','Donor')).suppressed,true);assert.equal(sends,2);
});
test('CSV cells quote separators, embedded quotes, lines and spreadsheet formulas', () => {
  assert.equal(csvCell('Smith, "J"\nNext'), '"Smith, ""J""\nNext"');
  for (const value of ['=1+1','+SUM(1)','-1+2','@command','\t=1']) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('ordinary'), '"ordinary"');
  const passwords = Array.from({length:100},()=>UserService.generateTemporaryPassword());
  assert.equal(new Set(passwords).size,100); assert.ok(passwords.every(v=>v.length>=24&&/[A-Z]/.test(v)&&/[a-z]/.test(v)&&/\d/.test(v)&&/!/.test(v)));
  for (const minPasswordLength of [8,32,64]) for (let i=0;i<20;i++) assert.equal(validatePassword(UserService.generateTemporaryPassword({minPasswordLength,requireSpecialChars:true}),{minPasswordLength,requireSpecialChars:true}),true);
});
test('content URLs allow ordinary local/HTTPS links and reject active or confusing protocols', () => {
  assert.equal(safeContentUrl('/request-blood'),'/request-blood'); assert.equal(safeContentUrl('#about'),'#about');
  for(const v of ['javascript:alert(1)','//attacker.example','/\\attacker.example','data:text/html,<script>','https://user:pass@example.com']) assert.throws(()=>safeContentUrl(v));
});
test('admin mutations reject invalid fields and preserve the last effective administrator', async () => {
  for(const values of [{email:'bad'},{phone:'bad'},{dateOfBirth:'2000-02-31'},{firstName:'x'.repeat(101)},{emailVerified:[] }]) assert.throws(()=>UserService.input(values));
  const original=User.findAll;let where;
  User.findAll=async options=>{where=options.where;return [{id:1}];};
  try {
    const account={role:'admin',isActive:true,emailVerified:true,archivedAt:null};
    for(const values of [{emailVerified:false},{isActive:false},{role:'donor'}]) await assert.rejects(UserService.protectLastAdmin(account,values,{LOCK:{UPDATE:'UPDATE'}}),/active verified administrator/);
    assert.deepEqual(where,{role:'admin',isActive:true,emailVerified:true,archivedAt:null});
    await UserService.protectLastAdmin(account,{firstName:'Changed'},{LOCK:{UPDATE:'UPDATE'}});
  }finally{User.findAll=original;}
});
test('deadlock recovery retries the entire rolled-back transaction and propagates other errors', async () => {
  let calls=0,operations=0;
  const database={transaction:async operation=>{calls++;await operation();if(calls===1)throw Object.assign(new Error('deadlock'),{original:{code:'ER_LOCK_DEADLOCK'}});return 'committed';}};
  assert.equal(await retryTransaction(async()=>{operations++;},{database}),'committed');assert.equal(calls,2);assert.equal(operations,2);
  await assert.rejects(retryTransaction(async()=>{}, {database:{transaction:async()=>{throw new Error('Other failure');}}}),/Other failure/);
});
test('pagination bounds input, clamps pages and preserves filters in links', () => {
  assert.deepEqual(paginationFor({page:'-1',limit:'oops'},101).page,1);
  const p=paginationLinks(paginationFor({page:'999',limit:'10000'},230),'/admin/calls',{filter:'pending'});
  assert.equal(p.limit,100); assert.equal(p.page,3); assert.ok(p.previousUrl.includes('filter=pending')); assert.equal(p.nextUrl,null);
});
test('performance logs redact token paths and query secrets', () => {
  assert.equal(safeRequestLabel({method:'GET',originalUrl:'/reset-password/private-token?email=private@example.invalid'}),'GET /reset-password/[redacted]');
  assert.equal(safeRequestLabel({method:'GET',originalUrl:'/schedule-confirm/private-token'}),'GET /schedule-confirm/[redacted]');
});
test('a dynamic route ending in an asset extension cannot opt into public caching', () => {
  for(const method of ['GET','HEAD']) {
    const headers={};let next=false;
    cacheControl()({method,url:'/admin/users/record.css'},{set:(name,value)=>headers[name]=value},()=>next=true);
    assert.equal(next,true);assert.ok(headers['Cache-Control'].includes('private'));assert.ok(headers['Cache-Control'].includes('no-store'));assert.equal(headers.ETag,undefined);
  }
});
test('settings serialize concurrent full updates into a private file without lost writes', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vitalmatch-settings-')); const file=path.join(dir,'settings.json');
  try {
    const result=spawnSync(process.execPath,['--input-type=module','-e',`import {updateRuntimeSettings,getRuntimeSettings} from './services/runtimeSettings.js'; await Promise.all([updateRuntimeSettings(s=>({...s,general:{...s.general,appName:'TestApp'}})),updateRuntimeSettings(s=>({...s,general:{...s.general,timeZone:'UTC'}}))]); if(getRuntimeSettings().general.appName!=='TestApp'||getRuntimeSettings().general.timeZone!=='UTC') process.exit(2);`],{cwd:process.cwd(),env:{...process.env,RUNTIME_SETTINGS_FILE:file},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); const saved=JSON.parse(await fs.readFile(file,'utf8')); assert.equal(saved.general.appName,'TestApp'); assert.equal(saved.general.timeZone,'UTC');
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('settings restore file and memory when coordinated audit commit fails', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vitalmatch-settings-rollback-'));const file=path.join(dir,'settings.json');
  try {
    const result=spawnSync(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict'; import fs from 'node:fs/promises';import {updateRuntimeSettings,getRuntimeSettings} from './services/runtimeSettings.js'; await updateRuntimeSettings(s=>s); const before=getRuntimeSettings();for(const published of [false,true]){await assert.rejects(updateRuntimeSettings(s=>({...s,general:{...s.general,appName:'Uncommitted'}}),{commit:async(n,p,publish)=>{if(published)await publish();throw new Error('Synthetic audit failure');}}));assert.deepEqual(getRuntimeSettings(),before);assert.deepEqual(JSON.parse(await fs.readFile(process.env.RUNTIME_SETTINGS_FILE,'utf8')),before);}`],{cwd:process.cwd(),env:{...process.env,RUNTIME_SETTINGS_FILE:file},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('ledger mining commits chain and pending together, reopens without duplication and surfaces write failure', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vitalmatch-ledger-'));
  try {
    const ledger=new VitalMatchBlockchain({directory:dir});
    await assert.rejects(ledger.addDonationRecord(1,{units:0,bloodType:'O+'}));
    await ledger.addFulfillmentRecord(2,1,{units:1}); await ledger.minePendingTransactions();
    assert.equal(ledger.chain.length,2); assert.equal(ledger.pendingTransactions.length,0);
    const loaded=new VitalMatchBlockchain({directory:dir}); assert.equal(loaded.chain.length,2); assert.equal(loaded.pendingTransactions.length,0); assert.equal(loaded.isChainValid(),true);
    loaded.chain[0].data.message='Tampered genesis';assert.equal(loaded.isChainValid(),false);
    const failing=new VitalMatchBlockchain({directory:dir,writeFile:async()=>{throw new Error('disk unavailable');}});
    await assert.rejects(failing.addRequestRecord(3,{bloodType:'A+',unitsRequired:1,urgency:'urgent',status:'active'})); assert.equal(failing.pendingTransactions.length,0);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
