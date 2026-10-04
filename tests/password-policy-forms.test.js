import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import hbs from 'hbs';

const configuredPolicy = { minPasswordLength: 64, requireSpecialChars: true, sessionTimeout: 999, smtpPassword: 'synthetic-private-value' };
// Evaluate the real middleware functions without importing configuration or a database.
const validationSource = readFileSync(new URL('../middleware/validation.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export const /g, 'const ');
const context = { Buffer, getRuntimeSettings: () => ({ security: configuredPolicy }) };
runInNewContext(validationSource + '\nglobalThis.policyApi = { getPublicPasswordPolicy, passwordPolicyMessage, validatePassword, validateRegistration, validateLogin };', context);
const api = context.policyApi;
const clientSource = readFileSync(new URL('../public/js/public-register.js', import.meta.url), 'utf8');
const handlebars = hbs.handlebars;
handlebars.registerHelper('eq', (a, b) => a === b);
for (const name of ['head-public', 'public-nav', 'public-footer', 'head', 'user-sidebar', 'internal-header', 'footer']) handlebars.registerPartial(name, '');

test('public password policy and rejection text contain only the active safe rules', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.getPublicPasswordPolicy())), { minLength: 64, requireSpecialChars: true });
  assert.deepEqual(Object.keys(api.getPublicPasswordPolicy()).sort(), ['minLength', 'requireSpecialChars']);
  const message = api.passwordPolicyMessage();
  assert.match(message, /at least 64 characters/);
  assert.match(message, /symbol from @\$!%\*\?&/);
  assert.match(message, /72 UTF-8 bytes/);
  assert.doesNotMatch(message, /999|synthetic-private-value|sessionTimeout|smtpPassword/);
  assert.equal(api.getPublicPasswordPolicy({ minPasswordLength: 1 }).minLength, 8);
  assert.equal(api.getPublicPasswordPolicy({ minPasswordLength: 100 }).minLength, 64);
  assert.doesNotMatch(api.passwordPolicyMessage({ minLength: 8, requireSpecialChars: false }), /plus a symbol/);
});

test('actual registration, reset, and settings forms agree with a 64-character special-symbol server policy', () => {
  const cases = [
    { value: 'Aa1!' + 'a'.repeat(59), accepted: false },
    { value: 'Aa1' + 'a'.repeat(61), accepted: false },
    { value: 'Aa1!' + 'a'.repeat(60), accepted: true },
    { value: 'Aa1!' + 'a'.repeat(68), accepted: true },
    { value: 'Aa1!' + 'a'.repeat(69), accepted: false },
    { value: 'Aa1!' + 'a'.repeat(59) + '_', accepted: false },
    { value: 'Aa1!' + '\u00e9'.repeat(60), accepted: false },
    { value: 'aa1!' + 'a'.repeat(60), accepted: false }
  ];
  for (const page of ['register', 'reset-password', 'settings']) {
    const template = readFileSync(new URL('../views/' + page + '.xian', import.meta.url), 'utf8');
    const html = handlebars.compile(template)({ passwordPolicy: api.getPublicPasswordPolicy(), tokenValid: true, user: { role: 'donor' } });
    const { document, window } = parseHTML('<html><body>' + html + '</body></html>');
    window.HTMLInputElement.prototype.setCustomValidity = function (message) { this.validationMessage = message; };
    const input = document.querySelector('[data-password-policy]');
    assert.ok(input, page);
    assert.equal(input.getAttribute('minlength'), '64', page);
    assert.equal(input.getAttribute('maxlength'), '72', page);
    assert.equal(input.dataset.requireSpecial, 'true', page);
    const help = document.getElementById(input.getAttribute('aria-describedby')).textContent;
    assert.match(help, /64 characters/, page);
    assert.match(help, /symbol from @\$!%\*\?&/, page);
    assert.match(help, /72 UTF-8 bytes/, page);
    runInNewContext(clientSource, { document, TextEncoder });
    const confirmation = input.closest('form').querySelector('[name="confirmPassword"]');
    assert.equal(confirmation.getAttribute('minlength'), '64', page);
    for (const check of cases) {
      input.value = check.value;
      input.dispatchEvent(new window.Event('input'));
      assert.equal(input.validationMessage === '', check.accepted, page + ': ' + JSON.stringify(check));
      assert.equal(api.validatePassword(check.value), check.accepted, 'server: ' + JSON.stringify(check));
    }
    input.value = 'Aa1!' + 'a'.repeat(60);
    input.dispatchEvent(new window.Event('input'));
    confirmation.value = 'different';
    confirmation.dispatchEvent(new window.Event('input'));
    assert.match(confirmation.validationMessage, /must match/, page);
    confirmation.value = input.value;
    confirmation.dispatchEvent(new window.Event('input'));
    assert.equal(confirmation.validationMessage, '', page);
    const currentPassword = document.querySelector('[name="currentPassword"]');
    if (currentPassword) assert.equal(currentPassword.hasAttribute('data-password-policy'), false);
  }
});

test('registration rejection follows configured policy while login accepts an existing shorter password', () => {
  const body = { firstName: 'Synthetic', lastName: 'Donor', email: 'synthetic@example.test', password: 'Short1!x', confirmPassword: 'Short1!x', phone: '09171234567', dateOfBirth: '1990-01-01', gender: 'Other', address: 'Synthetic test address', role: 'donor' };
  let rendered;
  api.validateRegistration({ body }, { render: (view, data) => { rendered = { view, data }; } }, () => assert.fail('short new password accepted'));
  assert.equal(rendered.view, 'register');
  assert.match(rendered.data.error, /at least 64 characters/);
  assert.match(rendered.data.error, /plus a symbol/);
  let advanced = false;
  api.validateLogin({ body: { email: body.email, password: 'Old1word' } }, {}, () => { advanced = true; });
  assert.equal(advanced, true);
});
