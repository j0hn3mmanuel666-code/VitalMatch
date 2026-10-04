import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the shipped event handlers without introducing a browser dependency.
// These checks cover interaction logic; they do not certify rendered layout.
function element() {
  const attributes = new Map();
  const classes = new Set();
  const events = new Map();
  return {
    attributes, classes, events, dataset: {}, textContent: '', inert: false,
    classList: {
      add: name => classes.add(name), remove: name => classes.delete(name),
      toggle(name, force) { const enabled = force ?? !classes.has(name); enabled ? classes.add(name) : classes.delete(name); }
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    removeAttribute: name => attributes.delete(name),
    addEventListener(name, handler) { events.set(name, handler); },
    dispatch(name, event = {}) { events.get(name)?.(event); },
    focus() { this.focused = true; },
    querySelector: () => null, closest: () => null,
    getBoundingClientRect: () => ({ top: 1000 })
  };
}

function environment({ reduced = false, one = {}, many = {}, ids = {} } = {}) {
  const document = element();
  document.documentElement = element();
  document.body = element();
  document.querySelector = selector => one[selector] || null;
  document.querySelectorAll = selector => many[selector] || [];
  document.getElementById = id => ids[id] || null;
  const media = new Map();
  const window = element();
  Object.assign(window, {
    innerHeight: 800, scrollY: 0, location: { pathname: '/', search: '' },
    requestAnimationFrame: callback => callback(), scrollTo() {},
    matchMedia(query) { if (!media.has(query)) media.set(query, Object.assign(element(), { matches: reduced })); return media.get(query); }
  });
  const observers = [];
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this); }
    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
    disconnect() { this.observed.clear(); this.disconnected = true; }
  }
  window.IntersectionObserver = IntersectionObserver;
  return { document, window, media, observers, context: { document, window, IntersectionObserver, URL, URLSearchParams, Map } };
}

const experience = readFileSync(new URL('../public/js/public-experience.js', import.meta.url), 'utf8');

test('mobile navigation opens and Escape closes it with focus returned to the control', () => {
  const button = element(), panel = element(), header = element(), label = element();
  button.querySelector = () => label;
  header.contains = () => false;
  const env = environment({ one: { '[data-nav-toggle]': button, '[data-public-header]': header }, ids: { 'public-nav-panel': panel } });
  runInNewContext(experience, env.context);
  button.dispatch('click');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.ok(panel.classes.has('is-open'));
  env.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.ok(!panel.classes.has('is-open'));
  assert.equal(button.focused, true);
});

test('reduced-motion visitors never get content hidden for scroll reveals', () => {
  const below = element();
  const env = environment({ reduced: true, many: { '[data-reveal]': [below] } });
  runInNewContext(experience, env.context);
  assert.equal(env.observers.length, 0);
  assert.equal(below.getAttribute('data-reveal-state'), undefined);
});

test('keyboard focus reveals pending content and a motion preference change removes reveal state', () => {
  const below = element();
  const env = environment({ many: { '[data-reveal]': [below], '[data-reveal-state]': [below] } });
  runInNewContext(experience, env.context);
  assert.equal(below.getAttribute('data-reveal-state'), 'pending');
  env.document.dispatch('focusin', { target: { closest: () => below } });
  assert.equal(below.getAttribute('data-reveal-state'), 'visible');
  env.media.get('(prefers-reduced-motion: reduce)').dispatch('change', { matches: true });
  assert.equal(below.getAttribute('data-reveal-state'), undefined);
  assert.equal(env.observers[0].disconnected, true);
});

test('password visibility toggles without changing the value and confirmation rejects a mismatch', () => {
  const password = Object.assign(element(), { type: 'password', value: 'Example123' });
  const confirmation = Object.assign(element(), { value: 'different', setCustomValidity(value) { this.validationMessage = value; } });
  const toggle = element(); toggle.dataset.togglePassword = 'password';
  const env = environment({ ids: { password, confirmPassword: confirmation }, many: { '[data-toggle-password]': [toggle] } });
  runInNewContext(experience, env.context);
  toggle.dispatch('click');
  assert.equal(password.type, 'text');
  assert.equal(password.value, 'Example123');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  toggle.dispatch('click');
  assert.equal(password.type, 'password');
  confirmation.dispatch('input');
  assert.ok(confirmation.validationMessage);
  confirmation.value = password.value;
  confirmation.dispatch('input');
  assert.equal(confirmation.validationMessage, '');
});

test('donation dialog isolates the background, traps Tab, and restores focus on Escape', () => {
  const opener = element(), modal = Object.assign(element(), { hidden: true });
  const first = element(), last = element(), dialog = element(), background = element();
  first.closest = () => null;
  modal.querySelector = selector => selector === '.landing-modal__dialog' ? dialog : first;
  modal.querySelectorAll = () => [];
  dialog.querySelectorAll = () => [first, last];
  const env = environment({ ids: { openCallDonationBtn: opener, callDonationModal: modal }, many: { 'body > header, body > main, body > footer, body > .public-skip-link': [background] } });
  env.document.activeElement = opener;
  const source = readFileSync(new URL('../public/js/public-landing.js', import.meta.url), 'utf8');
  runInNewContext(source, env.context);
  opener.dispatch('click');
  assert.equal(modal.hidden, false);
  assert.equal(background.inert, true);
  assert.equal(first.focused, true);
  env.document.activeElement = last;
  let prevented = false;
  env.document.dispatch('keydown', { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  env.document.dispatch('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(modal.hidden, true);
  assert.equal(background.inert, false);
  assert.equal(opener.focused, true);
});
