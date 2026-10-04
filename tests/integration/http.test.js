import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import fs from 'node:fs/promises';
import path from 'node:path';
import { io as connectSocket } from 'socket.io-client';
if (process.env.NODE_ENV !== 'test' || !/^vitalmatch_audit_test_/.test(process.env.DB_NAME || '') || process.env.EMAIL_OUTBOX_ENABLED !== 'false') throw new Error('HTTP tests require an isolated audit database');
const { default: app, httpServer, io } = await import('../../index.js');
const { sequelize } = await import('../../models/db.js');
const { User } = await import('../../models/userModel.js');
const { Donor } = await import('../../models/donorModel.js');
const { BloodRequest } = await import('../../models/bloodRequestModel.js');
const { Message } = await import('../../models/messageModel.js');
const { AuditLog } = await import('../../services/auditService.js');
const { AuditService } = await import('../../services/auditService.js');
const { UserService } = await import('../../services/userService.js');
const { EmailOutbox } = await import('../../models/emailOutboxModel.js');
const { CoordinationJob } = await import('../../models/coordinationJobModel.js');
const { CallForDonation } = await import('../../models/callForDonationModel.js');
const { PublicContent } = await import('../../models/publicContentModel.js');
const { hashToken } = await import('../../middleware/validation.js');
const { PasswordReset } = await import('../../models/passwordResetModel.js');
const { authLimiter } = await import('../../middleware/security.js');
const { processEmailOutbox } = await import('../../services/emailOutboxWorker.js');
const { getRuntimeSettings, updateRuntimeSettings } = await import('../../services/runtimeSettings.js');
let base, admin, ordinary;
const password = 'SyntheticTest!2026';
async function fixture(email, role) {
  return User.create({firstName:'Browser',lastName:'Test',email,password:await bcrypt.hash(password,4),phone:'09123456789',address:'Synthetic test address',dateOfBirth:'1990-01-01',gender:'Other',role,isActive:true,emailVerified:true});
}
before(async()=>{
  admin=await fixture('browser-admin@example.invalid','admin'); ordinary=await fixture('browser-donor@example.invalid','donor');
  await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${httpServer.address().port}`;
});
async function client(email) {
  let cookie='',csrf='';
  const request=async (url,options={})=>{
    const response=await fetch(base+url,{redirect:'manual',...options,headers:{Cookie:cookie,...options.headers}});
    const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return response;
  };
  const refresh=async()=>{const r=await request('/login');const html=await r.text();csrf=html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1] || html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];assert.ok(csrf);};
  await refresh();
  if(email){const response=await request('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf,email,password})});assert.equal(response.status,302);const r=await request('/dashboard');const html=await r.text();csrf=html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] || html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1];assert.ok(csrf);}
  return {request,post:(url,data)=>request(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)}), get csrf(){return csrf;},get cookie(){return cookie;}};
}
test('public pages render, protected APIs require login and SW is fresh',async()=>{
  const c=await client();for(const path of ['/','/login','/register','/about','/privacy','/terms','/contact'])assert.equal((await c.request(path)).status,200,path);
  assert.equal((await c.request('/admin/users/api',{headers:{Accept:'application/json'}})).status,401);
  const sw=await c.request('/sw.js');assert.ok(sw.headers.get('cache-control').includes('no-store'));
  const script=await c.request('/js/callManager.js');assert.equal(script.status,200);assert.ok(script.headers.get('cache-control').includes('must-revalidate'));assert.ok(script.headers.get('etag').startsWith('W/'));
  const disguised=await c.request('/admin/users/record.css',{headers:{Accept:'application/json'}});assert.equal(disguised.status,401);assert.ok(disguised.headers.get('cache-control').includes('no-store'));
  assert.equal((await c.request('/uploads/voice-messages/recording.webm')).status,404);
});
test('malformed login is rejected without taking down the server and CSRF rejects mutation',async()=>{
  const c=await client();const r=await c.post('/login',{email:ordinary.email,password:{unexpected:'object'}});assert.equal(r.status,400);
  assert.equal((await c.request('/health')).status,200);
  const a=await client(admin.email);const blocked=await a.request('/admin/settings/retry-email',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:'{}'});assert.equal(blocked.status,403);
});
test('administrator pages, CSV, analytics and scoped map work through real HTTP routes',async()=>{
  const a=await client(admin.email);
  for(const path of ['/admin/dashboard','/admin/users','/admin/users/api','/admin/requests','/admin/donors','/admin/donors?filter=available','/admin/donors?filter=unavailable','/admin/hospitals','/admin/appointments','/admin/reports','/admin/settings','/admin/calls','/help','/api/calls/analytics','/api/map-pins'])assert.equal((await a.request(path)).status,200,path);
  const csv=await a.request('/admin/users/export');assert.equal(csv.status,200);assert.ok(csv.headers.get('content-type').startsWith('text/csv'));
  const settings=await (await a.request('/api/admin/settings')).json();assert.equal(settings.settings.email.emailPassword,'');assert.ok(settings.outboxStats);
});
test('admin creation accepts actual form fields and ordinary users cannot grant roles or read admin exports',async()=>{
  const a=await client(admin.email);const fields={firstName:'New',lastName:'Synthetic',email:'created-test@example.invalid',phone:'09123456789',address:'Synthetic test address',dateOfBirth:'1990-01-01',gender:'Other',role:'donor'};
  const created=await a.post('/admin/users',fields);assert.equal(created.status,200);assert.equal((await created.json()).success,true);
  const c=await client(ordinary.email);assert.equal((await c.request('/admin/users/export',{headers:{Accept:'application/json'}})).status,403);
  assert.equal((await c.post('/admin/users',fields)).status,403);
});
test('active administrator demotion revokes an already-issued session',async()=>{
  const demoted=await fixture('demoted-test@example.invalid','admin');const c=await client(demoted.email);
  assert.equal((await c.request('/admin/users/api')).status,200);
  await UserService.updateUser(demoted.id,{role:'donor'},admin.id);
  assert.equal((await c.request('/admin/users/api',{headers:{Accept:'application/json'}})).status,401);
});
test('archiving preserves account/profile/messages and audit; it cannot destroy the last administrator',async()=>{
  const archived=await fixture('archive-test@example.invalid','donor');
  const donor=await Donor.create({fullName:'Archive test',dateOfBirth:'1990-01-01',gender:'Other',bloodType:'O+',weight:60,height:170,mobileNumber:'09123456789',email:archived.email,address:'Synthetic',city:'Calapan',province:'Oriental Mindoro',zipCode:'5200',isAvailable:true,emergencyContactName:'Test',emergencyContactNumber:'09123456789',emergencyContactRelationship:'relative',userId:archived.id});
  const message=await Message.create({senderId:archived.id,receiverId:admin.id,message:'Synthetic preserved history',conversationId:`${Math.min(archived.id,admin.id)}-${Math.max(archived.id,admin.id)}`});
  await UserService.deleteUser(archived.id,admin.id);
  assert.ok(await User.findByPk(archived.id));assert.ok((await archived.reload()).archivedAt);assert.equal(archived.isActive,false);
  assert.equal((await donor.reload()).isAvailable,false);assert.ok(await Message.findByPk(message.id));
  assert.equal(await AuditLog.count({where:{action:'USER_ARCHIVE',userId:archived.id}}),1);
  await assert.rejects(UserService.deleteUser(admin.id,admin.id),/own account/);
});
test('outbox failure retries durably and SMTP acceptance updates only the claimed row',async()=>{
  await updateRuntimeSettings(s=>({...s,notifications:{...s.notifications,emailNotificationsEnabled:true}}));
  const row=await EmailOutbox.create({kind:'request-update',recipient:ordinary.email,payload:{recipientName:'Browser',requestId:1,message:'Synthetic update'}});
  const fake={sendRequestUpdateEmail:async()=>({success:false,error:'SMTP_SEND_FAILED'})};
  await processEmailOutbox({service:fake,maximum:100});await row.reload();assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.ok(row.nextAttemptAt>new Date());
  await row.update({nextAttemptAt:new Date(0)});fake.sendRequestUpdateEmail=async()=>({success:true});
  await processEmailOutbox({service:fake,maximum:100});await row.reload();assert.equal(row.status,'sent');assert.ok(row.sentAt);
  await updateRuntimeSettings(s=>({...s,notifications:{...s.notifications,emailNotificationsEnabled:false}}));
});
test('settings and retry routes roll back when mandatory auditing fails',async()=>{
  const a=await client(admin.email),before=getRuntimeSettings();
  const row=await EmailOutbox.create({kind:'request-update',recipient:ordinary.email,payload:{requestId:1},status:'failed'});
  const original=AuditService.logAction;AuditService.logAction=async()=>{throw new Error('Synthetic audit outage');};
  try {
    const response=await a.post('/admin/settings/general',{...before.general,appName:'Uncommitted'});assert.equal(response.status,500);assert.deepEqual(getRuntimeSettings(),before);
    const retry=await a.post('/admin/settings/retry-email',{});assert.equal(retry.status,500);assert.equal((await row.reload()).status,'failed');
  }finally{AuditService.logAction=original;}
});
test('coordination retries are audited and a converted lead requires a linked donor account',async()=>{
  const a=await client(admin.email);
  const request=await BloodRequest.create({patientName:'Synthetic retry patient',patientAge:25,bloodType:'O+',unitsRequired:1,hospitalName:'Synthetic',hospitalAddress:'Synthetic',city:'Calapan',province:'Oriental Mindoro',contactPerson:'Synthetic',contactNumber:'09123456789',email:'synthetic@example.invalid',urgency:'urgent',requiredByDate:new Date(Date.now()+86400000),userId:admin.id,status:'cancelled',hospitalStatus:'approved'});
  const job=await CoordinationJob.create({requestId:request.id,dedupeKey:`retry-test:${request.id}`,status:'failed',attempts:5});
  assert.equal((await a.post('/admin/settings/retry-coordination',{})).status,200);assert.equal((await job.reload()).status,'pending');assert.equal(job.attempts,0);
  const lead=await CallForDonation.create({fullName:'Synthetic lead',age:30,weight:'60',bloodType:'O+',gender:'Other',contactNumber:'09123456789',hasTattoo:'No',location:'Calapan'});
  assert.equal((await a.post('/admin/calls/update-status',{id:lead.id,status:'Converted'})).status,400);
  const profile=await Donor.create({fullName:'Browser donor',dateOfBirth:'1990-01-01',gender:'Other',bloodType:'O+',weight:60,height:170,mobileNumber:'09123456789',email:ordinary.email,address:'Synthetic',city:'Calapan',province:'Oriental Mindoro',zipCode:'5200',isAvailable:true,emergencyContactName:'Test',emergencyContactNumber:'09123456789',emergencyContactRelationship:'relative',userId:ordinary.id});
  assert.equal((await a.post('/admin/calls/update-status',{id:lead.id,status:'Contacted',contactNotes:'Synthetic contact outcome'})).status,200);
  assert.equal((await a.post('/admin/calls/update-status',{id:lead.id,status:'Converted',convertedUserId:ordinary.id})).status,200);
  await lead.reload();assert.equal(lead.convertedUserId,profile.userId);assert.ok(lead.convertedAt);assert.equal(lead.contactNotes,'Synthetic contact outcome');
  assert.equal(await AuditLog.count({where:{action:'DONOR_LEAD_UPDATE',metadata:{subjectId:lead.id}}})>=2,true);
});
test('CMS updates persist safe primary links and roll back content when audit fails',async()=>{
  const a=await client(admin.email);
  const created=await a.post('/api/admin/public-content',{section:'audit-synthetic',title:'Synthetic',description:'<img src=x onerror=alert(1)><script>alert(1)</script><p>Safe</p>',primaryButtonLink:'/login'});
  assert.equal(created.status,201);const row=await PublicContent.findOne({where:{section:'audit-synthetic'}});assert.equal(/onerror|<script/i.test(row.description),false);
  const update=await a.request('/api/admin/public-content/audit-synthetic',{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':a.csrf},body:JSON.stringify({primaryButtonLink:'/register'})});assert.equal(update.status,200);assert.equal((await row.reload()).primaryButtonLink,'/register');
  const unsafe=await a.request('/api/admin/public-content/audit-synthetic',{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':a.csrf},body:JSON.stringify({primaryButtonLink:'javascript:alert(1)'})});assert.equal(unsafe.status,400);
  const original=AuditService.logAction;AuditService.logAction=async()=>{throw new Error('Synthetic audit outage');};
  try {
    const denied=await a.request('/api/admin/public-content/audit-synthetic',{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':a.csrf},body:JSON.stringify({title:'Uncommitted'})});assert.equal(denied.status,503);assert.equal((await row.reload()).title,'Synthetic');
  }finally{AuditService.logAction=original;}
});
test('self-service password changes revoke other HTTP sessions and verification links consume once',async()=>{
  const user=await fixture('password-audit@example.invalid','donor'),first=await client(user.email),second=await client(user.email),version=user.authVersion;
  const reset=await PasswordReset.create({email:user.email,token:hashToken('SyntheticOldSelfServiceResetToken'),expiresAt:new Date(Date.now()+3600000)});
  const changed=await first.post('/settings/password',{currentPassword:password,newPassword:'UpdatedTest!2026',confirmPassword:'UpdatedTest!2026'});assert.equal(changed.status,302);
  await user.reload();assert.equal(user.authVersion,version+1);assert.equal(await bcrypt.compare('UpdatedTest!2026',user.password),true);assert.equal((await second.request('/api/notifications',{headers:{Accept:'application/json'}})).status,401);
  assert.equal(await AuditLog.count({where:{action:'PASSWORD_CHANGE',userId:user.id}}),1);
  assert.equal((await reset.reload()).used,true);
  const pending=await fixture('verification-audit@example.invalid','donor'),token='SyntheticVerificationTokenForAudit';await pending.update({emailVerified:false,emailVerificationToken:hashToken(token),emailVerificationExpires:new Date(Date.now()+3600000)});
  const [one,two]=await Promise.all([client(),client()]);
  await Promise.all([one.request(`/verify-email?token=${token}`),two.request(`/verify-email?token=${token}`)]);
  await pending.reload();assert.equal(pending.emailVerified,true);assert.equal(pending.emailVerificationToken,null);assert.equal(await AuditLog.count({where:{action:'EMAIL_VERIFY',userId:pending.id}}),1);
});

test('email reassignment invalidates old reset and verification links before a replacement account can use the address',async()=>{
  // Independent fixtures start with an empty failure budget. Keep the actual
  // production threshold/handlers unchanged, so every response exercises reset.
  authLimiter.resetKey('127.0.0.1');
  const user=await fixture('reset-old-address@example.invalid','donor'),token='SyntheticOldEmailPasswordResetLink';
  const reset=await PasswordReset.create({email:user.email,token:hashToken(token),expiresAt:new Date(Date.now()+3600000)});
  await user.update({emailVerificationToken:hashToken('SyntheticOldEmailVerificationLink'),emailVerificationExpires:new Date(Date.now()+3600000)});
  await UserService.updateUser(user.id,{email:'reset-new-address@example.invalid',emailVerified:true},admin.id);
  await user.reload();assert.equal(user.emailVerified,true);assert.equal(user.emailVerificationToken,null);assert.equal(user.emailVerificationExpires,null);assert.equal((await reset.reload()).used,true);
  const replacement=await fixture('reset-old-address@example.invalid','donor'),before=replacement.password,c=await client();
  assert.equal((await c.post(`/reset-password/${token}`,{newPassword:'NeverAppliedReplacement!2026',confirmPassword:'NeverAppliedReplacement!2026'})).status,302);
  assert.equal((await replacement.reload()).password,before);assert.equal(await AuditLog.count({where:{action:'PASSWORD_RESET',userId:replacement.id}}),0);
  const verification='SyntheticObsoleteVerifiedStateLink';await user.update({emailVerificationToken:hashToken(verification),emailVerificationExpires:new Date(Date.now()+3600000)});
  await UserService.updateUser(user.id,{emailVerified:false},admin.id);assert.equal((await user.reload()).emailVerificationToken,null);
  await c.request(`/verify-email?token=${verification}`);assert.equal((await user.reload()).emailVerified,false);
});

test('email/reset races preserve stable target identity and security-change audit failures roll back token revocation',async()=>{
  authLimiter.resetKey('127.0.0.1');
  const user=await fixture('reset-race-old@example.invalid','donor'),token='SyntheticConcurrentResetEmailLink',before=user.password;
  const reset=await PasswordReset.create({email:user.email,token:hashToken(token),expiresAt:new Date(Date.now()+3600000)});
  await user.update({emailVerificationToken:hashToken('SyntheticRollbackVerificationLink'),emailVerificationExpires:new Date(Date.now()+3600000)});
  const original=AuditService.logAction;AuditService.logAction=async()=>{throw new Error('Synthetic audit outage');};
  try {
    await assert.rejects(UserService.updateUser(user.id,{email:'reset-race-new@example.invalid'},admin.id),/audit outage/);
    await user.reload();assert.equal(user.email,'reset-race-old@example.invalid');assert.equal(user.emailVerificationToken,hashToken('SyntheticRollbackVerificationLink'));assert.equal((await reset.reload()).used,false);
    await assert.rejects(UserService.resetPassword(user.id,admin.id),/audit outage/);
    assert.equal((await user.reload()).password,before);assert.equal((await reset.reload()).used,false);
  }finally{AuditService.logAction=original;}
  const c=await client();
  await Promise.all([UserService.updateUser(user.id,{email:'reset-race-new@example.invalid'},admin.id),c.post(`/reset-password/${token}`,{newPassword:'ConcurrentAuthorizedReset!2026',confirmPassword:'ConcurrentAuthorizedReset!2026'})]);
  assert.equal((await reset.reload()).used,true);
  const replacement=await fixture('reset-race-old@example.invalid','donor'),unchanged=replacement.password;
  await c.post(`/reset-password/${token}`,{newPassword:'NeverAppliedAfterRace!2026',confirmPassword:'NeverAppliedAfterRace!2026'});
  assert.equal((await replacement.reload()).password,unchanged);
});

test('admin password reset and archive revoke links; inactive or archived accounts cannot request or consume a reset',async()=>{
  authLimiter.resetKey('127.0.0.1');
  const active=await fixture('reset-admin-change@example.invalid','donor');
  const adminReset=await PasswordReset.create({email:active.email,token:hashToken('SyntheticPriorAdminResetPasswordLink'),expiresAt:new Date(Date.now()+3600000)});
  await UserService.resetPassword(active.id,admin.id);assert.equal((await adminReset.reload()).used,true);
  const archived=await fixture('reset-archived@example.invalid','donor'),inactive=await fixture('reset-inactive@example.invalid','donor');
  const archiveReset=await PasswordReset.create({email:archived.email,token:hashToken('SyntheticPriorArchivedPasswordLink'),expiresAt:new Date(Date.now()+3600000)});
  await UserService.deleteUser(archived.id,admin.id);assert.equal((await archiveReset.reload()).used,true);
  await UserService.updateUser(inactive.id,{isActive:false},admin.id);
  const c=await client();
  for(const user of [archived,inactive]) {
    const before=await PasswordReset.count({where:{email:user.email}});
    assert.equal((await c.post('/forgot-password',{email:user.email})).status,200);assert.equal(await PasswordReset.count({where:{email:user.email}}),before);
    const token=`SyntheticInactivePasswordResetLink${user.id}`,record=await PasswordReset.create({email:user.email,token:hashToken(token),expiresAt:new Date(Date.now()+3600000)}),passwordBefore=user.password;
    assert.equal((await c.post(`/reset-password/${token}`,{newPassword:'NeverAppliedInactiveReset!2026',confirmPassword:'NeverAppliedInactiveReset!2026'})).status,302);
    await user.reload();assert.equal(user.password,passwordBefore);assert.equal(user.isActive,false);assert.equal((await record.reload()).used,false);
  }
  assert.ok((await archived.reload()).archivedAt);
});
test('public map approximates unauthorized request coordinates and stale outreach is superseded',async()=>{
  const request=await BloodRequest.create({patientName:'Synthetic map patient',patientAge:25,bloodType:'O+',unitsRequired:2,hospitalName:'Synthetic map hospital',hospitalAddress:'Synthetic address',city:'Calapan',province:'Oriental Mindoro',latitude:13.4071234,longitude:121.1812345,contactPerson:'Synthetic',contactNumber:'09123456789',email:'synthetic@example.invalid',urgency:'urgent',requiredByDate:new Date(Date.now()+86400000),userId:admin.id,status:'active',hospitalStatus:'approved'});
  const c=await client(ordinary.email);const data=await (await c.request('/api/map-pins')).json();const pin=data.pins.requests.find(p=>p.id===request.id);
  assert.equal(pin.canViewDetails,false);assert.equal(pin.approximate,true);assert.notEqual(Number(pin.lat),Number(request.latitude));assert.equal(JSON.stringify(pin).includes('Synthetic map patient'),false);
  const row=await EmailOutbox.create({kind:'nearby-request',recipient:ordinary.email,payload:{recipientName:'Browser',request:{id:request.id,version:request.version}}});
  await request.update({status:'cancelled',version:request.version+1});let attempted=false;
  await processEmailOutbox({service:{sendNearbyRequestEmail:async(_email,_name,current)=>{if(current.id===request.id)attempted=true;return {success:true};}},maximum:100});
  assert.equal((await row.reload()).status,'superseded');assert.equal(attempted,false);
});
test('multipart voice upload keeps recordings private and only conversation members can play them',async()=>{
  const sender=await client(ordinary.email),recipient=await client(admin.email);
  const bytes=Buffer.alloc(44);bytes.write('RIFF',0);bytes.writeUInt32LE(36,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(96000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
  const form=new FormData();form.set('audio',new Blob([bytes],{type:'audio/wav'}),'synthetic.wav');form.set('recipientId',String(admin.id));form.set('duration','1');
  const uploaded=await sender.request('/messages/send-voice',{method:'POST',headers:{Accept:'application/json','X-CSRF-Token':sender.csrf},body:form});assert.equal(uploaded.status,200);
  const data=await uploaded.json();assert.equal(data.success,true);
  const message=await Message.findByPk(Number(data.audioFilePath.split('/').pop()));
  try {
    assert.equal((await sender.request(data.audioFilePath)).status,200);
    const playback=await recipient.request(data.audioFilePath);assert.equal(playback.status,200);assert.ok(playback.headers.get('cache-control').includes('no-store'));
    const outsider=await fixture('voice-outsider@example.invalid','donor'),c=await client(outsider.email);assert.equal((await c.request(data.audioFilePath)).status,404);
    const anonymous=await client();assert.equal((await anonymous.request(data.audioFilePath,{headers:{Accept:'application/json'}})).status,401);
  }finally{
    const {privateVoiceDirectory}=await import('../../controllers/messageController.js');
    assert.match(message.audioFilePath,/^private:[a-f0-9]{48}\.wav$/);
    await fs.rm(path.join(privateVoiceDirectory,message.audioFilePath.slice(8)),{force:true});
  }
});
test('real socket transport rejects outsider call IDs and revokes a connected session',async()=>{
  const attacker=await fixture('socket-outsider@example.invalid','donor');
  const caller=await client(admin.email),callee=await client(ordinary.email),outsider=await client(attacker.email);
  const sockets=[];
  const once=(socket,event)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`Timed out waiting for ${event}`)),5000);socket.once(event,data=>{clearTimeout(timeout);resolve(data);});});
  const connect=async c=>{const socket=connectSocket(base,{transports:['websocket'],extraHeaders:{Cookie:c.cookie,Origin:process.env.BASE_URL},forceNew:true,reconnection:false});sockets.push(socket);await once(socket,'connect');return socket;};
  const {Call}=await import('../../models/callModel.js');
  try {
    const [a,b,c]=await Promise.all([connect(caller),connect(callee),connect(outsider)]);
    const incoming=once(b,'call:incoming');a.emit('call:offer',{recipientId:ordinary.id,offer:{type:'offer',sdp:'Synthetic signaling fixture'},callType:'audio'});
    const call=await incoming;
    const denial=once(c,'call:error');c.emit('call:end',{callId:call.callId});assert.equal((await denial).code,'CALL_UNAVAILABLE');
    const accepted=once(a,'call:accepted');b.emit('call:answer',{callId:call.callId,answer:{type:'answer',sdp:'Synthetic answer fixture'}});assert.equal((await accepted).callId,call.callId);
    await UserService.updateUser(attacker.id,{isActive:false},admin.id);
    const revoked=once(c,'call:error');c.emit('call:ice-candidate',{callId:call.callId,candidate:{candidate:'synthetic'}});assert.equal((await revoked).code,'AUTH_REQUIRED');
    const ended=once(b,'call:ended');a.emit('call:end',{callId:call.callId});await ended;
    const recorded=await Call.findByPk(call.callId);assert.equal(recorded.outcome,'completed');assert.ok(recorded.endedAt);
  }finally{for(const socket of sockets)socket.disconnect();}
});
after(async()=>{await new Promise(resolve=>io.close(resolve));if(httpServer.listening)await new Promise(resolve=>httpServer.close(resolve));await sequelize.close();});
