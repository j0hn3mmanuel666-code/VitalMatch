(() => {
  'use strict';
  const opener = document.getElementById('openCallDonationBtn');
  const modal = document.getElementById('callDonationModal');
  if (!opener || !modal) return;
  const dialog = modal.querySelector('.landing-modal__dialog');
  let returnFocus;
  const backgroundState = new Map();
  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove('landing-modal-open');
    opener.setAttribute('aria-expanded', 'false');
    backgroundState.forEach((wasInert, element) => { element.inert = wasInert; });
    backgroundState.clear();
    returnFocus?.focus();
  };
  opener.addEventListener('click', () => {
    returnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('landing-modal-open');
    opener.setAttribute('aria-expanded', 'true');
    document.querySelectorAll('body > header, body > main, body > footer, body > .public-skip-link').forEach(element => {
      backgroundState.set(element, element.inert);
      element.inert = true;
    });
    modal.querySelector('input:not([type="hidden"])')?.focus();
  });
  modal.querySelectorAll('[data-close-call-modal]').forEach(button => button.addEventListener('click', closeModal));
  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  if (new URLSearchParams(window.location.search).get('success') === 'call') {
    const status = document.getElementById('call-submission-status');
    status.textContent = 'Your call for donation has been submitted for review.';
    status.hidden = false;
    const section = document.getElementById('call-for-donation-section');
    section?.setAttribute('data-reveal-state', 'visible');
    section?.querySelector('[data-reveal]')?.setAttribute('data-reveal-state', 'visible');
    section?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
})();
