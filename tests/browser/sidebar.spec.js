import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import hbs from 'hbs';

// Render the real shared partials and assets with synthetic role data; no server or database required.
const handlebars = hbs.create().handlebars;
handlebars.registerHelper('eq', (left, right) => left === right);
for (const name of ['brand-mark', 'user-sidebar', 'admin-sidebar', 'internal-header', 'confirm-dialog']) {
  handlebars.registerPartial(name, readFileSync(new URL(`../../views/partials/${name}.xian`, import.meta.url), 'utf8'));
}
const render = handlebars.compile('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"><script src="/js/internal-ui.js" defer></script></head><body class="vm-internal {{#if isAdmin}}vm-admin{{else}}vm-account{{/if}}">{{> confirm-dialog}}{{> user-sidebar}}{{> internal-header}}<main class="vm-page"><h1>Workspace</h1><a href="/example">Example action</a></main></body></html>');

async function loadSidebar(page, role) {
  const body = render({ isAdmin: role === 'admin', navUser: { role, firstName: 'Example', lastName: 'Account' }, navInitial: 'E', navUnread: 3, navUnreadMsgs: 2 });
  await page.route('http://sidebar.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/css/') || path.startsWith('/js/')) {
      await route.fulfill({ body: readFileSync(new URL(`../../public${path}`, import.meta.url)), contentType: path.endsWith('.css') ? 'text/css' : 'application/javascript' });
    } else await route.fulfill({ body, contentType: 'text/html' });
  });
  await page.goto('http://sidebar.test/dashboard');
}

for (const role of ['admin', 'donor', 'hospital', 'user']) {
  test(`${role}: minimizing keeps an accessible icon rail and a single menu button`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await loadSidebar(page, role);
    const toggle = page.locator('[data-sidebar-toggle]');
    const sidebar = page.locator('#workspace-navigation');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAccessibleName('Minimize navigation');
    await expect(sidebar).toHaveCSS('width', '232px');
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Expand navigation');
    expect(await sidebar.evaluate(element => element.inert)).toBe(false);
    await expect(sidebar).toHaveCSS('width', '72px');
    const bounds = await sidebar.boundingBox();
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(72);
    expect(await page.locator('body').evaluate(element => getComputedStyle(element).paddingLeft)).toBe('72px');
    for (const control of await sidebar.locator('nav a, nav > button, a[href="/logout"]').all()) {
      await expect(control).toHaveAttribute('aria-label', /.+/);
      await expect(control).toHaveAttribute('title', /.+/);
      const icon = control.locator('svg:visible').first();
      await expect(icon).toBeVisible();
      const box = await icon.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(72);
    }
    for (const label of await sidebar.locator('nav a span, nav > button span, .vm-sidebar__brand > div, .vm-sidebar__profile > div').all()) {
      await expect(label).toBeHidden();
    }
    const firstLink = sidebar.locator('nav a').first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
    await page.screenshot({ path: `.local/test-results/browser/sidebar-${role}-collapsed.png` });
    await page.reload();
    await expect(toggle).toHaveAccessibleName('Expand navigation');
    await expect(sidebar).toHaveCSS('width', '72px');
    await firstLink.click();
    expect(new URL(page.url()).pathname).toBe(role === 'admin' ? '/admin/dashboard' : role === 'hospital' ? '/hospital/dashboard' : '/dashboard');
    await toggle.click();
    await expect(sidebar).toHaveCSS('width', '232px');
    await expect(sidebar.locator('nav a').first().locator('span').first()).toBeVisible();
  });

  test(`${role}: mobile drawer still opens and closes after desktop minimization`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await loadSidebar(page, role);
    const toggle = page.locator('[data-sidebar-toggle]');
    const sidebar = page.locator('#workspace-navigation');
    await toggle.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toHaveAccessibleName('Open navigation');
    expect(await sidebar.evaluate(element => element.inert)).toBe(true);
    await toggle.click();
    await expect(sidebar.locator('nav a').first().locator('span').first()).toBeVisible();
    await expect(sidebar.locator('[data-sidebar-close]')).toBeFocused();
    expect(await page.locator('main').evaluate(element => element.inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    expect(await page.locator('main').evaluate(element => Boolean(element.inert))).toBe(false);
    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(toggle).toHaveAccessibleName('Expand navigation');
    await expect(sidebar).toHaveCSS('width', '72px');
    expect(await sidebar.evaluate(element => element.inert)).toBe(false);
  });
}
