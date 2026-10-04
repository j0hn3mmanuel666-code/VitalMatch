import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

const code = readFileSync(new URL('../public/js/workspace-search.js', import.meta.url), 'utf8');
function environment({ desktop = false } = {}) {
  const { window, document } = parseHTML('<html><body><header class="vm-header"><button data-sidebar-toggle>Navigation</button><div><input id="dashboardSearch"><div id="dashboardSearchResults" class="hidden"></div></div><button id="search-trigger" aria-controls="dashboardMobileSearch" aria-expanded="false">Search</button><button id="notificationBtn">Notifications</button><div id="notificationDropdown" class="hidden"></div><div id="dashboardMobileSearch" class="hidden"><input id="dashboardMobileSearchInput"><div id="dashboardMobileSearchResults" class="hidden"></div></div></header><div id="emergencyModal" class="hidden"></div><div id="requestNotificationModal" class="hidden"></div></body></html>');
  let focus; const timers = new Map(); let timerId = 0;
  window.HTMLElement.prototype.focus = function () { focus = this; };
  Object.defineProperty(document, 'activeElement', { get: () => focus });
  window.matchMedia = () => ({ matches: desktop });
  const env = { window, document, timers, network: async () => ({ ok: true, json: async () => ({ results: [{ title: '<img src=x> Request', subtitle: 'Calapan', url: '/my-requests', status: 'active' }] }) }) };
  runInNewContext(code, { window, document, fetch: (...args) => env.network(...args), setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id) });
  env.search = mobile => { const field = document.getElementById(mobile ? 'dashboardMobileSearchInput' : 'dashboardSearch'); field.value = 'request'; window.handleDashboardSearch({ target: field }, mobile); };
  env.flush = async () => { const callbacks = [...timers.values()]; timers.clear(); await Promise.all(callbacks.map(callback => callback())); };
  return env;
}

test('workspace search focuses and displays results in the visible desktop or mobile region', async () => {
  for (const desktop of [false, true]) {
    const env = environment({ desktop });
    env.window.focusWorkspaceSearch();
    assert.equal(env.document.activeElement.id, desktop ? 'dashboardSearch' : 'dashboardMobileSearchInput');
    env.search(!desktop); await env.flush();
    const result = env.document.getElementById(desktop ? 'dashboardSearchResults' : 'dashboardMobileSearchResults');
    assert.equal(result.classList.contains('hidden'), false);
    assert.equal(result.getAttribute('aria-busy'), 'false');
    assert.equal(result.querySelector('a').getAttribute('href'), '/my-requests');
    assert.equal(result.querySelector('img'), null, 'titles are text rather than HTML');
    assert.equal(result.querySelector('strong').textContent, '<img src=x> Request');
  }
});

test('search reports an unavailable connection and ignores a response after the user clears the query', async () => {
  const env = environment();
  env.network = async () => { throw new Error('offline'); };
  env.search(true); await env.flush();
  const result = env.document.getElementById('dashboardMobileSearchResults');
  assert.match(result.textContent, /temporarily unavailable/);
  let resolve;
  env.network = () => new Promise(done => { resolve = done; });
  env.search(true); const pending = env.flush();
  const field = env.document.getElementById('dashboardMobileSearchInput'); field.value = '';
  env.window.handleDashboardSearch({ target: field }, true);
  resolve({ ok: true, json: async () => ({ results: [] }) }); await pending;
  assert.equal(result.classList.contains('hidden'), true);
});

test('closing mobile search restores its trigger and accurately clears the expanded state', async () => {
  const env = environment();
  env.window.toggleDashboardMobileSearch();
  assert.equal(env.document.getElementById('search-trigger').getAttribute('aria-expanded'), 'true');
  env.search(true); await env.flush();
  env.window.closeWorkspaceSearch();
  assert.equal(env.document.getElementById('dashboardMobileSearch').classList.contains('hidden'), true);
  assert.equal(env.document.getElementById('search-trigger').getAttribute('aria-expanded'), 'false');
  assert.equal(env.document.activeElement.id, 'search-trigger');
});

test('dashboard initialization uses the shared search and navigation controls without demo timers', () => {
  const env = environment();
  const source = readFileSync(new URL('../views/dashboard.xian', import.meta.url), 'utf8');
  const inline = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  // No timer or retired sidebar globals are provided: initialization must use the shared controls.
  runInNewContext(inline, { window: env.window, document: env.document });
  env.document.dispatchEvent(new env.window.Event('DOMContentLoaded'));
  const key = new env.window.Event('keydown', { cancelable: true }); Object.assign(key, { key: 'k', ctrlKey: true });
  env.document.dispatchEvent(key);
  assert.equal(key.defaultPrevented, true);
  assert.equal(env.document.activeElement.id, 'dashboardMobileSearchInput');
  let toggled = false;
  env.document.querySelector('[data-sidebar-toggle]').addEventListener('click', () => { toggled = true; });
  const menu = new env.window.Event('keydown', { cancelable: true }); Object.assign(menu, { key: 'm', altKey: true });
  env.document.dispatchEvent(menu);
  assert.equal(toggled, true);
});
