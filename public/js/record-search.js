/* Full record lists use GET search; compact report/preview tables filter their
   complete displayed dataset locally. Do not hide rows on a server-paged table. */
(function () {
  'use strict';
  var pageKeys = ['page', 'accountPage', 'donationPage'];
  function resetPages(url) { pageKeys.forEach(function (key) { url.searchParams.delete(key); }); }
  document.querySelectorAll('[data-record-search]').forEach(function (form) {
    var field = form.querySelector('input[type="search"]');
    // Preserve all current filters, including future ones, with native GET fallback.
    var current = new URL(window.location.href);
    current.searchParams.forEach(function (value, key) {
      if (key === field.name || pageKeys.includes(key) || form.querySelector('[name="' + key.replace(/[^a-zA-Z0-9_-]/g, '') + '"]')) return;
      var hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = key; hidden.value = value; form.appendChild(hidden);
    });
    form.querySelector('[data-search-clear]').addEventListener('click', function () {
      var url = new URL(window.location.href); url.searchParams.delete(field.name); resetPages(url); window.location.assign(url.pathname + url.search);
    });
    // Tab links carry search and other active filters, and always return to page 1.
    document.querySelectorAll('.vm-tabs a, [data-record-filters] a').forEach(function (link) {
      var target = new URL(link.href, current);
      if (target.pathname !== current.pathname) return;
      current.searchParams.forEach(function (value, key) { if (key !== 'filter' && !pageKeys.includes(key)) target.searchParams.set(key, value); });
      resetPages(target); link.href = target.pathname + target.search;
    });
    document.querySelectorAll('[data-record-filter]').forEach(function (select) {
      select.addEventListener('change', function () {
        var url = new URL(window.location.href); url.searchParams.set(select.dataset.recordFilter, select.value); resetPages(url); window.location.assign(url.pathname + url.search);
      });
    });
  });
  document.querySelectorAll('table.vm-table:not([data-search-mode="server"])').forEach(function (table, index) {
    var scroll = table.closest('.vm-table-scroll') || table;
    var caption = table.querySelector('caption');
    var title = table.dataset.searchLabel || (caption && caption.textContent.trim()) || scroll.getAttribute('aria-label') || 'table records';
    if (title === 'Scrollable data table') title = 'table records';
    var toolbar = document.createElement('div'); toolbar.className = 'vm-table-search';
    var label = document.createElement('label'); label.htmlFor = 'tableSearch' + index; label.textContent = 'Search ' + title;
    var input = document.createElement('input'); input.id = label.htmlFor; input.type = 'search'; input.placeholder = 'Search these records';
    var feedback = document.createElement('p'); feedback.className = 'vm-muted'; feedback.setAttribute('aria-live', 'polite');
    toolbar.append(label, input, feedback); scroll.before(toolbar);
    var rows = Array.from(table.querySelectorAll('tbody tr')).filter(function (row) { return !row.querySelector('[colspan]'); });
    var empty = document.createElement('tr'); empty.hidden = true;
    var cell = document.createElement('td'); cell.colSpan = Math.max(1, table.querySelectorAll('thead th').length); cell.className = 'vm-empty-state'; cell.textContent = 'No matching records. Try another search.'; empty.appendChild(cell);
    if (table.tBodies[0]) table.tBodies[0].appendChild(empty);
    function update() {
      var term = input.value.trim().toLocaleLowerCase(); var count = 0;
      rows.forEach(function (row) {
        var text = Array.from(row.cells).filter(function (cell) { return !cell.querySelector('button, a.vm-button, form'); }).map(function (cell) { return cell.textContent; }).join(' ').toLocaleLowerCase();
        row.hidden = !text.includes(term); if (!row.hidden) count++;
      });
      empty.hidden = count > 0 || rows.length === 0;
      feedback.textContent = count + ' of ' + rows.length + ' records';
    }
    input.addEventListener('input', update); update();
  });
})();
