import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

const template = readFileSync(new URL('../views/partials/install-card.xian', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/js/install-card.js', import.meta.url), 'utf8');
function setup({ installed = false, dismissed = false, ios = false, native = false } = {}) {
  const { document, window } = parseHTML(template);
  const events = new Map(); let saved, prompts = 0;
  const browser = { addEventListener: (name, handler) => events.set(name, handler), matchMedia: () => ({ matches: installed, addEventListener() {} }), canInstallPWA: () => native, promptPWAInstall: async () => { prompts++; return 'accepted'; } };
  runInNewContext(script, { document, window: browser, navigator: { userAgent: ios ? 'iPhone' : 'Chrome', standalone: installed }, localStorage: { getItem: () => dismissed ? String(Date.now()) : null, setItem: (key, value) => { saved = value; } }, Date });
  return { document, window, events, get saved() { return saved; }, get prompts() { return prompts; } };
}
test('landing install card is dismissible and respects installed or recently dismissed state', () => {
  for (const settings of [{ installed: true }, { dismissed: true }]) assert.equal(setup(settings).document.querySelector('[data-install-card]').hidden, true);
  const app = setup();
  assert.equal(app.document.querySelector('[data-install-card]').hidden, false);
  app.document.querySelector('[data-install-dismiss]').click();
  assert.equal(app.document.querySelector('[data-install-card]').hidden, true); assert.ok(app.saved);
});
test('installation uses native prompt when available and hides after success', async () => {
  const app = setup({ native: true });
  app.document.querySelector('[data-install-action]').click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.prompts, 1); assert.equal(app.document.querySelector('[data-install-card]').hidden, true);
});
test('fallback gives instructions and appinstalled hides the card', () => {
  const app = setup({ ios: true }); app.document.querySelector('[data-install-action]').click();
  assert.match(app.document.querySelector('[data-install-help]').textContent, /Share.*Add to Home Screen/);
  app.events.get('appinstalled')(); assert.equal(app.document.querySelector('[data-install-card]').hidden, true);
});
