/* Public navigation, restrained motion, and accessible form interactions. */
(() => {
  'use strict';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('[data-public-header]');
  const menuButton = document.querySelector('[data-nav-toggle]');
  const menu = document.getElementById('public-nav-panel');
  if (menuButton && menu) document.documentElement.classList.add('public-enhanced');
  const closeMenu = (restoreFocus = false) => {
    if (!menuButton || !menu) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    menuButton.querySelector('[data-menu-label]').textContent = 'Menu';
    if (restoreFocus) menuButton.focus();
  };
  // Close when keyboard focus leaves the navigation as well as on outside clicks.
  header?.addEventListener('focusout', event => {
    if (event.relatedTarget && !header.contains(event.relatedTarget)) closeMenu();
  });
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    menuButton.querySelector('[data-menu-label]').textContent = open ? 'Close' : 'Menu';
  });
  menu?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('click', event => { if (header && !header.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') closeMenu(true); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', () => closeMenu());
  document.querySelectorAll('[data-public-link]').forEach(link => {
    if (new URL(link.href).pathname === window.location.pathname) link.setAttribute('aria-current', 'page');
  });
  let scrollScheduled = false;
  const updateHeader = () => { header?.classList.toggle('is-scrolled', window.scrollY > 16); scrollScheduled = false; };
  updateHeader();
  window.addEventListener('scroll', () => {
    if (!scrollScheduled) { scrollScheduled = true; window.requestAnimationFrame(updateHeader); }
  }, { passive: true });

  let observer;
  const revealAll = () => {
    observer?.disconnect();
    document.querySelectorAll('[data-reveal-state]').forEach(element => element.removeAttribute('data-reveal-state'));
  };
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.setAttribute('data-reveal-state', 'visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      // Keep the first screen visible. Only enhance content below the fold.
      if (element.getBoundingClientRect().top >= window.innerHeight) {
        observer.observe(element);
        element.setAttribute('data-reveal-state', 'pending');
      }
    });
  }
  reducedMotion.addEventListener('change', event => { if (event.matches) revealAll(); });
  document.addEventListener('focusin', event => event.target.closest('[data-reveal-state="pending"]')?.setAttribute('data-reveal-state', 'visible'));

  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.textContent = visible ? 'Hide' : 'Show';
      button.setAttribute('aria-pressed', String(visible));
    });
  });
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('invalid', event => {
      event.target.setAttribute('aria-invalid', 'true');
      const status = form.querySelector('[data-form-status]');
      if (status) { status.hidden = false; status.textContent = 'Please check the highlighted fields before continuing.'; }
    }, true);
    form.addEventListener('input', event => {
      if (event.target.validity?.valid) event.target.removeAttribute('aria-invalid');
    });
  });
  const confirmation = document.getElementById('confirmPassword');
  const password = document.getElementById('password') || document.getElementById('newPassword');
  if (password && confirmation) {
    const checkConfirmation = () => confirmation.setCustomValidity(confirmation.value && confirmation.value !== password.value ? 'Your passwords must match.' : '');
    password.addEventListener('input', checkConfirmation);
    confirmation.addEventListener('input', checkConfirmation);
  }
  document.querySelector('[data-back-to-top]')?.addEventListener('click', event => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  });
})();
