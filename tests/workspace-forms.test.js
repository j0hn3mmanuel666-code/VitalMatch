import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import { parseHTML } from 'linkedom';
import hbs from 'hbs';

const handlebars = hbs.handlebars;
handlebars.registerHelper('eq', (a, b) => a === b);
handlebars.registerHelper('formatDate', () => '3 Oct 2026');
handlebars.registerHelper('formatDateTime', () => '3 Oct 2026, 10:00');
handlebars.registerHelper('lifecycleSteps', (current) => ['Pending', 'Under Review', 'Approved', 'Donor Matching in Progress', 'Donor Confirmed', 'Fulfilled'].map((label, i) => ({ label, index: i + 1, last: i === 5, done: i < Number(current), current: i === Number(current) })));
handlebars.registerHelper('formatTime', () => '10:00');
for (const name of ['head', 'admin-head', 'user-sidebar', 'admin-sidebar', 'internal-header', 'footer', 'pagination', 'record-search', 'status-badge']) handlebars.registerPartial(name, '');
handlebars.registerPartial('facility-selector', readFileSync(new URL('../views/partials/facility-selector.xian', import.meta.url), 'utf8'));
const code = readFileSync(new URL('../public/js/workspace-form.js', import.meta.url), 'utf8');
function environment(page, data = {}, withMunicipalityHandler = false) {
  const source = readFileSync(new URL('../views/' + page + '.xian', import.meta.url), 'utf8');
  const html = handlebars.compile(source)(data);
  const { document, window } = parseHTML('<html><body>' + html + '</body></html>');
  let focus;
  window.HTMLElement.prototype.focus = function () { focus = this; };
  // LinkeDOM does not implement native HTML validation; reflect control attributes.
  for (const name of ['required', 'disabled', 'readOnly']) Object.defineProperty(window.HTMLElement.prototype, name, { configurable: true, get() { return this.hasAttribute(name.toLowerCase()); }, set(value) { if (value) this.setAttribute(name.toLowerCase(), ''); else this.removeAttribute(name.toLowerCase()); } });
  for (const name of ['min', 'max', 'step']) Object.defineProperty(window.HTMLElement.prototype, name, { configurable: true, get() { return this.getAttribute(name) || ''; }, set(value) { this.setAttribute(name, value); } });
  for (const control of [window.HTMLInputElement, window.HTMLTextAreaElement, window.HTMLSelectElement]) Object.defineProperty(control.prototype, 'name', { configurable: true, get() { return this.getAttribute('name') || ''; }, set(value) { this.setAttribute('name', value); } });
  // LinkeDOM lacks native select assignment and option text-value fallback.
  Object.defineProperty(window.HTMLOptionElement.prototype, 'value', { configurable: true, get() { return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent.trim(); }, set(value) { this.setAttribute('value', value); } });
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return ([...this.options].find(option => option.hasAttribute('selected')) || this.options[0])?.value || ''; }, set(value) { for (const option of this.options) { if (option.value === String(value)) option.setAttribute('selected', ''); else option.removeAttribute('selected'); } } });
  Object.defineProperty(window.HTMLSelectElement.prototype, 'selectedIndex', { configurable: true, get() { const index = [...this.options].findIndex(option => option.hasAttribute('selected')); return index < 0 ? 0 : index; } });
  Object.defineProperty(document, 'activeElement', { get: () => focus });
  if (withMunicipalityHandler) runInNewContext(readFileSync(new URL('../public/js/pwa-register.js', import.meta.url), 'utf8'), { document, window, navigator: {}, HTMLFormElement: window.HTMLFormElement, URL, location: { href: 'https://vitalmatch.test/donor-profile' } });
  if (page === 'admin-new-request') runInNewContext(readFileSync(new URL('../public/js/request-form-context.js', import.meta.url), 'utf8'), { document, window });
  else runInNewContext(code, { document, window, navigator: {}, Intl, Date, Number, Array });
  return { document, window, form: document.querySelector('[data-workspace-form], #adminBloodRequestForm') };
}

test('the actual donor template initializes without recursion and validates every required field on submit', () => {
  const env = environment('donor-profile');
  assert.equal(env.document.getElementById('donorSubmitBtn').disabled, false);
  const event = new env.window.Event('submit', { cancelable: true });
  env.form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(env.document.activeElement.name, 'fullName');
  assert.equal(env.document.getElementById('loadingOverlay').classList.contains('hidden'), true);
});

test('deferred donor restoration reveals a custom municipality and submits its saved text once', () => {
  const values = { fullName: 'Synthetic donor', city: 'Abra de Ilog', isAvailable: false };
  const env = environment('donor-profile', { donor: values, donorJson: JSON.stringify(values) }, true);
  const select = env.form.querySelector('[data-city-select]'), other = env.form.querySelector('[data-city-other]');
  assert.equal(env.form.querySelector('[name="fullName"]').value, 'Synthetic donor');
  assert.equal(select.value, '__other');
  assert.equal(select.hasAttribute('name'), false);
  assert.equal(other.name, 'city');
  assert.equal(other.value, 'Abra de Ilog');
  assert.equal(other.classList.contains('hidden'), false);
  assert.equal(other.required, true);
  assert.equal(env.form.querySelectorAll('[name="city"]').length, 1);
  assert.equal(env.form.querySelector('[name="isAvailable"]').checked, false);
});

test('rejected administrator request restores a custom municipality without replacing the current CSRF token', () => {
  const values = { city: 'Abra de Ilog', hospitalName: 'Synthetic external hospital', facilityId: 'external', submissionKey: 'synthetic-operation', _csrf: 'old-token' };
  const env = environment('admin-new-request', { csrfToken: 'current-token', formValuesJson: JSON.stringify(values) }, true);
  const select = env.form.querySelector('[data-city-select]'), other = env.form.querySelector('[data-city-other]');
  assert.equal(select.value, '__other');
  assert.equal(select.hasAttribute('name'), false);
  assert.equal(other.name, 'city');
  assert.equal(other.value, 'Abra de Ilog');
  assert.equal(other.classList.contains('hidden'), false);
  assert.equal(other.required, true);
  assert.equal(env.form.querySelectorAll('[name="city"]').length, 1);
  assert.equal(env.form.querySelector('[name="hospitalName"]').value, 'Synthetic external hospital');
  assert.equal(env.form.querySelector('[name="submissionKey"]').value, 'synthetic-operation');
  assert.equal(env.form.querySelector('[name="_csrf"]').value, 'current-token');
});

test('actual request form and server parser agree on unit and component quantity boundaries', () => {
  // Evaluate the real pure parser in memory without importing lifecycle/database modules.
  const parser = readFileSync(new URL('../services/requestInputService.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function normalizeRequestInput', 'function normalizeRequestInput');
  const context = { WorkflowError: class extends Error {}, Date };
  runInNewContext(parser, context);
  const fixture = { patientName: 'Synthetic patient', patientAge: 40, patientReference: 'PX-2026-0041', bloodType: 'O+', unitsRequired: 1, bloodComponents: ['wholeBlood'], wholeBloodVolume: '2 units',
    indicationOfTransfusion: 'Synthetic transfusion indication', facilityId: 'external', hospitalName: 'Synthetic external hospital', hospitalAddress: 'Synthetic address',
    city: 'Calapan City', province: 'Oriental Mindoro', contactPerson: 'Synthetic requester', contactNumber: '09171234567', email: 'synthetic@example.test', urgency: 'moderate', requiredByDate: '2030-10-03' };
  const cases = [
    { unitsRequired: 1, accepted: true }, { unitsRequired: 10, accepted: true }, { unitsRequired: 11, accepted: false }, { unitsRequired: 0, accepted: false }, { unitsRequired: 1.5, accepted: false },
    { wholeBloodVolume: 'abc', accepted: false }, { wholeBloodVolume: '0', accepted: false }, { wholeBloodVolume: '-1', accepted: false }, { wholeBloodVolume: '100001', accepted: false }, { wholeBloodVolume: '1.5 litres', accepted: false },
    { wholeBloodVolume: '450 ml', accepted: true }, { wholeBloodVolume: '2 bags', accepted: true }, { wholeBloodVolume: '100000', accepted: true }
  ];
  for (const check of cases) {
    const values = { ...fixture, ...check }; delete values.accepted;
    const env = environment('request-blood', { formValuesJson: JSON.stringify(values) });
    const event = new env.window.Event('submit', { cancelable: true }); env.form.dispatchEvent(event);
    const invalid = [...env.form.querySelectorAll('[aria-invalid="true"]')].map(field => field.name);
    assert.equal(!event.defaultPrevented, check.accepted, JSON.stringify({ check, invalid }));
    let serverAccepted = true;
    try { context.normalizeRequestInput({ ...values, facilityId: null }); } catch { serverAccepted = false; }
    assert.equal(serverAccepted, check.accepted, 'server parser: ' + JSON.stringify(check));
    if (!check.accepted) assert.equal(env.form.getAttribute('aria-busy'), null);
  }
});

test('request final submission checks typed constraints rather than trusting step progression', () => {
  const env = environment('request-blood');
  env.form.querySelector('[name="patientName"]').value = 'Synthetic Patient';
  env.form.querySelector('[name="patientAge"]').value = '999';
  const event = new env.window.Event('submit', { cancelable: true }); env.form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(env.document.activeElement.name, 'patientAge');
  assert.equal(env.document.activeElement.getAttribute('aria-invalid'), 'true');
  assert.equal(env.document.getElementById('loadingOverlay').classList.contains('hidden'), true);
});

test('request form labels its fifth step honestly and cannot persist a patient draft', () => {
  const env = environment('request-blood');
  assert.match(env.document.querySelector('[data-step-pill="5"]').textContent, /Additional details/);
  assert.equal(env.form.querySelector('[name="facilityId"]').hasAttribute('required'), true);
  assert.doesNotMatch(code, /localStorage|saveDraft|simulateSubmission/);
});

test('compiled hospital row actions retain the root CSRF token for each record', () => {
  const template = readFileSync(new URL('../views/hospital-patients.xian', import.meta.url), 'utf8');
  const html = handlebars.compile(template)({ csrfToken: 'synthetic-csrf', pendingReview: [{ id: 1 }, { id: 2 }], records: [{ id: 3, status: 'active', isOwn: true }], summary: {} });
  const { document } = parseHTML('<html><body>' + html + '</body></html>');
  const fields = [...document.querySelectorAll('[name="_csrf"]')];
  assert.equal(fields.length, 5);
  assert.ok(fields.every(field => field.value === 'synthetic-csrf'));
});

test('compiled scheduling dialogs have distinct labels and a discoverable safe close action', () => {
  const template = readFileSync(new URL('../views/admin-requests.xian', import.meta.url), 'utf8');
  const html = handlebars.compile(template)({ requests: [{ id: 1, status: 'active', unitsRemaining: 1 }, { id: 2, status: 'active', unitsRemaining: 1 }] });
  const { document } = parseHTML('<html><body>' + html + '</body></html>');
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const modal of document.querySelectorAll('[id^="schedule-modal-"]')) assert.ok(modal.querySelector('[data-dialog-close="true"][aria-label]'));
});

test('owner and donor confirmation links bind the actual appointment and version to the valid route', () => {
  const request = { id: 7, appointmentId: 19, appointmentVersion: 3, status: 'scheduled', unitsRemaining: 1 };
  const detail = handlebars.compile(readFileSync(new URL('../views/view-blood-request.xian', import.meta.url), 'utf8'))({ request, isOwner: true });
  const { document } = parseHTML('<html><body>' + detail + '</body></html>');
  assert.equal(document.querySelector('[href^="/confirm-schedule/"]').getAttribute('href'), '/confirm-schedule/7/requester?appointment=19&version=3');
  const appointments = handlebars.compile(readFileSync(new URL('../views/my-appointments.xian', import.meta.url), 'utf8'))({ appointments: [{ id: 7, appointmentId: 19, version: 3 }] });
  const { document: donor } = parseHTML('<html><body>' + appointments + '</body></html>');
  assert.equal(donor.querySelector('[href^="/confirm-schedule/"]').getAttribute('href'), '/confirm-schedule/7/donor?appointment=19&version=3');
});

test('notification load errors remain recoverable and do not claim the inbox is empty', () => {
  const html = handlebars.compile(readFileSync(new URL('../views/notifications.xian', import.meta.url), 'utf8'))({ notifications: [], error: 'Notifications <unavailable>' });
  const { document } = parseHTML('<html><body>' + html + '</body></html>');
  assert.match(document.querySelector('[role="alert"]').textContent, /Notifications <unavailable>/);
  assert.equal(document.querySelector('unavailable'), null);
  assert.equal(document.querySelector('[href="/notifications"]').textContent, 'Retry loading notifications');
  assert.doesNotMatch(document.body.textContent, /all caught up/);
  assert.equal(document.querySelector('[onclick="clearAllNotifications()"]'), null);
});

test('lead conversion requires an explicit linked account and a failed save retains contact notes', async () => {
  const html = handlebars.compile(readFileSync(new URL('../views/admin-calls.xian', import.meta.url), 'utf8'))({ calls: [{ id: 7, status: 'Converted' }] });
  const { document, window } = parseHTML('<html><body>' + html + '</body></html>');
  const notes = document.getElementById('lead-notes-7'); notes.value = 'Synthetic handoff notes';
  document.getElementById('lead-account-7').focus = () => {};
  const button = document.querySelector('[onclick^="updateStatus"]');
  const calls = [];
  const context = { document, window: { getCsrfToken: () => 'synthetic-csrf', location: { reload() { throw new Error('A failed save must stay on the page'); } } }, Number,
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: false, json: async () => ({ success: false, message: 'Account needs review' }) }; } };
  runInNewContext(document.querySelector('script').textContent, context);
  await context.updateStatus('7', button);
  assert.equal(calls.length, 0);
  assert.match(document.getElementById('lead-error-7').textContent, /donor account user ID/);
  document.getElementById('lead-account-7').value = '19';
  await context.updateStatus('7', button);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['X-CSRF-Token'], 'synthetic-csrf');
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: '7', status: 'Converted', contactNotes: 'Synthetic handoff notes', convertedUserId: 19 });
  assert.equal(notes.value, 'Synthetic handoff notes');
  assert.equal(button.disabled, false);
  assert.equal(document.getElementById('lead-error-7').textContent, 'Account needs review');
});

test('unavailable settings cannot be overwritten by defaults from an unloaded form', async () => {
  const html = handlebars.compile(readFileSync(new URL('../views/admin-settings.xian', import.meta.url), 'utf8'))({});
  const { document } = parseHTML('<html><body>' + html + '</body></html>');
  let initialize;
  document.addEventListener = (event, callback) => { if (event === 'DOMContentLoaded') initialize = callback; };
  const handlers = new Map();
  for (const form of document.querySelectorAll('form')) form.addEventListener = (event, callback) => { if (event === 'submit') handlers.set(form.id, callback); };
  const urls = [];
  runInNewContext(document.querySelector('script').textContent, { document, console: { error() {} }, setTimeout() {},
    window: { getCsrfToken: () => 'synthetic-csrf' }, fetch: async url => { urls.push(url); return { ok: false }; } });
  await initialize();
  assert.ok([...document.querySelectorAll('form button[type="submit"]')].every(button => button.disabled));
  assert.match(document.getElementById('emailStatus').textContent, /Reload this page to retry before saving/);
  await handlers.get('generalSettingsForm').call(document.getElementById('generalSettingsForm'), { preventDefault() {} });
  assert.deepEqual(urls, ['/api/admin/settings']);
  assert.match(document.getElementById('toastMessage').textContent, /Wait for the current settings to load/);
});

test('failed profile and dashboard loads do not offer blank edits or healthy-looking empty statistics', () => {
  const source = page => readFileSync(new URL('../views/' + page + '.xian', import.meta.url), 'utf8');
  const state = { error: 'Synthetic unavailable', donor: null, stats: { activeDonors: 0 }, summary: {} };
  for (const page of ['donor-profile', 'view-donor-profile', 'dashboard', 'admin-dashboard', 'admin-reports', 'admin-users']) {
    const { document } = parseHTML('<html><body>' + handlebars.compile(source(page))(state) + '</body></html>');
    assert.match(document.querySelector('[role="alert"]').textContent, /Synthetic unavailable/, page);
    if (page === 'donor-profile') assert.equal(document.querySelector('[data-workspace-form]'), null);
    if (page === 'view-donor-profile') assert.doesNotMatch(document.body.textContent, /No Donor Profile Found/);
    if (page.endsWith('dashboard')) assert.equal(document.querySelector('.vm-dashboard-summary'), null);
    if (page === 'admin-reports') assert.equal(document.querySelector('.vm-report-summaries'), null);
  }
});

test('every actual template parses, including error branches that are empty in successful responses', () => {
  for (const folder of ['views', 'views/partials']) {
    for (const file of readdirSync(new URL('../' + folder + '/', import.meta.url))) {
      if (file.endsWith('.xian')) assert.doesNotThrow(() => handlebars.precompile(readFileSync(new URL('../' + folder + '/' + file, import.meta.url), 'utf8')), folder + '/' + file);
    }
  }
});

test('a new request submission key does not display a failed-submission warning', () => {
  const env = environment('request-blood', { formValuesJson: '{"submissionKey":"synthetic-key"}' });
  assert.equal(env.form.querySelector('[role="alert"]').classList.contains('hidden'), true);
});

test('server-rejected request details are restored without client storage', () => {
  const env = environment('request-blood', { formValuesJson: '{"submissionKey":"synthetic-key","patientName":"Synthetic Correctable","patientAge":999}' });
  assert.equal(env.form.querySelector('[name="patientName"]').value, 'Synthetic Correctable');
  assert.equal(env.form.querySelector('[role="alert"]').classList.contains('hidden'), false);
  const event = new env.window.Event('submit', { cancelable: true }); env.form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(env.document.activeElement.name, 'patientAge');
});

test('scripts in rendered page templates are valid JavaScript in empty and populated states', () => {
  for (const file of readdirSync(new URL('../views/partials/', import.meta.url))) {
    if (file.endsWith('.xian')) handlebars.registerPartial(file.slice(0, -5), '');
  }
  handlebars.registerHelper('equals', function (a, b, options) { return options && options.fn ? a === b ? options.fn(this) : options.inverse(this) : a === b; });
  handlebars.registerHelper('add', (a, b) => a + b);
  const record = { id: 1, status: 'active', unitsRemaining: 1, unitsRequired: 1, appointmentId: 2, version: 1 };
  const context = { isAdmin: true, navUser: { id: 1 }, user: { id: 1, role: 'admin' }, request: record,
    selectedUser: { selectedUserId: 2 }, requests: [record], appointments: [record],
    monthlyRequests: '[]', bloodTypeDistribution: '[]', monthlyDonors: '[]', statusBreakdown: '[]' };
  let checked = 0;
  for (const file of readdirSync(new URL('../views/', import.meta.url))) {
    if (!file.endsWith('.xian')) continue;
    const template = handlebars.compile(readFileSync(new URL('../views/' + file, import.meta.url), 'utf8'));
    for (const state of [context, { ...context, requests: [], appointments: [], selectedUser: null }]) {
      const { document } = parseHTML('<html><body>' + template(state) + '</body></html>');
      for (const script of document.querySelectorAll('script:not([src])')) {
        if (script.type === 'application/json') continue;
        assert.doesNotThrow(() => new Script(script.textContent, { filename: file }), file); checked++;
      }
    }
  }
  assert.ok(checked > 20, 'the gate actually examines rendered inline scripts');
});
