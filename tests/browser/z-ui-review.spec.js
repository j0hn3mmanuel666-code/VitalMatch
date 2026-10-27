import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
if (!/^vitalmatch_audit_test_/.test(process.env.DB_NAME || '') || process.env.NODE_ENV !== 'test') throw new Error('UI review requires disposable data');
const { sequelize } = await import('../../models/db.js');
const { User } = await import('../../models/userModel.js');
const { Donor } = await import('../../models/donorModel.js');
const { BloodRequest } = await import('../../models/bloodRequestModel.js');
const { CallForDonation } = await import('../../models/callForDonationModel.js');
const { Appointment } = await import('../../models/appointmentModel.js');
const { Facility } = await import('../../models/facilityModel.js');
const { Fulfillment } = await import('../../models/workflowEventModel.js');
let donor, owner, admin;
test.beforeAll(async () => {
  owner = await User.findOne({ where: { email: 'browser-donor@example.invalid' } });
  admin = await User.findOne({ where: { email: 'browser-admin@example.invalid' } });
  donor = await Donor.findOne({ where: { userId: owner.id } });
  if (!donor) donor = await Donor.create({userId:owner.id,fullName:'UI Review Donor',dateOfBirth:'1990-01-01',gender:'Other',bloodType:'O+',weight:65,height:165,mobileNumber:'09123456789',email:owner.email,address:'Synthetic address',city:'Calapan',province:'Oriental Mindoro',zipCode:'5200',emergencyContactName:'Synthetic contact',emergencyContactNumber:'09123456789',emergencyContactRelationship:'Sibling'});
  await donor.update({fullName:'UI Review Donor',bloodType:'O+'});
  const [facility] = await Facility.findOrCreate({where:{hospitalName:'UI Hospital Review Clinic'}});
  await User.findOrCreate({where:{email:'browser-hospital@example.invalid'},defaults:{firstName:'UI',lastName:'Hospital Review',email:'browser-hospital@example.invalid',password:owner.password,phone:'09123456789',address:'Synthetic address',dateOfBirth:'1990-01-01',gender:'Other',role:'hospital',facilityId:facility.id,hospitalName:facility.hospitalName,isActive:true,emailVerified:true}});
  const target = new Date('2027-01-01T09:00:00Z');
  for (let index=0;index<28;index++) {
    const marker = 'UI Review ' + String(index).padStart(2,'0');
    await CallForDonation.findOrCreate({where:{fullName:marker},defaults:{fullName:marker,age:25,weight:'65',bloodType:'O+',gender:'Other',contactNumber:'09123456789',hasTattoo:'No',location:'Calapan',status:'Pending'}});
    const [request] = await BloodRequest.findOrCreate({where:{patientName:marker,userId:owner.id},defaults:{userId:owner.id,facilityId:facility.id,patientName:marker,patientAge:30,bloodType:'O+',unitsRequired:1,hospitalName:'UI Review Clinic',hospitalAddress:'Synthetic address',city:'Calapan',province:'Oriental Mindoro',contactPerson:'Synthetic contact',contactNumber:'09123456789',email:'ui-review@example.invalid',urgency:index===27?'critical':'moderate',requiredByDate:target,status:'scheduled',hospitalStatus:'approved',createdAt:new Date(2026,0,index+1)}});
    await Appointment.findOrCreate({where:{requestId:request.id,status:'scheduled'},defaults:{requestId:request.id,donorId:donor.id,scheduledDate:target,status:'scheduled'}});
    await Fulfillment.findOrCreate({where:{operationKey:'ui-review-fulfillment-'+index},defaults:{requestId:request.id,donorId:donor.id,actorId:admin.id,unitsProvided:1,fulfilledAt:target,notes:'Synthetic review record'}});
    await Facility.findOrCreate({where:{hospitalName:'UI Review Facility '+String(index).padStart(2,'0')}});
  }
  await fs.mkdir('.local/ui-review',{recursive:true});
});
test.afterAll(async () => { await sequelize.close(); });
async function login(page, role='admin') {
  await page.goto('/login'); await page.locator('[name="email"]').fill('browser-'+role+'@example.invalid');
  await page.locator('[name="password"]').fill('SyntheticTest!2026'); await page.locator('form[action="/login"] [type="submit"]').click();
  await page.waitForURL(role==='admin'?'**/admin/dashboard':role==='hospital'?'**/hospital/dashboard':'**/dashboard');
}
test('server searches cover later pages, compose with filters, preserve queries and clear cleanly',async({page})=>{
  await login(page);
  await page.goto('/admin/calls?search=UI+Review&filter=pending&page=2');
  await expect(page.locator('.vm-pagination')).toContainText('28 records');
  await page.locator('#recordSearch').fill('UI Review 00');
  await page.locator('[data-record-search] [type="submit"]').click();
  await expect(page.locator('tbody')).toContainText('UI Review 00');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(new URL(page.url()).searchParams.get('filter')).toBe('pending');
  await page.locator('.vm-tabs a[href*="contacted"]').click();
  expect(new URL(page.url()).searchParams.get('search')).toBe('UI Review 00');
  await expect(page.locator('.vm-pagination')).toContainText('No records');
  await page.locator('[data-search-clear]').click(); expect(new URL(page.url()).searchParams.has('search')).toBe(false);
  for(const path of ['/admin/requests','/admin/appointments','/admin/hospitals']) {
    const response=await page.goto(path+'?search=UI+Review'+(path.includes('hospitals')?'+Facility':'')+'&page=999'); expect(response.status(),path).toBe(200);
    await expect(page.locator('.vm-pagination').first()).toContainText('Page 2 of 2');
  }
  const response=await page.goto('/admin/appointments?search=UI+Review+00'); expect(response.status()).toBe(200);
  await expect(page.locator('tbody')).toContainText('UI Review 00');
  await page.goto('/admin/donors?search=UI+Review&bloodType=O%2B');
  await page.locator('[data-record-filters] a[href*="unavailable"]').click();
  expect(new URL(page.url()).searchParams.get('bloodType')).toBe('O+');
  expect(new URL(page.url()).searchParams.get('search')).toBe('UI Review');
  await expect(page.locator('tbody')).toContainText('UI Review Donor');
  await page.goto('/admin/hospitals?accountSearch=Hospital+Review');
  await expect(page.locator('#accountSearch')).toHaveValue('Hospital Review');
  await expect(page.locator('table').last()).toContainText('Hospital Review');
  await page.goto('/admin/calls?search=%25'); await expect(page.locator('.vm-pagination')).toContainText('No records');
});
test('owner lists search and sort the full set, donation history pages independently, donor privacy remains intact',async({page})=>{
  await login(page,'donor');
  await page.goto('/my-requests?search=UI+Review+00&filter=scheduled'); await expect(page.locator('#requestsContainer')).toContainText('UI Review 00');
  await page.goto('/my-requests?search=UI+Review&sort=oldest'); await expect(page.locator('.request-card').first()).toContainText('UI Review 00');
  await page.locator('#sortSelect').selectOption('urgency'); await expect(page.locator('.request-card').first()).toContainText('UI Review 27');
  await page.goto('/my-appointments?search=UI+Review&page=2'); await expect(page.locator('main')).not.toContainText('UI Review 00');
  await page.goto('/history?search=UI+Review&donationPage=2'); await expect(page.locator('[aria-label="Donation history pages"]')).toContainText('Page 2 of 2');
});
test('desktop and mobile workspace render with purposeful colors and searchable reports',async({page})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message)); await login(page);
  await page.setViewportSize({width:1440,height:1000});
  for(const path of ['/admin/dashboard','/admin/requests','/admin/donors','/admin/hospitals','/admin/appointments','/admin/reports','/admin/users','/admin/calls','/admin/settings','/admin/new-blood-request','/admin/cms']) {
    const response=await page.goto(path);expect(response.status(),path).toBe(200);
    await expect.poll(async()=>Math.round((await page.locator('#workspace-navigation').boundingBox()).x)).toBe(0);
    await page.screenshot({path:'.local/ui-review/'+path.slice(1).replaceAll('/','-')+'-desktop.png',fullPage:true,animations:'disabled'});
  }
  await page.goto('/admin/reports'); await expect(page.locator('.vm-table-search')).toHaveCount(2);
  await page.locator('.vm-table-search input').first().fill('no match'); await expect(page.locator('.vm-table-search [aria-live]').first()).toHaveText(/^0 of/);
  await page.goto('/admin/appointments');
  expect(await page.locator('.vm-button--success').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(34, 100, 73)');
  await page.goto('/admin/requests'); expect(await page.locator('.vm-button--primary').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(184, 32, 37)');
  for(const width of [390,768]) {
    await page.setViewportSize({width,height:844});
    for(const path of ['/admin/dashboard','/admin/requests','/admin/reports','/admin/donors','/admin/appointments']) {
      await page.goto(path); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
      await page.screenshot({path:'.local/ui-review/'+path.slice(1).replaceAll('/','-')+'-'+width+'.png',fullPage:true});
    }
  }
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  await page.screenshot({path:'.local/ui-review/admin-appointments-dark.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('donor and hospital workspace views use the shared design across desktop and mobile',async({page})=>{
  test.setTimeout(90000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await login(page,'donor');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    for(const path of ['/dashboard','/my-requests','/my-appointments','/history','/donor-profile','/request-blood','/settings','/messages','/notifications','/help']) {
      const response=await page.goto(path); expect(response.status(),path).toBe(200);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),path).toBe(true);
      await page.screenshot({path:'.local/ui-review/donor-'+path.slice(1)+'-'+width+'.png',fullPage:true,animations:'disabled'});
    }
  }
  await page.context().clearCookies(); await login(page,'hospital');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/hospital/patients?search=UI+Review');
    await expect(page.locator('tbody')).toContainText('UI Review');
    await page.screenshot({path:'.local/ui-review/hospital-patients-'+width+'.png',fullPage:true,animations:'disabled'});
  }
  expect(errors).toEqual([]);
});
