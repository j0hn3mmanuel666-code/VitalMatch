import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import hbs from 'hbs';

const handlebars = hbs.create().handlebars;
for (const name of ['admin-head', 'head', 'admin-sidebar', 'user-sidebar', 'internal-header', 'footer']) handlebars.registerPartial(name, '');
const template = handlebars.compile(readFileSync(new URL('../../views/messages.xian', import.meta.url), 'utf8').replace(/<script>([\s\S]*?)<\/script>/g, ''));

async function inbox(page, isAdmin, { fail = false, empty = false } = {}) {
  const contacts = [{ id: 7, name: 'Alex <Admin>', role: isAdmin ? 'hospital' : 'admin', hospitalName: isAdmin ? 'Calapan Hospital' : null, ...(isAdmin ? { email: 'alex@example.invalid' } : {}) }];
  await page.route('http://inbox.test/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/')) {
      return route.fulfill({ body: readFileSync(new URL(`../../public${url.pathname}`, import.meta.url)), contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript' });
    }
    if (url.pathname === '/messages/contacts') {
      if (fail) { fail = false; return route.fulfill({ status: 503, json: { error: 'unavailable' } }); }
      return route.fulfill({ json: { contacts: empty ? [] : contacts, hasMore: false } });
    }
    const body = template({ isAdmin, conversations: [], messages: [], currentUserId: 1 });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"></head><body class="vm-internal">${body}</body></html>` });
  });
  await page.goto('http://inbox.test/messages');
}

for (const isAdmin of [false, true]) {
  for (const mobile of [false, true]) {
    test(`${isAdmin ? 'admin account search' : 'admin picker'} at ${mobile ? 'phone' : 'desktop'} size`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 });
      await inbox(page, isAdmin);
      const toggle = page.getByRole('button', { name: isAdmin ? 'New message' : 'Message admin', exact: true });
      await toggle.click();
      await expect(page.locator('#contactSearch')).toBeFocused();
      if (isAdmin) {
        await expect(page.getByRole('status')).toHaveText('Enter at least 2 characters to find an account.');
        await page.getByLabel('Name, email, or hospital').fill('Calapan');
      }
      const contact = page.locator('.vm-contact-result');
      await expect(contact).toHaveText(isAdmin ? 'Alex <Admin>hospital · Calapan Hospital · alex@example.invalid' : 'Alex <Admin>Administrator');
      await expect(contact).toHaveAttribute('href', '/messages?userId=7');
      await expect(page.locator('#contactResults admin')).toHaveCount(0);
      await page.locator('#contactSearch').press('Escape');
      await expect(page.locator('#contactPicker')).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      await expect(contact).toBeVisible();
      await page.screenshot({ path: `.local/deployment/contacts-${isAdmin ? 'admin' : 'user'}-${mobile ? 'phone' : 'desktop'}.png` });
      await page.locator('html').evaluate(element => element.classList.add('dark'));
      await page.screenshot({ path: `.local/deployment/contacts-${isAdmin ? 'admin' : 'user'}-${mobile ? 'phone' : 'desktop'}-dark.png` });
      await contact.click();
      await expect(page).toHaveURL('http://inbox.test/messages?userId=7');
    });
  }
}

test('contact loading failure offers retry and empty results are explained', async ({ page }) => {
  await inbox(page, false, { fail: true, empty: true });
  await page.getByRole('button', { name: 'Message admin', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Could not load contacts. Please try again.');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No administrators are available');
  await page.locator('#contactSearch').fill('nobody');
  await expect(page.getByRole('status')).toHaveText('No contacts match your search.');
});
