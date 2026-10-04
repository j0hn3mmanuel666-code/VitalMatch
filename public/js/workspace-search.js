/* Shared dashboard search uses the existing role-aware /api/search endpoint. */
(function () {
  'use strict';
  var timer;
  var revision = 0;
  function region(mobile) { return document.getElementById(mobile ? 'dashboardMobileSearchResults' : 'dashboardSearchResults'); }
  function input(mobile) { return document.getElementById(mobile ? 'dashboardMobileSearchInput' : 'dashboardSearch'); }
  function mobileTrigger() { return document.querySelector('[aria-controls="dashboardMobileSearch"]'); }
  function hideResults() {
    revision++;
    clearTimeout(timer);
    [region(false), region(true)].forEach(function (element) { if (element) { element.classList.add('hidden'); element.setAttribute('aria-busy', 'false'); } });
  }
  function feedback(container, message) {
    container.replaceChildren();
    var text = document.createElement('p'); text.className = 'vm-search-feedback'; text.textContent = message;
    container.appendChild(text);
  }
  function render(results, container) {
    container.replaceChildren();
    if (!results.length) { feedback(container, 'No results found. Try a different name or keyword.'); return; }
    results.forEach(function (result) {
      var link = document.createElement('a'); link.className = 'vm-search-result';
      link.href = typeof result.url === 'string' && result.url.startsWith('/') && !result.url.startsWith('//') ? result.url : '/dashboard';
      var title = document.createElement('strong'); title.textContent = result.title || 'View result';
      var description = document.createElement('span'); description.className = 'vm-muted'; description.textContent = result.subtitle || '';
      link.append(title, description);
      if (result.status && result.status !== 'read') {
        var status = document.createElement('span');
        var tones = { active: 'success', available: 'success', fulfilled: 'success', scheduled: 'info', unread: 'info', pending: 'warning', cancelled: 'danger' };
        status.className = 'vm-status' + (tones[result.status] ? ' vm-status--' + tones[result.status] : '');
        status.textContent = result.status === 'unread' ? 'New' : result.status;
        link.appendChild(status);
      }
      container.appendChild(link);
    });
  }
  window.handleDashboardSearch = function (event, mobile) {
    var query = event.target.value.trim();
    var container = region(!!mobile);
    if (!container) return;
    clearTimeout(timer);
    var current = ++revision;
    if (query.length < 2) { container.classList.add('hidden'); container.setAttribute('aria-busy', 'false'); return; }
    timer = setTimeout(async function () {
      feedback(container, 'Searching...'); container.setAttribute('aria-busy', 'true'); container.classList.remove('hidden');
      try {
        var response = await fetch('/api/search?q=' + encodeURIComponent(query));
        if (!response.ok) throw new Error('Search unavailable');
        var data = await response.json();
        if (current !== revision) return;
        render(Array.isArray(data.results) ? data.results : [], container);
      } catch (error) {
        if (current === revision) feedback(container, 'Search is temporarily unavailable. Please try again.');
      } finally { if (current === revision) container.setAttribute('aria-busy', 'false'); }
    }, 300);
  };
  window.toggleDashboardMobileSearch = function () {
    var bar = document.getElementById('dashboardMobileSearch');
    var closed = bar.classList.toggle('hidden');
    var trigger = mobileTrigger(); if (trigger) trigger.setAttribute('aria-expanded', String(!closed));
    if (!closed) input(true).focus();
    else { hideResults(); if (trigger) trigger.focus(); }
  };
  window.focusWorkspaceSearch = function () {
    var mobile = !window.matchMedia('(min-width: 1024px)').matches;
    if (mobile) {
      document.getElementById('dashboardMobileSearch').classList.remove('hidden');
      var trigger = mobileTrigger(); if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }
    var field = input(mobile); if (field) field.focus();
  };
  window.closeWorkspaceSearch = function () {
    hideResults();
    var bar = document.getElementById('dashboardMobileSearch');
    if (bar && !bar.classList.contains('hidden')) window.toggleDashboardMobileSearch();
  };
  document.addEventListener('click', function (event) {
    var desktop = input(false), mobile = input(true), trigger = mobileTrigger();
    if ((desktop && desktop.parentElement.contains(event.target)) || (mobile && mobile.parentElement.contains(event.target)) || (trigger && trigger.contains(event.target))) return;
    hideResults();
  });
})();
