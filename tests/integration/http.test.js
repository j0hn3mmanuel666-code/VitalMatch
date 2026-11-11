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
const { authLimiter, generalLimiter } = await import('../../middleware/security.js');
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
test('unauthenticated HTML navigation through a service worker redirects to login while API fetches stay JSON',async()=>{
  const page=await fetch(base+'/admin/dashboard',{redirect:'manual',headers:{Accept:'text/html','Sec-Fetch-Dest':'empty'}});
  assert.equal(page.status,302);
  assert.equal(page.headers.get('location'),'/login');
  const api=await fetch(base+'/admin/users/api',{redirect:'manual',headers:{Accept:'text/html','Sec-Fetch-Dest':'empty'}});
  assert.equal(api.status,401);
  assert.equal((await api.json()).error,'Authentication required');
  const background=await fetch(base+'/admin/dashboard',{redirect:'manual',headers:{Accept:'application/json','Sec-Fetch-Dest':'empty'}});
  assert.equal(background.status,401);
  assert.equal((await background.json()).redirect,'/login');
});
test('inbox contacts are role scoped, searchable, private, and open without sending',async()=>{
  const hospital=await fixture('contact-hospital@example.invalid','hospital');
  await hospital.update({firstName:'Contact',lastName:'Hospital',hospitalName:'Picker Medical Center'});
  const secondAdmin=await fixture('contact-admin@example.invalid','admin');
  const inactive=await fixture('contact-inactive@example.invalid','admin');await inactive.update({isActive:false});
  const unverified=await fixture('contact-unverified@example.invalid','admin');await unverified.update({emailVerified:false});
  const archived=await fixture('contact-archived@example.invalid','admin');await archived.update({archivedAt:new Date()});
  const guest=await client();assert.equal((await guest.request('/messages/contacts',{headers:{Accept:'application/json'}})).status,401);
  for(const account of [ordinary,hospital]) {
    const c=await client(account.email);
    const r=await c.request('/messages/contacts');assert.equal(r.status,200);
    const body=await r.json();assert.ok(body.contacts.some(p=>p.id===admin.id));assert.ok(body.contacts.some(p=>p.id===secondAdmin.id));
    assert.ok(body.contacts.every(p=>p.role==='admin' && !('email' in p) && !('password' in p)));
    assert.ok(!body.contacts.some(p=>[inactive.id,unverified.id,archived.id].includes(p.id)));
    const filtered=await (await c.request('/messages/contacts?q=Picker')).json();assert.deepEqual(filtered.contacts,[]);
    const page=await c.request('/messages');assert.match(await page.text(),/Message admin/);
    const before=await Message.count();const opened=await c.request(`/messages?userId=${secondAdmin.id}`);assert.equal(opened.status,200);assert.equal(await Message.count(),before);
    assert.equal((await c.request('/messages/admin')).status,302);
    const sent=await c.post('/messages/send',{recipientId:secondAdmin.id,message:'Synthetic direct admin contact'});
    assert.equal(sent.status,302);assert.equal(sent.headers.get('location'),`/messages?userId=${secondAdmin.id}`);
    assert.equal(await Message.count({where:{senderId:account.id,receiverId:secondAdmin.id,message:'Synthetic direct admin contact'}}),1);
  }
  const a=await client(admin.email);
  for(const query of ['Picker Medical','contact-hospital@example.invalid','Contact Hospital']) {
    const r=await a.request('/messages/contacts?q='+encodeURIComponent(query));assert.equal(r.status,200);
    const {contacts}=await r.json();assert.ok(contacts.some(p=>p.id===hospital.id && p.email===hospital.email));assert.ok(!contacts.some(p=>p.id===admin.id));
  }
  assert.deepEqual((await (await a.request('/messages/contacts')).json()).contacts,[]);
  assert.equal((await a.request('/messages/contacts?q[x]=bad')).status,400);
  assert.match(await (await a.request('/messages')).text(),/New message/);
  const sent=await a.post('/messages/send',{recipientId:hospital.id,message:'Synthetic admin-initiated conversation'});assert.equal(sent.status,302);
  const reopened=await a.request(`/messages?userId=${hospital.id}`);assert.match(await reopened.text(),/Synthetic admin-initiated conversation/);
});

test('workspace search finds older permitted requests and routes pages by role',async()=>{
  const fields={patientName:'Synthetic search patient',patientAge:25,bloodType:'O+',unitsRequired:1,hospitalName:'SearchNeedle Clinic',hospitalAddress:'Synthetic',city:'Calapan',province:'Oriental Mindoro',contactPerson:'Synthetic',contactNumber:'09123456789',email:'synthetic@example.invalid',urgency:'urgent',requiredByDate:new Date(Date.now()+86400000),status:'pending',hospitalStatus:'pending'};
  const own=await BloodRequest.create({...fields,userId:ordinary.id});
  await BloodRequest.bulkCreate(Array.from({length:21},()=>({...fields,hospitalName:'Newer filler clinic',userId:ordinary.id})));
  const privateRequest=await BloodRequest.create({...fields,hospitalName:'OtherPrivateNeedle Clinic',userId:admin.id});
  const c=await client(ordinary.email);
  assert.ok((await (await c.request('/api/search?q=SearchNeedle')).json()).results.some(r=>r.url===`/view-blood-request/${own.id}`));
  assert.ok(!(await (await c.request('/api/search?q=OtherPrivateNeedle')).json()).results.some(r=>r.url===`/view-blood-request/${privateRequest.id}`));
  assert.equal((await c.request('/api/search?q[x]=invalid')).status,400);
  assert.ok((await (await c.request('/api/search?q=appointments')).json()).results.some(r=>r.url==='/my-appointments'));
  const a=await client(admin.email);
  assert.ok((await (await a.request('/api/search?q=OtherPrivateNeedle')).json()).results.some(r=>r.url===`/view-blood-request/${privateRequest.id}`));
  assert.ok((await (await a.request('/api/search?q=donors')).json()).results.some(r=>r.url==='/admin/donors'));
  assert.equal((await c.request('/api/search?q='+('9'.repeat(80)))).status,200);
  assert.equal((await c.request('/api/search?q='+('x'.repeat(101)))).status,400);
  const {Facility}=await import('../../models/facilityModel.js');
  const facility=await Facility.create({hospitalName:'Search facility',verifiedAt:new Date()});
  const hospital=await fixture('workspace-search-hospital@example.invalid','hospital');await hospital.update({facilityId:facility.id});
  const assigned=await BloodRequest.create({...fields,hospitalName:'FacilityNeedle Clinic',userId:admin.id,facilityId:facility.id});
  const h=await client(hospital.email);
  assert.ok((await (await h.request('/api/search?q=FacilityNeedle')).json()).results.some(r=>r.url===`/view-blood-request/${assigned.id}`));
  assert.ok(!(await (await h.request('/api/search?q=OtherPrivateNeedle')).json()).results.some(r=>r.url===`/view-blood-request/${privateRequest.id}`));
  assert.ok((await (await h.request('/api/search?q=appointments')).json()).results.some(r=>r.url==='/hospital/appointments'));
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
    assert.deepEqual(call.caller,{id:admin.id,name:`${admin.firstName} ${admin.lastName}`});
    const denial=once(c,'call:error');c.emit('call:end',{callId:call.callId});assert.equal((await denial).code,'CALL_UNAVAILABLE');
    const accepted=once(a,'call:accepted');b.emit('call:answer',{callId:call.callId,answer:{type:'answer',sdp:'Synthetic answer fixture'}});assert.equal((await accepted).callId,call.callId);
    await UserService.updateUser(attacker.id,{isActive:false},admin.id);
    const revoked=once(c,'call:error');c.emit('call:ice-candidate',{callId:call.callId,candidate:{candidate:'synthetic'}});assert.equal((await revoked).code,'AUTH_REQUIRED');
    const ended=once(b,'call:ended');a.emit('call:end',{callId:call.callId});await ended;
    const recorded=await Call.findByPk(call.callId);assert.equal(recorded.outcome,'completed');assert.ok(recorded.endedAt);
  }finally{for(const socket of sockets)socket.disconnect();}
});
test('optional prescription multipart upload is saved privately and protected by CSRF and ownership', async () => {
  const owner = await client(ordinary.email), reviewer = await client(admin.email);
  const other = await fixture('prescription-other@example.invalid', 'donor');
  const outsider = await client(other.email);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYioAAAAASUVORK5CYII=', 'base64');
  const fields = { patientName: 'Prescription test', patientAge: '25', bloodType: 'O+', unitsRequired: '1', hospitalName: 'Synthetic hospital', hospitalAddress: 'Synthetic address', city: 'Calapan', province: 'Oriental Mindoro', contactPerson: 'Synthetic contact', contactNumber: '09123456789', email: 'test@example.invalid', urgency: 'moderate', requiredByDate: new Date(Date.now() + 86400000).toISOString().slice(0,10), bloodComponents: 'wholeBlood', wholeBloodVolume: '1 unit', indicationOfTransfusion: 'Synthetic test indication' };
  function body({ image = true, csrf = owner.csrf, bytes = png } = {}) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    data.set('_csrf', csrf); data.set('submissionKey', crypto.randomUUID());
    if (image) data.set('medicalPrescription', new Blob([bytes], { type: 'image/png' }), 'prescription.png');
    return data;
  }
  assert.equal((await owner.request('/request-blood', { method: 'POST', body: body({ csrf: 'invalid' }) })).status, 403);
  const rejected = await owner.request('/request-blood', { method: 'POST', body: body({ bytes: Buffer.from('<svg/>') }) });
  assert.equal(rejected.headers.get('location'), '/new-blood-request');
  const response = await owner.request('/request-blood', { method: 'POST', body: body() });
  assert.match(response.headers.get('location'), /^\/view-blood-request\/\d+$/);
  const id = response.headers.get('location').split('/').pop();
  const row = await BloodRequest.findByPk(id);
  const { removePrescription } = await import('../../services/prescriptionService.js');
  try {
    assert.ok(row.prescriptionImage);
    const image = await owner.request('/requests/' + id + '/prescription');
    assert.equal(image.status, 200); assert.match(image.headers.get('cache-control'), /no-store/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    assert.equal((await reviewer.request('/requests/' + id + '/prescription')).status, 200);
    assert.equal((await outsider.request('/requests/' + id + '/prescription')).status, 404);
    assert.equal((await outsider.request('/private/prescriptions/' + row.prescriptionImage)).status, 404);
    await row.update({ hospitalStatus: 'declined' });
    const correction = body({ image: false }); correction.set('version', String(row.version));
    assert.equal((await owner.request('/requests/' + id + '/correct', { method: 'POST', body: correction })).headers.get('location'), '/view-blood-request/' + id);
    await row.reload(); assert.ok(row.prescriptionImage, 'correction without an image retains the prescription');
    await row.update({ hospitalStatus: 'declined' });
    const oldKey = row.prescriptionImage, replacement = body(); replacement.set('version', String(row.version));
    assert.equal((await owner.request('/requests/' + id + '/correct', { method: 'POST', body: replacement })).headers.get('location'), '/view-blood-request/' + id);
    await row.reload(); assert.notEqual(row.prescriptionImage, oldKey);
    await assert.rejects(fs.access(path.resolve('private/prescriptions', oldKey)));
    const noImage = await owner.request('/request-blood', { method: 'POST', body: body({ image: false }) });
    assert.match(noImage.headers.get('location'), /^\/view-blood-request\/\d+$/);
    const optionalRow = await BloodRequest.findByPk(noImage.headers.get('location').split('/').pop());
    assert.equal(optionalRow.prescriptionImage, null);
  } finally { await removePrescription(row.prescriptionImage); }
});

test('donor map consent defaults off, grants and withdraws independently of availability for every viewer', async () => {
  const person = await fixture('map-consent@example.invalid', 'donor');
  const owner = await client(person.email), adminViewer = await client(admin.email), ordinaryViewer = await client(ordinary.email);
  const hospital = await fixture('map-hospital@example.invalid', 'hospital');
  const hospitalViewer = await client(hospital.email);
  const fields = { fullName: 'Consent donor', dateOfBirth: '1995-01-01', gender: 'Other', bloodType: 'AB-', weight: '65', height: '170', mobileNumber: '09123456789', address: 'Private test address', city: 'Calapan', province: 'Oriental Mindoro', zipCode: '5200', emergencyContactName: 'Private contact', emergencyContactNumber: '09123456789', emergencyContactRelationship: 'Sibling', latitude: '13.4071234', longitude: '121.1812345', isAvailable: 'on' };
  assert.equal((await owner.post('/api/mobile/donor-profile', fields)).status, 200);
  const donor = await Donor.findOne({ where: { userId: person.id } });
  assert.equal(donor.shareOnMap, false);
  const viewers = [ordinaryViewer, adminViewer, hospitalViewer];
  const baseline = await Promise.all(viewers.map(async c => (await (await c.request('/api/map-pins')).json()).limits.donors.total));
  const profileHtml = await (await owner.request('/donor-profile')).text();
  assert.match(profileHtml, /name="shareOnMap"/);
  const settingsHtml = await (await owner.request('/settings?tab=donor')).text();
  assert.match(settingsHtml, /mapVisibilityToggle/);
  const invalidCsrf = await owner.request('/settings/map-privacy', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ shareOnMap: 'on' }) });
  assert.equal(invalidCsrf.status, 403);
  assert.equal((await owner.post('/settings/map-privacy', { shareOnMap: 'yes' })).status, 400);
  assert.equal((await owner.post('/api/mobile/donor-profile', { ...fields, shareOnMap: 'on' })).status, 200);
  await donor.reload(); assert.equal(donor.shareOnMap, true); assert.ok(donor.mapConsentUpdatedAt);
  for (const [index, viewer] of viewers.entries()) {
    const response = await viewer.request('/api/map-pins'); assert.match(response.headers.get('cache-control'), /no-store/);
    const data = await response.json(); assert.equal(data.limits.donors.total, baseline[index] + 1);
    assert.equal(JSON.stringify(data).includes('Private test address'), false);
    assert.equal(JSON.stringify(data.pins.donors).includes('13.4071234'), false);
  }
  assert.equal((await owner.post('/api/mobile/donor-profile', fields)).status, 200);
  assert.equal((await donor.reload()).shareOnMap, true, 'older clients cannot silently change consent');
  const hidden = await owner.post('/settings/map-privacy', { shareOnMap: 'off', userId: ordinary.id });
  assert.equal(hidden.status, 200); await donor.reload(); assert.equal(donor.shareOnMap, false); assert.equal(donor.isAvailable, true);
  for (const [index, viewer] of viewers.entries()) {
    const data = await (await viewer.request('/api/map-pins')).json(); assert.equal(data.limits.donors.total, baseline[index]);
  }
  const ownMap = await (await owner.request('/api/map-pins')).json(); assert.equal(ownMap.pins.self.shareOnMap, false);
  assert.equal((await owner.post('/settings/map-privacy', { shareOnMap: 'on' })).status, 200);
  const unchecked = { ...fields, mapConsentSubmitted: '1' };
  assert.equal((await owner.post('/api/mobile/donor-profile', unchecked)).status, 200);
  assert.equal((await donor.reload()).shareOnMap, false, 'unchecked profile consent withdraws sharing');
});

test('remembered sign-in persists in MySQL past short inactivity, renews for mobile reads and logout revokes it',async()=>{
  authLimiter.resetKey('127.0.0.1');
  const user=await fixture('remembered-http@example.invalid','donor'),c=await client();
  const login=await c.request('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:c.csrf,email:user.email,password,rememberMe:'true'})});
  assert.equal(login.status,302);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
  assert.ok(new Date(cookie.match(/Expires=([^;]+)/i)[1]).getTime()-Date.now()>29*86400000);
  const [rows]=await sequelize.query('SELECT sid, expires, data FROM Sessions');
  const row=rows.find(r=>JSON.parse(r.data).userId===user.id);assert.ok(row);
  const data=JSON.parse(row.data);assert.equal(data.rememberMe,true);assert.ok(new Date(row.expires).getTime()-Date.now()>29*86400000);
  data.authenticatedAt=Date.now()-2*86400000;data.lastActivityAt=Date.now()-86400000;
  await sequelize.query('UPDATE Sessions SET data=:data WHERE sid=:sid',{replacements:{data:JSON.stringify(data),sid:row.sid}});
  const resumed=await c.request('/api/mobile/session',{headers:{Accept:'application/json'}});assert.equal(resumed.status,200);await resumed.json();
  assert.ok(new Date(resumed.headers.get('set-cookie').match(/Expires=([^;]+)/i)[1]).getTime()-Date.now()>29*86400000);
  const [renewed]=await sequelize.query('SELECT data FROM Sessions WHERE sid=:sid',{replacements:{sid:row.sid}});
  assert.ok(Date.now()-JSON.parse(renewed[0].data).lastActivityAt<60000);
  const savedCookie=c.cookie;
  const reopened=await fetch(base+'/api/mobile/session',{headers:{Cookie:savedCookie,Accept:'application/json'},redirect:'manual'});assert.equal(reopened.status,200);
  const dashboard=await (await c.request('/dashboard')).text();
  const logoutCsrf=dashboard.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] || dashboard.match(/name="_csrf"\s+value="([^"]+)"/)?.[1];assert.ok(logoutCsrf);
  assert.equal((await c.request('/logout',{method:'POST',headers:{'X-CSRF-Token':logoutCsrf}})).status,302);
  const signedOut=await fetch(base+'/api/mobile/session',{headers:{Cookie:savedCookie,Accept:'application/json'},redirect:'manual'});assert.equal(signedOut.status,401);
});

test('unchecked stay-signed-in uses the configured short session',async()=>{
  authLimiter.resetKey('127.0.0.1');const c=await client();
  const login=await c.request('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:c.csrf,email:ordinary.email,password})});
  assert.equal(login.status,302);const expiry=new Date(login.headers.get('set-cookie').match(/Expires=([^;]+)/i)[1]).getTime();
  assert.ok(expiry-Date.now()<9*3600000);assert.ok(expiry>Date.now());
});

test('reopening the site restores the right workspace and public navigation recognizes saved sessions',async()=>{
  authLimiter.resetKey('127.0.0.1');
  generalLimiter.resetKey('127.0.0.1');
  for(const [email,role,target] of [['return-admin@example.invalid','admin','/admin/dashboard'],['return-user@example.invalid','user','/dashboard'],['return-hospital@example.invalid','hospital','/hospital/dashboard'],['return-legacy@example.invalid','hospital_admin','/hospital/dashboard']]){
    const user=await fixture(email,role);const c=await client();
    const login=await c.request('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:c.csrf,email:user.email,password,rememberMe:'true'})});assert.equal(login.status,302);await login.text();
    const cookie=c.cookie;
    for(const entry of ['/','/login']){
      const reopened=await fetch(base+entry,{redirect:'manual',headers:{Cookie:cookie}});
      assert.equal(reopened.status,302,`${role} ${entry}`);assert.equal(reopened.headers.get('location'),target);
      assert.match(reopened.headers.get('cache-control'),/no-store/);
    }
    const about=await fetch(base+'/about',{headers:{Cookie:cookie}});const html=await about.text();
    assert.match(html,new RegExp('href="'+target+'"[^>]*>My account'));
    assert.doesNotMatch(html,/>Sign in<\/a>/);
    const preview=await fetch(base+'/?public=1',{redirect:'manual',headers:{Cookie:cookie}});assert.equal(preview.status,200);assert.match(await preview.text(),/My account/);
    await user.increment('authVersion');
    const revoked=await fetch(base+'/',{redirect:'manual',headers:{Cookie:cookie}});assert.equal(revoked.status,302);assert.equal(revoked.headers.get('location'),'/login');
  }
  const anonymous=await client();assert.equal((await anonymous.request('/')).status,200);assert.equal((await anonymous.request('/login')).status,200);
});

test('desktop and mobile browsers return to the dashboard after the signed-in tab is closed',async()=>{
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const width of [1280,390]){
      authLimiter.resetKey('127.0.0.1');generalLimiter.resetKey('127.0.0.1');
      const user=await fixture(`reopen-${width}@example.invalid`,'user');
      const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      try{
        let page=await context.newPage();await page.goto(base+'/login');
        await page.locator('#email').fill(user.email);await page.locator('#password').fill(password);
        assert.equal(await page.locator('#rememberMe').isChecked(),true);
        await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(base+'/dashboard');
        const cookie=(await context.cookies()).find(c=>c.name==='vitalmatch.sid');assert.ok(cookie&&cookie.expires*1000-Date.now()>29*86400000);
        await page.close();page=await context.newPage();await page.goto(base+'/');await page.waitForURL(base+'/dashboard');
        assert.equal(new URL(page.url()).pathname,'/dashboard');
        await page.goto(base+'/login');await page.waitForURL(base+'/dashboard');
      }finally{await context.close();}
    }
  }finally{await browser.close();}
});

test('message markup includes real ISO instants and Manila display time without rewriting sent dates',async()=>{
  authLimiter.resetKey('127.0.0.1');generalLimiter.resetKey('127.0.0.1');
  const {Message}=await import('../../models/messageModel.js');
  const sender=await fixture('timestamp-message@example.invalid','user'),sentAt=new Date('2026-11-05T17:45:00Z');
  const conversationId=[sender.id,admin.id].sort((a,b)=>a-b).join('-');
  const message=await Message.create({senderId:sender.id,receiverId:admin.id,conversationId,message:'Synthetic time check',messageType:'text',createdAt:sentAt});
  const c=await client(admin.email),page=await c.request('/messages?userId='+sender.id),html=await page.text();
  assert.equal(page.status,200);assert.match(html,/data-message-time-zone="Asia\/Manila"/);
  assert.match(html,/datetime="2026-11-05T17:45:00\.000Z"/);assert.match(html,/>01:45 AM<\/time>/);
  assert.match(html,/data-message-relative/);assert.match(html,/\/js\/message-time\.js\?v=1/);
  assert.equal((await message.reload()).createdAt.toISOString(),sentAt.toISOString());
});

after(async()=>{await new Promise(resolve=>io.close(resolve));if(httpServer.listening)await new Promise(resolve=>httpServer.close(resolve));await sequelize.close();});
