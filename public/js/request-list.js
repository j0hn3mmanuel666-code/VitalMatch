/* Request-list controls. Status and cancellation remain authoritative on the server. */
(function () {
  'use strict';
  var container = document.getElementById('requestsContainer');
  if (!container) return;
  var search = document.getElementById('searchInput');
  var sort = document.getElementById('sortSelect');
  var noResults = document.getElementById('noResults');
  var buttons = Array.from(document.querySelectorAll('.filter-tab'));
  var serverRecords = container.hasAttribute('data-server-records');
  var searchTimer;
  function navigate(filterValue) {
    var url = new URL(window.location.href);
    url.searchParams.set('search', search.value.trim());
    url.searchParams.set('sort', sort.value);
    url.searchParams.set('filter', filterValue === 'all' ? '' : filterValue);
    url.searchParams.delete('page'); window.location.assign(url.pathname + url.search);
  }
  var records = Array.from(container.querySelectorAll('.request-card')).map(function (element) {
    return { element: element, status: element.dataset.status, urgency: element.dataset.urgency,
      date: Date.parse(element.dataset.date) || 0, text: element.textContent.toLowerCase() };
  });
  var filter = serverRecords ? container.dataset.filter || 'all' : 'all';
  var cancelPending = false;
  function update() {
    if (serverRecords) {
      buttons.forEach(function (button) { var selected = button.dataset.filter === filter; button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('border-b-2', selected); });
      return;
    }
    var term = search.value.trim().toLowerCase();
    var visible = records.filter(function (record) { return (filter === 'all' || record.status === filter) && record.text.includes(term); });
    var priorities = { critical: 4, urgent: 3, high: 2, moderate: 1 };
    visible.sort(function (a, b) {
      if (sort.value === 'oldest') return a.date - b.date;
      if (sort.value === 'urgency') return (priorities[b.urgency] || 0) - (priorities[a.urgency] || 0);
      if (sort.value === 'status') return a.status.localeCompare(b.status);
      return b.date - a.date;
    });
    records.forEach(function (record) { record.element.hidden = !visible.includes(record); });
    visible.forEach(function (record) { container.appendChild(record.element); });
    noResults.classList.toggle('hidden', records.length === 0 || visible.length > 0);
    buttons.forEach(function (button) {
      var selected = button.dataset.filter === filter;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('border-b-2', selected);
    });
  }
  buttons.forEach(function (button) {
    button.addEventListener('click', function (event) { event.preventDefault(); filter = event.currentTarget.dataset.filter; if (serverRecords) navigate(filter); else update(); });
    var status = button.dataset.filter;
    var count = document.getElementById('count' + status.charAt(0).toUpperCase() + status.slice(1));
    if (count) count.textContent = String(status === 'all' ? records.length : records.filter(function (record) { return record.status === status; }).length);
  });
  search.addEventListener('input', function () { if (!serverRecords) return update(); clearTimeout(searchTimer); searchTimer = setTimeout(function () { navigate(filter); }, 600); });
  search.addEventListener('keydown', function (event) { if (serverRecords && event.key === 'Enter') { event.preventDefault(); clearTimeout(searchTimer); navigate(filter); } });
  sort.addEventListener('change', function () { if (serverRecords) navigate(filter); else update(); });
  window.clearFilters = function () { search.value = ''; sort.value = 'newest'; filter = 'all'; if (serverRecords) navigate(filter); else update(); };
  window.toggleCard = function (id, button) {
    var details = document.getElementById('more-' + id);
    if (!details) return;
    var collapsed = details.classList.toggle('hidden');
    button.textContent = collapsed ? 'More' : 'Less';
    button.setAttribute('aria-expanded', String(!collapsed));
  };
  window.confirmCancel = async function (id) {
    if (cancelPending || !/^\d+$/.test(String(id))) return;
    cancelPending = true;
    try {
      var confirmed = await window.confirmAction({ title: 'Cancel this blood request?',
        message: 'This closes the request and stops its emergency escalation. Existing coordination may be affected. You cannot cancel a fulfilled request.',
        button: 'Cancel request', tone: 'danger' });
      if (!confirmed) return;
      // Native POST retains the existing session, CSRF protection, redirect and flash feedback.
      var form = document.createElement('form');
      form.setAttribute('method', 'POST');
      form.setAttribute('action', '/cancel-request/' + id);
      form.hidden = true;
      var token = document.createElement('input');
      token.type = 'hidden'; token.name = '_csrf'; token.value = window.getCsrfToken();
      form.appendChild(token); document.body.appendChild(form); form.submit();
    } finally { cancelPending = false; }
  };
  update();
})();
