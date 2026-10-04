/* Shared account notification affordances, using the existing endpoints. */
(function () {
  'use strict';
  function csrfHeaders() { return { 'X-CSRF-Token': window.getCsrfToken() }; }
  function safeLink(value) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/notifications'; }
  function reportFailure() {
    var list = document.getElementById('notificationList');
    if (!list) return;
    list.replaceChildren();
    var message = document.createElement('p'); message.className = 'vm-empty-state'; message.textContent = 'Notifications are unavailable. Previously shown counts may be out of date.';
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'vm-button vm-button--small m-3'; retry.textContent = 'Retry'; retry.addEventListener('click', window.fetchNotifications);
    list.append(message, retry);
  }
  window.fetchNotifications = async function () {
    try {
      var response = await fetch('/api/notifications?_=' + Date.now());
      if (!response.ok) throw new Error('Notifications unavailable');
      var data = await response.json();
      if (!data.success) throw new Error('Notifications unavailable');
      ['notificationBadge', 'sidebarNotificationBadge'].forEach(function (id) {
        var badge = document.getElementById(id);
        if (badge) { badge.textContent = data.unreadCount > 0 ? data.unreadCount : ''; badge.style.display = data.unreadCount > 0 ? 'inline-flex' : 'none'; }
      });
      var list = document.getElementById('notificationList');
      if (!list) return;
      list.replaceChildren();
      if (!data.notifications.length) { var empty = document.createElement('p'); empty.className = 'vm-empty-state'; empty.textContent = 'No notifications'; list.append(empty); }
      data.notifications.forEach(function (notification) {
        var action = document.createElement('button'); action.type = 'button'; action.className = 'block w-full text-left p-4 border-b hover:bg-gray-50';
        var title = document.createElement('strong'); title.className = 'block text-sm font-semibold'; title.textContent = notification.title;
        var message = document.createElement('span'); message.className = 'block vm-muted text-xs mt-1'; message.textContent = notification.message;
        action.append(title, message);
        action.addEventListener('click', async function () {
          try {
          var result = await fetch('/api/notifications/' + notification.id + '/read', { method: 'POST', headers: csrfHeaders() });
          if (!result.ok) throw new Error('Notification unavailable');
          if ((notification.link || '').startsWith('/view-blood-request/') && typeof window.showRequestNotificationModal === 'function') window.showRequestNotificationModal(notification.id, notification.title, notification.message);
          else window.location.href = safeLink(notification.link);
          } catch (failure) { reportFailure(); }
        });
        list.append(action);
      });
    } catch (error) { reportFailure(); }
  };
  if (typeof window.markAllNotificationsRead !== 'function') window.markAllNotificationsRead = async function () {
    try {
      var result = await fetch('/api/notifications/read-all', { method: 'POST', headers: csrfHeaders() });
      if (!result.ok) throw new Error('Update unavailable');
      window.fetchNotifications();
    } catch (error) { reportFailure(); }
  };
  document.addEventListener('DOMContentLoaded', function () {
    window.fetchNotifications();
    setInterval(window.fetchNotifications, 60000);
    if (new URLSearchParams(window.location.search).get('alerts') === 'true' && typeof window.showEmergencyAlerts === 'function') window.showEmergencyAlerts();
  });
})();
