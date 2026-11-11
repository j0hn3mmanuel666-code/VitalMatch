import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

for (const status of ['active', 'pending']) test(`critical review opens the alerted ${status} request even when absent from this list`, async () => {
  const template = readFileSync(new URL('../views/admin-requests.xian', import.meta.url), 'utf8');
  const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
  const { document, window } = parseHTML('<html><body><div id="critical-banner" class="hidden"><p id="critical-banner-text"></p><a id="critical-review-link" href="/admin/requests?filter=pending">Review now</a></div></body></html>');
  const callbacks = [];
  document.addEventListener = (event, callback) => { if (event === 'DOMContentLoaded') callbacks.push(callback); };
  window.getCsrfToken = () => 'synthetic';
  window.location = { search: '?filter=pending&highlight=49' };
  const context = { document, window, URLSearchParams, fetch: async () => ({ json: async () => ({ success: true, count: 1, criticals: [{ id: 49, status, bloodType: 'B+', hospitalName: 'Synthetic hospital' }] }) }), setInterval() {}, setTimeout() {}, console };
  runInNewContext(script, context);
  for (const callback of callbacks) callback();
  await context.pollCriticalAlerts();
  const link = document.getElementById('critical-review-link');
  link.dispatchEvent(new window.Event('click'));
  assert.equal(link.getAttribute('href'), '/view-blood-request/49');
  assert.equal(document.getElementById('critical-banner').classList.contains('hidden'), false);
});
