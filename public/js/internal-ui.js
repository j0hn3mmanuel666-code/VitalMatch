/* Progressive accessibility for existing account workflows. No API or form mutation. */
(function () {
  'use strict';
  var navigation = document.getElementById('workspace-navigation');
  var checkbox = document.getElementById('sidebar-toggle');
  var isAdmin = document.body.classList.contains('vm-admin');
  var media = window.matchMedia('(min-width: 1024px)');
  var trigger = null;
  var savedOverflow = '';
  var hiddenBackground = [];
  var mobileWasOpen = false;
  function isOpen() { return media.matches ? !document.body.classList.contains('sidebar-collapsed') : isAdmin ? document.body.classList.contains('mobile-sidebar-open') : !!(checkbox && checkbox.checked); }
  function setOpen(open) {
    if (media.matches) {
      document.body.classList.toggle('sidebar-collapsed', !open);
      try { localStorage.setItem('sidebar-collapsed', String(!open)); } catch (error) { /* Storage can be unavailable. */ }
    } else if (isAdmin) document.body.classList.toggle('mobile-sidebar-open', open);
    else if (checkbox) checkbox.checked = open;
    syncNavigation();
  }
  function syncNavigation() {
    var open = isOpen();
    document.querySelectorAll('[data-sidebar-toggle]').forEach(function (button) {
      button.setAttribute('aria-expanded', String(open));
      var label = media.matches ? (open ? 'Minimize navigation' : 'Expand navigation') : (open ? 'Close navigation' : 'Open navigation');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });
    if (!navigation) return;
    navigation.inert = !media.matches && !open;
    var mobileOpen = open && !media.matches;
    if (mobileOpen && !mobileWasOpen) {
      savedOverflow = document.body.style.overflow;
      Array.from(document.body.children).forEach(function (child) {
        if (child === navigation || child.contains(navigation) || child === checkbox || child.classList.contains('sidebar-overlay') || child.id === 'mobileOverlay' || child.id === 'confirmModal' || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName)) return;
        hiddenBackground.push({ element: child, inert: child.inert }); child.inert = true;
      });
      document.body.style.overflow = 'hidden';
      var first = navigation.querySelector('[data-sidebar-close], a[href]');
      if (first) first.focus();
    } else if (!mobileOpen && mobileWasOpen) {
      hiddenBackground.forEach(function (entry) { entry.element.inert = entry.inert; });
      hiddenBackground = [];
      document.body.style.overflow = savedOverflow;
      if (trigger && trigger.isConnected) trigger.focus();
    }
    mobileWasOpen = mobileOpen;
  }
  document.querySelectorAll('[data-sidebar-toggle]').forEach(function (button) {
    button.addEventListener('click', function () { trigger = button; setOpen(!isOpen()); });
  });
  document.querySelectorAll('[data-sidebar-close]').forEach(function (button) { button.addEventListener('click', function () { setOpen(false); }); });
  if (checkbox) checkbox.addEventListener('change', syncNavigation);
  document.querySelectorAll('.sidebar-overlay, #mobileOverlay').forEach(function (overlay) { overlay.addEventListener('click', function (event) { event.preventDefault(); setOpen(false); }); });
  if (navigation) {
    navigation.querySelectorAll('a[href], button').forEach(function (control) {
      var text = control.querySelector('span:not(.vm-nav-count):not([id$="Badge"])');
      var label = control.getAttribute('title') || (text ? text.textContent : control.textContent).trim();
      if (label && !control.hasAttribute('aria-label')) control.setAttribute('aria-label', label);
      if (label && !control.hasAttribute('title')) control.setAttribute('title', label);
    });
    navigation.querySelectorAll('svg').forEach(function (icon) { icon.setAttribute('aria-hidden', 'true'); });
    navigation.querySelectorAll('a[href]').forEach(function (link) {
      var current = new URL(link.href, window.location.href).pathname;
      var path = window.location.pathname;
      var matches = current === path || (current === '/admin/requests' && path.startsWith('/view-blood-request/')) || (current === '/my-requests' && path.startsWith('/view-blood-request/')) || (current === '/view-donor-profile' && path === '/donor-profile');
      if (matches) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      link.addEventListener('click', function () { if (!media.matches) setOpen(false); });
    });
  }
  document.addEventListener('keydown', function (event) {
    if (media.matches || !isOpen() || !navigation || !document.getElementById('confirmModal').classList.contains('hidden')) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      var controls = Array.from(navigation.querySelectorAll('a[href], button:not(:disabled)')).filter(function (control) { return control.getClientRects().length > 0; });
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  media.addEventListener('change', function () {
    if (checkbox) checkbox.checked = false;
    document.body.classList.remove('mobile-sidebar-open');
    syncNavigation();
  });
  try { if (localStorage.getItem('sidebar-collapsed') === 'true') document.body.classList.add('sidebar-collapsed'); } catch (error) { /* Use expanded default. */ }
  syncNavigation();

  var themeButton = document.getElementById('theme-toggle');
  function updateThemeLabel() {
    if (themeButton) {
      var dark = document.documentElement.classList.contains('dark');
      var label = dark ? 'Switch to light appearance' : 'Switch to dark appearance';
      themeButton.setAttribute('aria-label', label);
      themeButton.setAttribute('title', label);
      themeButton.setAttribute('aria-pressed', String(dark));
    }
  }
  if (themeButton) themeButton.addEventListener('click', function () {
    var dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (error) { /* Keep the in-session preference. */ }
    updateThemeLabel();
  });
  updateThemeLabel();

  var notificationButton = document.getElementById('notificationBtn');
  var notificationDropdown = document.getElementById('notificationDropdown');
  function setNotificationsOpen(open) {
    if (!notificationButton || !notificationDropdown) return;
    notificationDropdown.classList.toggle('hidden', !open);
    notificationButton.setAttribute('aria-expanded', String(open));
    if (open && typeof window.fetchNotifications === 'function') window.fetchNotifications();
  }
  if (notificationButton && notificationDropdown) {
    notificationButton.addEventListener('click', function () {
      setNotificationsOpen(notificationDropdown.classList.contains('hidden'));
    });
    document.addEventListener('click', function (event) {
      if (!notificationDropdown.contains(event.target) && !notificationButton.contains(event.target)) setNotificationsOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !notificationDropdown.classList.contains('hidden')) {
        setNotificationsOpen(false);
        notificationButton.focus();
      }
    });
  }

  // Associate existing above-field labels without altering names or validation.
  var fieldIndex = 0;
  document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(function (field) {
    if (field.closest('label') || (field.id && document.querySelector('label[for="' + field.id + '"]')) || field.hasAttribute('aria-label') || field.hasAttribute('aria-labelledby')) return;
    var group = field.closest('.form-group') || field.parentElement;
    var label = group && Array.from(group.children).find(function (child) { return child.tagName === 'LABEL'; });
    if (label && !label.htmlFor && group.querySelectorAll('input:not([type="hidden"]), select, textarea').length === 1) {
      if (!field.id) field.id = 'vm-field-' + (++fieldIndex);
      label.htmlFor = field.id;
    } else if (field.placeholder) field.setAttribute('aria-label', field.placeholder);
  });
  document.querySelectorAll('th').forEach(function (heading) { if (!heading.hasAttribute('scope')) heading.setAttribute('scope', 'col'); });
  document.querySelectorAll('input[type="checkbox"]').forEach(function (field) {
    if (field.id === 'selectAll') field.setAttribute('aria-label', 'Select all rows');
    else if (field.name === 'selectedRequests' || field.classList.contains('user-checkbox')) field.setAttribute('aria-label', 'Select this row');
  });
  document.querySelectorAll('.error-message').forEach(function (message) {
    message.setAttribute('role', 'alert');
    var field = message.parentElement.querySelector('input:not([type="hidden"]), select, textarea');
    if (!field) return;
    if (!message.id) message.id = 'vm-error-' + (++fieldIndex);
    var described = field.getAttribute('aria-describedby') || '';
    field.setAttribute('aria-describedby', (described + ' ' + message.id).trim());
    new MutationObserver(function () { field.setAttribute('aria-invalid', String(!message.classList.contains('hidden') && !!message.textContent.trim())); }).observe(message, { attributes: true, childList: true, subtree: true });
  });
  document.querySelectorAll('[data-tooltip]').forEach(function (tooltip) {
    tooltip.setAttribute('tabindex', '0');
    tooltip.setAttribute('aria-label', tooltip.dataset.tooltip);
    tooltip.setAttribute('title', tooltip.dataset.tooltip);
  });
  document.querySelectorAll('.vm-table-scroll').forEach(function (region) { region.setAttribute('tabindex', '0'); region.setAttribute('role', 'region'); region.setAttribute('aria-label', 'Scrollable data table'); });
  document.querySelectorAll('.settings-tab').forEach(function (button) {
    function updateSelected() { button.setAttribute('aria-pressed', String(button.classList.contains('active') || (button.classList.contains('border-b-2') && !button.classList.contains('border-transparent')))); }
    updateSelected();
    new MutationObserver(updateSelected).observe(button, { attributes: true, attributeFilter: ['class'] });
  });

  // Legacy focused dialogs keep their existing open/close and submission handlers.
  // Add keyboard behavior to the same elements rather than replacing their actions.
  var activeDialog = null;
  var dialogFocus = null;
  var dialogOverflow = '';
  var dialogBackground = [];
  var legacyDialogs = Array.from(document.querySelectorAll('[id*="Modal"], [id*="modal"], #systemPopup')).filter(function (element) {
    return element.id !== 'confirmModal' && (element.classList.contains('fixed') || element.classList.contains('modal'));
  });
  function dialogVisible(element) { return !element.classList.contains('hidden') && element.style.display !== 'none'; }
  function dialogControls(element) { return Array.from(element.querySelectorAll('button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(function (control) { return control.getClientRects().length > 0; }); }
  function dialogExit(element) { return Array.from(element.querySelectorAll('button[onclick*="close"], button[onclick*="hide"], button[aria-label*="Close"], button[data-dialog-close="true"]')).find(function (button) { return button.getClientRects().length > 0; }); }
  function releaseDialog() {
    if (!activeDialog) return;
    dialogBackground.forEach(function (entry) { entry.element.inert = entry.inert; });
    dialogBackground = [];
    document.body.style.overflow = dialogOverflow;
    if (dialogFocus && dialogFocus.isConnected) dialogFocus.focus();
    activeDialog = null;
    dialogFocus = null;
  }
  function registerDialog(element, index) {
    if (element.dataset.workspaceDialogReady) return;
    element.dataset.workspaceDialogReady = 'true';
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('tabindex', '-1');
    var title = element.querySelector('h2, h3');
    if (title) { if (!title.id) title.id = 'vm-dialog-title-' + index; element.setAttribute('aria-labelledby', title.id); }
    new MutationObserver(function () {
      if (!dialogVisible(element)) { if (activeDialog === element) releaseDialog(); return; }
      if (activeDialog === element) return;
      releaseDialog();
      activeDialog = element;
      dialogFocus = document.activeElement;
      dialogOverflow = document.body.style.overflow;
      var branch = element;
      while (branch && branch !== document.body) {
        Array.from(branch.parentElement.children).forEach(function (child) {
          if (child === branch || child.id === 'confirmModal' || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName)) return;
          dialogBackground.push({ element: child, inert: child.inert }); child.inert = true;
        });
        branch = branch.parentElement;
      }
      document.body.style.overflow = 'hidden';
      var exit = dialogExit(element);
      (exit || dialogControls(element)[0] || element).focus();
    }).observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  legacyDialogs.forEach(registerDialog);
  window.registerWorkspaceDialog = function (element) { registerDialog(element, legacyDialogs.length++); };
  window.releaseWorkspaceDialog = function (element) { if (activeDialog === element) releaseDialog(); };
  document.addEventListener('keydown', function (event) {
    if (!activeDialog || !document.getElementById('confirmModal').classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      var exit = dialogExit(activeDialog);
      if (exit) { event.preventDefault(); exit.click(); }
    }
    if (event.key === 'Tab') {
      var controls = dialogControls(activeDialog), first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); activeDialog.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
})();
