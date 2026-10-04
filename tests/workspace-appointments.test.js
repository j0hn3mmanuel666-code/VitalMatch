import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import hbs from 'hbs';

test('appointment cancellation sends the actual appointment version, CSRF, reason and stable retry key', async () => {
  const hb = hbs.handlebars;
  for (const name of ['head', 'admin-head', 'admin-sidebar', 'user-sidebar', 'internal-header', 'pagination', 'record-search', 'status-badge', 'footer']) hb.registerPartial(name, '');
  hb.registerHelper('eq', (a, b) => a === b); hb.registerHelper('formatDate', () => 'synthetic-date'); hb.registerHelper('formatTime', () => 'synthetic-time');
  const source = readFileSync(new URL('../views/admin-appointments.xian', import.meta.url), 'utf8');
  const html = hb.compile(source)({ appointments: [{ id: 7, appointmentId: 19, version: 3, unitsRemaining: 2, status: 'scheduled' }] });
  const { document, window } = parseHTML('<html><body>' + html + '</body></html>');
  const form = document.getElementById('appointmentActionForm'), requests = [];
  // LinkeDOM supplies markup and events; bridge its missing native form collection and reset.
  form.elements = Object.fromEntries([...form.querySelectorAll('[name]')].map(field => [field.name, field]));
  form.reset = () => { for (const field of Object.values(form.elements)) field.value = field.getAttribute('value') || ''; };
  form.checkValidity = () => !!form.elements.reason.value.trim(); form.reportValidity = () => {};
  let successful = false, reloads = 0, keys = 0;
  window.getCsrfToken = () => 'synthetic-csrf'; window.location = { reload() { reloads++; } };
  runInNewContext(readFileSync(new URL('../public/js/appointment-actions.js', import.meta.url), 'utf8'), {
    document, window, Date, Number, Math, crypto: { randomUUID: () => 'synthetic-operation-' + ++keys },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: successful, json: async () => ({ success: successful, message: successful ? 'Cancelled' : 'Temporary failure' }) }; }
  });
  document.querySelector('[data-appointment-action="cancel"]').click();
  form.elements.reason.value = 'Synthetic patient requested another date';
  form.dispatchEvent(new window.Event('submit', { cancelable: true })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests[0].url, '/admin/appointments/19/cancel');
  assert.equal(requests[0].options.headers['X-CSRF-Token'], 'synthetic-csrf');
  const first = JSON.parse(requests[0].options.body);
  assert.equal(first.appointmentId, 19); assert.equal(first.version, 3); assert.equal(first.reason, form.elements.reason.value);
  assert.match(document.getElementById('appointmentActionError').textContent, /Temporary failure/);
  assert.equal(document.getElementById('appointmentActionModal').classList.contains('hidden'), false);
  successful = true;
  form.dispatchEvent(new window.Event('submit', { cancelable: true })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.parse(requests[1].options.body).idempotencyKey, first.idempotencyKey);
  assert.equal(reloads, 1);
});
