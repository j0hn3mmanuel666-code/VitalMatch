(() => {
  'use strict';
  const card = document.querySelector('[data-install-card]');
  if (!card) return;
  const button = card.querySelector('[data-install-action]');
  const help = card.querySelector('[data-install-help]');
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const storageKey = 'vitalmatch-install-dismissed';
  const week = 7 * 24 * 60 * 60 * 1000;
  let dismissed = false;
  let installed = navigator.standalone === true || displayMode.matches;
  try { const saved = Number(localStorage.getItem(storageKey)); dismissed = saved > 0 && Date.now() - saved < week; } catch { /* Storage may be unavailable in private mode. */ }
  const update = () => { card.hidden = installed || dismissed; };
  card.querySelector('[data-install-dismiss]').addEventListener('click', () => {
    dismissed = true;
    try { localStorage.setItem(storageKey, String(Date.now())); } catch { /* Dismiss for this page even without storage. */ }
    update();
  });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    if (window.canInstallPWA?.()) {
      button.disabled = true;
      const outcome = await window.promptPWAInstall();
      button.disabled = false;
      if (outcome === 'accepted') { installed = true; update(); return; }
      if (outcome === 'dismissed') return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    help.textContent = ios
      ? 'Open this page in Safari, tap Share, then Add to Home Screen.'
      : 'Open your browser menu and look for Install app or Add to Home Screen. If unavailable, try Chrome or Edge.';
    help.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  });
  window.addEventListener('appinstalled', () => { installed = true; update(); });
  displayMode.addEventListener?.('change', event => { installed = event.matches || navigator.standalone === true; update(); });
  update();
})();
