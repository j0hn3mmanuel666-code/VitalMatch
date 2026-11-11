(() => {
  const storageKey = 'vitalmatch-large-text';
  const root = document.documentElement;

  let enabled = false;
  try { enabled = localStorage.getItem(storageKey) === 'on'; } catch { /* Storage may be disabled. */ }
  root.classList.toggle('vm-large-text', enabled);

  const updateButton = (button, large) => {
    button.textContent = large ? 'A−' : 'A+';
    button.setAttribute('aria-pressed', String(large));
    button.setAttribute('aria-label', large ? 'Use standard text size' : 'Make text larger');
    button.title = large ? 'Standard text size' : 'Make text larger';
  };

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('reading-mode-toggle');
    if (!button) return;
    updateButton(button, enabled);
    button.addEventListener('click', () => {
      enabled = !root.classList.contains('vm-large-text');
      root.classList.toggle('vm-large-text', enabled);
      try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch { /* Keep this session's choice. */ }
      updateButton(button, enabled);
    });
  }, { once: true });
})();
