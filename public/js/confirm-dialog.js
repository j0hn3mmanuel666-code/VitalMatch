/* Shared dialog API retained for existing request, notification and logout actions. */
(function () {
  'use strict';
  var submitCallback = null;
  var cancelCallback = null;
  var previousFocus = null;
  var previousOverflow = '';
  var background = [];
  function modal() { return document.getElementById('confirmModal'); }
  function close() {
    var element = modal();
    if (!element || element.classList.contains('hidden')) return;
    element.classList.add('hidden');
    element.classList.remove('flex');
    background.forEach(function (entry) { entry.element.inert = entry.inert; });
    background = [];
    document.body.style.overflow = previousOverflow;
    submitCallback = null;
    var cancel = cancelCallback;
    cancelCallback = null;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    previousFocus = null;
    if (cancel) cancel(false);
  }
  function open(options, cancel) {
    options = options || {};
    close();
    var element = modal();
    if (!element) { if (cancel) cancel(false); return; }
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.getElementById('confirmModalTitle').textContent = options.title || 'Confirm action';
    document.getElementById('confirmModalMessage').textContent = options.message || 'Review this action before continuing.';
    var button = document.getElementById('confirmModalAction');
    button.textContent = options.button || 'Confirm';
    // Older callers supply utility classes. Preserve their intent without carrying their palette.
    var tone = options.tone || (/bg-red-/.test(options.buttonClass || '') ? 'danger' : options.icon || 'primary');
    if (options.tone === 'neutral') tone = 'neutral';
    button.className = 'vm-button' + (tone === 'danger' ? ' vm-button--danger-solid' : tone === 'warning' ? ' vm-button--warning' : tone === 'success' ? ' vm-button--success' : tone === 'neutral' ? '' : ' vm-button--primary');
    document.getElementById('confirmModalIcon').dataset.tone = tone;
    submitCallback = options.onSubmit || null;
    cancelCallback = cancel || null;
    button.onclick = function () {
      var callback = submitCallback;
      cancelCallback = null;
      close();
      if (callback) callback();
    };
    Array.from(document.body.children).forEach(function (child) {
      if (child === element || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName)) return;
      background.push({ element: child, inert: child.inert });
      child.inert = true;
    });
    document.body.style.overflow = 'hidden';
    element.classList.remove('hidden');
    element.classList.add('flex');
    // Focus the safe exit first; an accidental Enter cannot delete a record.
    element.querySelector('button').focus();
  }
  window.openConfirmModal = function (options) { open(options); };
  window.closeConfirmModal = close;
  window.confirmAction = function (options) {
    return new Promise(function (resolve) {
      open(Object.assign({}, options, { onSubmit: function () { resolve(true); } }), resolve);
    });
  };
  document.addEventListener('keydown', function (event) {
    var element = modal();
    if (!element || element.classList.contains('hidden')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    var controls = Array.from(element.querySelectorAll('button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    var first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); element.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('click', function (event) { if (event.target === modal()) close(); });
  window.getCsrfToken = function () {
    var token = document.querySelector('meta[name="csrf-token"]');
    return token ? token.getAttribute('content') : '';
  };
  window.postLogout = function () {
    fetch('/logout', { method: 'POST', headers: { 'X-CSRF-Token': window.getCsrfToken() }, credentials: 'same-origin' })
      .then(function () { window.location.href = '/login'; })
      .catch(function () { window.location.href = '/login'; });
  };
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('a[href="/logout"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        window.openConfirmModal({ title: 'Sign out of VitalMatch?', message: 'You will need to sign in again to return to your workspace.', button: 'Sign out', tone: 'neutral', onSubmit: window.postLogout });
      });
    });
  });
})();
