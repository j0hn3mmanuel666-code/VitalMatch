import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

const dialogMarkup = readFileSync(new URL('../views/partials/confirm-dialog.xian', import.meta.url), 'utf8');
const dialogCode = readFileSync(new URL('../public/js/confirm-dialog.js', import.meta.url), 'utf8');
function environment() {
  const { window, document } = parseHTML('<!doctype html><html><head><meta name="csrf-token" content="test-token"></head><body><button id="trigger">Delete request</button><main id="content"></main>' + dialogMarkup + '</body></html>');
  let focus = document.getElementById('trigger');
  Object.defineProperty(document, 'activeElement', { get: () => focus });
  window.HTMLElement.prototype.focus = function () { focus = this; };
  const requests = [];
  window.location = { href: '/my-requests' };
  runInNewContext(dialogCode, { window, document, Promise, fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; } });
  function key(key, shiftKey = false) {
    const event = new window.Event('keydown', { cancelable: true });
    Object.assign(event, { key, shiftKey }); document.dispatchEvent(event); return event;
  }
  return { window, document, key, requests, modal: document.getElementById('confirmModal'), trigger: document.getElementById('trigger'), action: document.getElementById('confirmModalAction') };
}

test('canceling a destructive confirmation resolves false, isolates the background, and restores focus', async () => {
  const env = environment();
  const content = env.document.getElementById('content');
  content.inert = true;
  const result = env.window.confirmAction({ title: 'Delete request?', icon: 'danger' });
  assert.equal(env.modal.classList.contains('hidden'), false);
  assert.equal(env.trigger.inert, true);
  assert.notEqual(env.document.activeElement, env.action);
  env.key('Escape');
  assert.equal(await result, false);
  assert.equal(env.modal.classList.contains('hidden'), true);
  assert.equal(content.inert, true, 'pre-existing inert state survives');
  assert.equal(env.trigger.inert, undefined);
  assert.equal(env.document.activeElement, env.trigger);
});

test('dialog traps Tab in both directions and excludes hidden CSRF fields', () => {
  const env = environment();
  env.window.openConfirmModal({ title: 'Confirm', icon: 'danger' });
  const csrf = env.document.createElement('input'); csrf.type = 'hidden'; csrf.name = '_csrf'; env.modal.append(csrf);
  const first = env.modal.querySelector('button');
  env.action.focus();
  assert.equal(env.key('Tab').defaultPrevented, true);
  assert.equal(env.document.activeElement, first);
  env.key('Tab', true);
  assert.equal(env.document.activeElement, env.action);
});

test('confirming resolves true and calls the existing callback only once', async () => {
  const env = environment();
  const result = env.window.confirmAction({ title: 'Approve?', icon: 'success' });
  env.action.onclick();
  assert.equal(await result, true);
  let calls = 0;
  env.window.openConfirmModal({ onSubmit: () => { calls++; } });
  env.action.onclick(); env.action.onclick();
  assert.equal(calls, 1);
  assert.equal(env.modal.classList.contains('hidden'), true);
});

test('replacing a pending confirmation settles the first caller before opening the next', async () => {
  const env = environment();
  const first = env.window.confirmAction({ title: 'First' });
  const second = env.window.confirmAction({ title: 'Second' });
  assert.equal(await first, false);
  env.window.closeConfirmModal();
  assert.equal(await second, false);
});

test('dialog copy is plain text and action tone preserves older callers', () => {
  const env = environment();
  env.window.openConfirmModal({ title: '<img src=x onerror=alert(1)>', buttonClass: 'bg-red-600 hover:bg-red-700' });
  assert.equal(env.document.querySelector('#confirmModalTitle img'), null);
  assert.equal(env.action.classList.contains('vm-button--danger-solid'), true);
  env.window.openConfirmModal({ buttonClass: 'bg-green-600 hover:bg-green-700' });
  assert.equal(env.action.classList.contains('vm-button--primary'), true);
  env.window.openConfirmModal({ tone: 'neutral', button: 'Sign out' });
  assert.equal(env.action.classList.contains('vm-button--danger-solid'), false);
});

test('logout retains the POST and CSRF contract', async () => {
  const env = environment();
  await env.window.postLogout();
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].url, '/logout');
  assert.equal(env.requests[0].options.method, 'POST');
  assert.equal(env.requests[0].options.headers['X-CSRF-Token'], 'test-token');
});

const workspaceCode = readFileSync(new URL('../public/js/internal-ui.js', import.meta.url), 'utf8');
function workspace({ desktop = false, admin = false } = {}) {
  const role = admin ? 'vm-admin' : 'vm-account';
  const { window, document } = parseHTML('<!doctype html><html><body class="vm-internal ' + role + '"><header><button id="nav-trigger" data-sidebar-toggle>Menu</button></header><input type="checkbox" id="sidebar-toggle"><label class="sidebar-overlay"></label><aside id="workspace-navigation"><button data-sidebar-close>Close</button><a href="/dashboard">Dashboard</a><button id="theme-toggle">Appearance</button></aside><main><div class="form-group"><label>Patient name</label><input name="patientName" value="Example" required></div><div id="editUserModal" class="fixed hidden"><h2>Edit user</h2><button aria-label="Close editor">Close</button><input name="editName"></div></main>' + dialogMarkup + '</body></html>');
  let focus = document.getElementById('nav-trigger');
  Object.defineProperty(document, 'activeElement', { get: () => focus });
  window.HTMLElement.prototype.focus = function () { focus = this; };
  window.HTMLElement.prototype.getClientRects = function () { return this.closest('.hidden') ? [] : [{ height: 44 }]; };
  window.location = { href: 'http://workspace.test/dashboard', pathname: '/dashboard' };
  const changes = new Map(), storage = new Map();
  const media = { matches: desktop, addEventListener: (type, handler) => changes.set(type, handler) };
  window.matchMedia = () => media;
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  runInNewContext(workspaceCode, { window, document, localStorage, URL, MutationObserver: window.MutationObserver });
  const modal = document.getElementById('editUserModal');
  modal.querySelector('button').onclick = () => modal.classList.add('hidden');
  return { window, document, media, changes, storage, modal, trigger: document.getElementById('nav-trigger'), navigation: document.getElementById('workspace-navigation') };
}

test('mobile navigation for donors and administrators traps focus and restores the background on close', () => {
  for (const admin of [false, true]) {
    const env = workspace({ admin });
    assert.equal(env.navigation.inert, true);
    env.trigger.click();
    assert.equal(env.trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(env.navigation.inert, false);
    assert.equal(env.document.querySelector('main').inert, true);
    const close = env.navigation.querySelector('[data-sidebar-close]');
    assert.equal(env.document.activeElement, close);
    close.click();
    assert.equal(env.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(env.document.querySelector('main').inert, undefined);
    assert.equal(env.document.activeElement, env.trigger);
  }
});

test('desktop collapse and a viewport change preserve usable navigation without locking scroll', () => {
  for (const admin of [false, true]) {
    const env = workspace({ desktop: true, admin });
    assert.equal(env.trigger.getAttribute('aria-expanded'), 'true');
    env.trigger.click();
    assert.equal(env.navigation.inert, false);
    assert.equal(env.trigger.getAttribute('aria-label'), 'Expand navigation');
    const link = env.navigation.querySelector('a[href]');
    assert.equal(link.getAttribute('aria-label'), 'Dashboard');
    assert.equal(link.getAttribute('title'), 'Dashboard');
    link.focus();
    assert.equal(env.document.activeElement, link);
    assert.equal(env.storage.get('sidebar-collapsed'), 'true');
    env.media.matches = false; env.changes.get('change')();
    env.trigger.click();
    assert.equal(env.document.body.style.overflow, 'hidden');
    env.media.matches = true; env.changes.get('change')();
    assert.notEqual(env.document.body.style.overflow, 'hidden');
    assert.equal(env.navigation.inert, false);
    env.trigger.click();
    assert.equal(env.trigger.getAttribute('aria-label'), 'Minimize navigation');
    assert.equal(env.storage.get('sidebar-collapsed'), 'false');
  }
});

test('form accessibility adds a label association without changing a field contract', () => {
  const env = workspace();
  const field = env.document.querySelector('[name="patientName"]');
  const label = env.document.querySelector('.form-group label');
  assert.equal(label.htmlFor, field.id);
  assert.equal(field.getAttribute('name'), 'patientName');
  assert.equal(field.value, 'Example');
  assert.equal(field.hasAttribute('required'), true);
});

test('appearance switch uses one stored preference and a descriptive keyboard label', () => {
  const env = workspace();
  const control = env.document.getElementById('theme-toggle');
  control.click();
  assert.equal(env.document.documentElement.classList.contains('dark'), true);
  assert.equal(env.storage.get('theme'), 'dark');
  assert.equal(control.getAttribute('aria-label'), 'Switch to light appearance');
  control.click();
  assert.equal(env.storage.get('theme'), 'light');
});

test('an existing editor dialog isolates siblings inside a page and returns focus on Escape', async () => {
  const env = workspace({ desktop: true });
  env.modal.classList.remove('hidden');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.modal.getAttribute('role'), 'dialog');
  assert.equal(env.document.querySelector('.form-group').inert, true);
  const event = new env.window.Event('keydown', { cancelable: true }); event.key = 'Escape';
  env.document.dispatchEvent(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.modal.classList.contains('hidden'), true);
  assert.equal(env.document.querySelector('.form-group').inert, undefined);
});
