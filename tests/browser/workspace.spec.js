import { test, expect } from '@playwright/test';
if (!/^vitalmatch_audit_test_/.test(process.env.DB_NAME || '') || process.env.NODE_ENV !== 'test') throw new Error('Browser suite must use disposable data');
async function login(page, role = 'admin') {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(`browser-${role}@example.invalid`);
  await page.locator('input[name="password"]').fill('SyntheticTest!2026');
  await page.locator('form[action="/login"] button[type="submit"]').click();
  await page.waitForURL(role === 'admin' ? '**/admin/dashboard' : '**/dashboard');
}
test('public journey loads without script errors and keeps the approved entry points', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const path of ['/', '/login', '/register', '/forgot-password']) {
    await page.goto(path); await expect(page.locator('body')).toBeVisible();
    expect(await page.locator('main').count()).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('the real worker replaces a seeded stale script online and serves the refreshed public copy offline', async ({ page, context }) => {
  const asset = '/js/public-experience.js?v=1';
  const expected = await (await page.request.get(asset)).text();
  const cacheName = (await (await page.request.get('/sw.js')).text()).match(/const CACHE_NAME = '([^']+)'/)[1];
  await page.goto('/login');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const online = await page.evaluate(async ({asset, cacheName}) => {
    const cache = await caches.open(cacheName);
    await cache.put(asset, new Response('/* Synthetic stale script */', { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public' } }));
    const response = await fetch(asset);
    return { body: await response.text(), cached: await (await cache.match(asset)).text() };
  }, {asset, cacheName});
  expect(online.body).toBe(expected); expect(online.cached).toBe(expected);
  try {
    await context.setOffline(true);
    const offline = await page.evaluate(async asset => { const response = await fetch(asset); return { status: response.status, body: await response.text() }; }, asset);
    expect(offline.status).toBe(200); expect(offline.body).toBe(expected);
    const privateResponse = await page.evaluate(async () => { const response = await fetch('/api/notifications'); return { status: response.status, body: await response.text() }; });
    expect(privateResponse.status).toBe(503); expect(privateResponse.body).toContain('Network connection required');
  } finally { await context.setOffline(false); }
});
test('admin workspace pages execute scripts and protected responses are not service-worker cached', async ({ page }) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await login(page);
  for (const path of ['/admin/requests','/admin/users','/admin/donors','/admin/hospitals','/admin/appointments','/admin/reports','/admin/settings','/admin/calls','/map','/notifications']) {
    const response=await page.goto(path); expect(response.status(),path).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  }
  await page.request.get('/admin/users/api');
  const privateEntries=await page.evaluate(async()=>{const urls=[];for(const key of await caches.keys()){for(const req of await(await caches.open(key)).keys())if(/\/admin\/|\/api\/|\/messages\/|\/uploads\//.test(new URL(req.url).pathname))urls.push(req.url);}return urls;});
  expect(privateEntries).toEqual([]); expect(errors).toEqual([]);
});
test('donor and request forms initialize, keep entered values and reject invalid final submission', async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await login(page,'donor');
  await page.goto('/donor-profile');
  await expect(page.locator('#donorSubmitBtn')).toBeAttached();
  await page.locator('input[name="fullName"]').fill('Browser entered donor');
  await page.locator('#donorProfileForm').evaluate(form=>form.requestSubmit());
  await expect(page.locator('input[name="fullName"]')).toHaveValue('Browser entered donor');
  expect(new URL(page.url()).pathname).toBe('/donor-profile');
  await page.goto('/request-blood');
  await page.locator('input[name="patientName"]').fill('Browser entered patient');
  const requestCount=await page.request.get('/my-requests');expect(requestCount.status()).toBe(200);
  await page.locator('#bloodRequestForm').evaluate(form=>form.requestSubmit());
  expect(new URL(page.url()).pathname).toBe('/request-blood');
  await expect(page.locator('input[name="patientName"]')).toHaveValue('Browser entered patient');
  expect(errors).toEqual([]);
});
test('mobile workspace has usable navigation and no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page,'donor');
  for(const path of ['/dashboard','/donor-profile','/request-blood','/notifications','/history','/settings']){
    await page.goto(path);
    const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    expect(dimensions.scroll,path).toBeLessThanOrEqual(dimensions.width+2);
  }
});

test('account dialogs support keyboard cancellation and restore the invoking action without changing data', async ({ page }) => {
  await login(page);
  await page.goto('/admin/users');
  const trigger = page.locator('[data-action="delete-user"]').first();
  await expect(trigger).toBeVisible(); await trigger.click();
  const modal = page.locator('#deleteConfirmModal');
  await expect(modal).toBeVisible(); await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#cancelDeleteUser')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#confirmDeleteUser')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(modal).toBeHidden(); await expect(trigger).toBeFocused();
});
