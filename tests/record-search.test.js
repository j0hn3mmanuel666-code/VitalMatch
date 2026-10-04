import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { searchTerm, withTextSearch, recordPage } from '../services/recordSearch.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

test('record search composes with ownership OR groups and treats wildcard characters literally', () => {
  const scope = { [Op.or]: [{ userId: 7 }, { facilityId: 9 }], archivedAt: null };
  const where = withTextSearch(scope, '100%_\\', ['patientName']);
  assert.equal(where[Op.and][0], scope);
  assert.equal(where[Op.and][1][Op.or][0].patientName[Op.like], '%100\\%\\_\\\\%');
  assert.equal(withTextSearch(scope, '', ['patientName']), scope);
  assert.equal(withTextSearch(scope, '#25', ['patientName'])[Op.and][1][Op.or][1].id, 25);
  assert.equal(searchTerm({ search: ['unexpected'] }), '');
  assert.equal(searchTerm({ search: 'x'.repeat(150) }).length, 100);
});

test('record pagination clamps stale pages after filtering and retains all filters in links', async () => {
  let options;
  const model = { count: async () => 28, findAll: async value => { options = value; return []; } };
  const result = await recordPage(model, { where: { userId: 7 } }, { page: '999', search: 'A+', bloodType: 'A+', filter: 'available' }, '/records');
  assert.equal(options.offset, 25);
  assert.equal(result.pagination.page, 2);
  const url = new URL(result.pagination.previousUrl, 'http://localhost');
  assert.equal(url.searchParams.get('search'), 'A+');
  assert.equal(url.searchParams.get('bloodType'), 'A+');
  assert.equal(url.searchParams.get('filter'), 'available');
  const accounts = await recordPage(model, {}, { page: '2', accountPage: '1', search: 'Clinic' }, '/records', 'accountPage');
  assert.equal(new URL(accounts.pagination.nextUrl, 'http://localhost').searchParams.get('accountPage'), '2');
});

test('table search handles complete local rows, accessible empty feedback and independent tables', () => {
  const { document, window } = parseHTML('<html><body><div class="vm-table-scroll"><table class="vm-table"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alba</td></tr><tr><td>Berto</td></tr></tbody></table></div><div class="vm-table-scroll"><table class="vm-table"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Cara</td></tr></tbody></table></div><table class="vm-table" data-search-mode="server"></table></body></html>');
  document.querySelectorAll('table').forEach(table => { table.tBodies = table.querySelectorAll('tbody'); table.querySelectorAll('tr').forEach(row => { row.cells = row.querySelectorAll('td'); }); });
  window.location = { href: 'http://localhost/reports' };
  runInNewContext(readFileSync(new URL('../public/js/record-search.js', import.meta.url), 'utf8'), { window, document, URL });
  assert.equal(document.querySelectorAll('.vm-table-search').length, 2);
  const search = document.querySelector('input'); search.value = 'Alba'; search.dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelectorAll('tbody')[0].children[1].hidden, true);
  assert.equal(document.querySelectorAll('tbody')[1].children[0].hidden, false);
  search.value = 'missing'; search.dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelectorAll('tbody')[0].lastElementChild.hidden, false);
  assert.equal(document.querySelector('[aria-live]').textContent, '0 of 2 records');
});
