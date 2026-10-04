import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

const code = readFileSync(new URL('../public/js/request-list.js', import.meta.url), 'utf8');
function environment({ empty = false } = {}) {
  const rows = empty ? '' : '<article id="a" class="request-card" data-status="active" data-urgency="moderate" data-date="2026-10-01">Patient Alba Calapan</article><article id="b" class="request-card" data-status="fulfilled" data-urgency="critical" data-date="2026-10-03">Patient Berto Roxas</article><article id="c" class="request-card" data-status="active" data-urgency="urgent" data-date="2026-10-02">Patient Cara Calapan</article>';
  const { window, document } = parseHTML('<html><body><input id="searchInput"><select id="sortSelect"></select><div>' + ['all', 'active', 'fulfilled', 'cancelled'].map(status => '<button class="filter-tab" data-filter="' + status + '">' + status + '<span id="count' + status.charAt(0).toUpperCase() + status.slice(1) + '"></span></button>').join('') + '</div><div id="requestsContainer">' + rows + '</div><div id="noResults" class="hidden"></div><button id="more-button" aria-expanded="false">More</button><div id="more-1" class="hidden"></div></body></html>');
  const submitted = [], confirmations = [];
  window.HTMLElement.prototype.submit = function () { submitted.push(this); };
  window.confirmAction = async options => { confirmations.push(options); return false; };
  window.getCsrfToken = () => 'test-csrf';
  const sort = document.getElementById('sortSelect');
  Object.defineProperty(sort, 'value', { configurable: true, writable: true, value: 'newest' });
  runInNewContext(code, { window, document, Promise });
  return { window, document, submitted, confirmations, sort, search: document.getElementById('searchInput'),
    shown: () => [...document.querySelectorAll('.request-card')].filter(row => !row.hidden).map(row => row.id) };
}

test('request filters work when the count is clicked, and sorting changes visible row order', () => {
  const env = environment();
  assert.deepEqual(env.shown(), ['b', 'c', 'a']);
  env.document.getElementById('countActive').click();
  assert.deepEqual(env.shown(), ['c', 'a']);
  assert.equal(env.document.querySelector('[data-filter="active"]').getAttribute('aria-pressed'), 'true');
  env.sort.value = 'oldest'; env.sort.dispatchEvent(new env.window.Event('change'));
  assert.deepEqual(env.shown(), ['a', 'c']);
  env.search.value = 'Cara'; env.search.dispatchEvent(new env.window.Event('input'));
  assert.deepEqual(env.shown(), ['c']);
  env.window.clearFilters();
  assert.deepEqual(env.shown(), ['b', 'c', 'a']);
  assert.equal(env.document.getElementById('countAll').textContent, '3');
});

test('an empty account does not show a second empty state; an unmatched search shows filter feedback', () => {
  const empty = environment({ empty: true });
  assert.equal(empty.document.getElementById('noResults').classList.contains('hidden'), true);
  const env = environment();
  env.search.value = 'no matching patient'; env.search.dispatchEvent(new env.window.Event('input'));
  assert.deepEqual(env.shown(), []);
  assert.equal(env.document.getElementById('noResults').classList.contains('hidden'), false);
});

test('request details expose an accurate expanded state', () => {
  const env = environment(), button = env.document.getElementById('more-button');
  env.window.toggleCard(1, button);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(env.document.getElementById('more-1').classList.contains('hidden'), false);
  env.window.toggleCard(1, button);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('cancellation submits the existing POST with CSRF only after confirmation', async () => {
  const env = environment();
  await env.window.confirmCancel(7);
  assert.equal(env.submitted.length, 0);
  assert.equal(env.confirmations[0].tone, 'danger');
  env.window.confirmAction = async () => true;
  await env.window.confirmCancel(7);
  assert.equal(env.submitted.length, 1);
  const form = env.submitted[0];
  assert.equal(form.getAttribute('method'), 'POST');
  assert.equal(form.getAttribute('action'), '/cancel-request/7');
  assert.equal(form.querySelector('[name="_csrf"]').value, 'test-csrf');
  await env.window.confirmCancel('../other');
  assert.equal(env.submitted.length, 1);
});

test('repeated cancellation clicks cannot create multiple pending submissions', async () => {
  const env = environment(); let resolve;
  env.window.confirmAction = () => new Promise(done => { resolve = done; });
  const first = env.window.confirmCancel(7);
  await env.window.confirmCancel(7);
  resolve(true); await first;
  assert.equal(env.submitted.length, 1);
});
