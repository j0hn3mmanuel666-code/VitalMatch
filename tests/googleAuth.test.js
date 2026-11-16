import test from 'node:test';
import assert from 'node:assert/strict';
import { googleConfig, beginGoogleFlow, consumeGoogleFlow, googleIdentity, exchangeGoogleCode, createGoogleHandlers } from '../services/googleAuth.js';

const config = { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost:3000/auth/google/callback' };
test('configuration requires credentials and an appropriate callback for the environment', () => {
  assert.equal(googleConfig({}), null);
  assert.equal(googleConfig({ NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_REDIRECT_URI: 'https://evil.test/callback' }), null);
});
test('production callback requires HTTPS and must match the configured public origin', () => {
  const env = { NODE_ENV: 'production', GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', BASE_URL: 'https://vitalmatch.site', GOOGLE_REDIRECT_URI: 'https://vitalmatch.site/auth/google/callback' };
  assert.equal(googleConfig(env)?.redirectUri, env.GOOGLE_REDIRECT_URI);
  for (const redirect of ['http://vitalmatch.site/auth/google/callback', 'https://evil.test/auth/google/callback', 'http://localhost:3000/auth/google/callback']) assert.equal(googleConfig({ ...env, GOOGLE_REDIRECT_URI: redirect }), null);
  assert.equal(googleConfig({ ...env, BASE_URL: '' }), null);
  assert.equal(googleConfig({ ...env, GOOGLE_REDIRECT_URI: '' }), null);
});
test('authorization uses PKCE and state is single use and expires', () => {
  const session = {};
  const url = new URL(beginGoogleFlow(session, config, false, 1000));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  const state = url.searchParams.get('state');
  assert.equal(consumeGoogleFlow(session, state, 2000).rememberMe, false);
  assert.throws(() => consumeGoogleFlow(session, state, 2001));
  beginGoogleFlow(session, config, true, 1000);
  assert.throws(() => consumeGoogleFlow(session, 'forged', 1001));
  const expired = new URL(beginGoogleFlow(session, config, true, 1000)).searchParams.get('state');
  assert.throws(() => consumeGoogleFlow(session, expired, 601001));
});
test('only Google-authoritative verified addresses can sign in by email', () => {
  assert.equal(googleIdentity({ sub: '123', email: 'User@gmail.com', email_verified: true }).email, 'user@gmail.com');
  assert.equal(googleIdentity({ sub: '123', email: 'user@company.test', email_verified: true, hd: 'company.test' }).email, 'user@company.test');
  for (const profile of [ {}, { sub: '1', email: 'x@gmail.com', email_verified: false }, { sub: '1', email: 'x@other.test', email_verified: true } ]) assert.throws(() => googleIdentity(profile));
});
test('server exchanges the code with PKCE and only trusts authenticated Google userinfo', async () => {
  const calls = [];
  const profile = await exchangeGoogleCode('single-use-code', { verifier: 'proof' }, config, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => calls.length === 1 ? { access_token: 'private-token' } : { sub: '1', email: 'x@gmail.com', email_verified: true } };
  });
  assert.equal(profile.email, 'x@gmail.com');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].options.body.get('code_verifier'), 'proof');
  assert.equal(calls[0].options.body.get('redirect_uri'), config.redirectUri);
  assert.equal(calls[1].url, 'https://openidconnect.googleapis.com/v1/userinfo');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer private-token');
  await assert.rejects(exchangeGoogleCode('bad', { verifier: 'proof' }, config, async () => ({ ok: false })));
});
function harness(account) {
  const calls = [];
  const req = { query: {}, body: {}, session: { cookie: {}, save: cb => cb() } };
  const res = { locals: {}, status(n) { this.code = n; return this; }, render(view, data) { this.view = view; this.data = data; }, redirect(path) { this.path = path; }, set() {} };
  const handlers = createGoogleHandlers({ config: () => config, findUser: async () => account, exchange: async () => ({ email: 'x@gmail.com', firstName: 'Test', lastName: 'User' }), signIn: async (...args) => calls.push(args), createUser: async data => { calls.push(data); return { id: 4, ...data }; } });
  req.query.state = new URL(beginGoogleFlow(req.session, config, true)).searchParams.get('state');
  req.query.code = 'code';
  return { req, res, handlers, calls };
}
test('existing role is retained; suspended and archived users cannot sign in', async () => {
  for (const role of ['donor', 'hospital', 'admin']) {
    const h = harness({ id: 1, role, isActive: true, emailVerified: true });
    await h.handlers.callback(h.req, h.res);
    assert.equal(h.calls[0][2].role, role);
  }
  for (const account of [{ isActive: false }, { isActive: true, archivedAt: new Date() }, { isActive: true, emailVerified: false }]) {
    const h = harness(account); await h.handlers.callback(h.req, h.res);
    assert.equal(h.calls.length, 0); assert.equal(h.res.code, 403);
  }
});
test('new accounts must complete registration; forged identity and role are ignored', async () => {
  const h = harness(null); await h.handlers.callback(h.req, h.res);
  assert.equal(h.res.path, '/auth/google/complete');
  h.req.body = { firstName: 'Test', lastName: 'User', phone: '09171234567', address: 'Bansud', dateOfBirth: '2000-01-01', gender: 'Other', role: 'admin', email: 'evil@gmail.com' };
  await h.handlers.complete(h.req, h.res);
  assert.equal(h.calls[0].email, 'x@gmail.com'); assert.equal(h.calls[0].role, 'donor');
  assert.equal(h.calls[0].emailVerified, true);
});
test('incomplete or expired registration cannot create an account', async () => {
  const h = harness(null); await h.handlers.callback(h.req, h.res);
  await h.handlers.complete(h.req, h.res); assert.equal(h.res.code, 400); assert.equal(h.calls.length, 0);
  h.req.session.googleRegistration.expiresAt = 0;
  await h.handlers.complete(h.req, h.res); assert.equal(h.res.code, 400); assert.equal(h.calls.length, 0);
});
