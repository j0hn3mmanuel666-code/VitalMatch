(function () {
  'use strict';
  const page = document.querySelector('[data-message-time-zone]');
  if (!page) return;
  let timeZone = page.dataset.messageTimeZone || 'Asia/Manila';
  try { new Intl.DateTimeFormat('en-PH', { timeZone }); } catch { timeZone = 'Asia/Manila'; }
  const clock = new Intl.DateTimeFormat('en-PH', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true });
  const full = new Intl.DateTimeFormat('en-PH', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const calendar = new Intl.DateTimeFormat('en-PH', { timeZone });
  const serverNow = Number(page.dataset.messageServerNow);
  const offset = Number.isFinite(serverNow) && serverNow > 0 ? serverNow - Date.now() : 0;
  function update() {
    const now = Date.now() + offset;
    page.querySelectorAll('time[data-message-time]').forEach(element => {
      const date = new Date(element.dateTime);
      if (!Number.isFinite(date.getTime())) return;
      let label = clock.format(date);
      if (element.hasAttribute('data-message-relative')) {
        const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
        label = seconds < 60 ? 'Just now' : seconds < 3600 ? Math.floor(seconds / 60) + 'm ago' : seconds < 86400 ? Math.floor(seconds / 3600) + 'h ago' : seconds < 604800 ? Math.floor(seconds / 86400) + 'd ago' : calendar.format(date);
      }
      if (element.textContent !== label) element.textContent = label;
      element.title = full.format(date) + ' (' + timeZone + ')';
    });
  }
  update();
  setInterval(() => { if (!document.hidden) update(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  window.addEventListener('pageshow', update);
})();
