import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import vm from 'node:vm';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { User, sequelize } from '../models/userModel.js';
import { Donor } from '../models/donorModel.js';
import { UserSetting } from '../models/userSettingModel.js';
import { PasswordReset } from '../models/passwordResetModel.js';
import { Message } from '../models/messageModel.js';
import { isAdmin } from '../middleware/adminAuth.js';
import { authLimiter, generalLimiter, apiLimiter, uploadLimiter, mutationLimiter, accountRateLimitKey, isApiRequest, sanitizeInput, csrfProtection, securityHeaders, applyScriptNonce, blockLegacyVoiceMedia } from '../middleware/security.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validatePassword, validateAdminUserCreation, validateRegistration, sanitizeRichHtml, hashToken } from '../middleware/validation.js';
import { sessionIsCurrent, sessionLifetimeMs } from '../services/sessionAuth.js';
import { SignalingServer } from '../services/signalingServer.js';
import { serveVoiceMessage, audioSignatureMatches } from '../controllers/messageController.js';
import { getCallConfiguration } from '../controllers/callController.js';
import { updateProfile, updateDonorSettings, updateNotificationPrefs, changePassword } from '../controllers/userSettingsController.js';
import { registerUser, verifyEmail, resetPassword, dashboardPage } from '../controllers/authController.js';
import { BloodRequest } from '../models/bloodRequestModel.js';
import { AuditService } from '../services/auditService.js';
import { emailService } from '../services/emailService.js';

const account = overrides => ({ id: 1, role: 'admin', isActive: true, emailVerified: true, authVersion: 3, ...overrides });
const session = overrides => ({ userId: 1, userRole: 'admin', authVersion: 3, authenticatedAt: Date.now() - 1000, lastActivityAt: Date.now(), ...overrides });
function response() {
  return { headers: {}, locals: {}, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, render(view, body) { this.view = view; this.body = body; return this; }, redirect(url) { this.redirectTo = url; return this; }, clearCookie() {}, set(name, value) { this.headers[name] = value; return this; }, sendStatus(code) { this.statusCode = code; return this; } };
}

test('sessions reject legacy, revoked, inactive, unverified, expired and future timestamps', () => {
  const now = Date.now();
  assert.equal(sessionIsCurrent(session(), account(), now + 1), true);
  for (const value of [session({ authVersion: undefined }), session({ authVersion: 2 }), session({ lastActivityAt: now - sessionLifetimeMs() - 1 }), session({ lastActivityAt: now + 100000 })]) assert.equal(sessionIsCurrent(value, account(), now), false);
  assert.equal(sessionIsCurrent(session(), account({ isActive: false })), false);
  assert.equal(sessionIsCurrent(session(), account({ emailVerified: false })), false);
  assert.equal(sessionIsCurrent(session(), account({ archivedAt: new Date() })), false);
});

test('admin authorization uses current database role instead of the session role', async t => {
  const original = User.findByPk;
  t.after(() => { User.findByPk = original; });
  User.findByPk = async () => account({ role: 'donor' });
  const req = { session: session(), method: 'GET', path: '/api/admin/data', get: () => 'application/json' };
  const res = response(); let called = false;
  await isAdmin(req, res, () => { called = true; });
  assert.equal(called, false); assert.equal(res.statusCode, 403); assert.equal(req.session.userRole, 'donor');
  User.findByPk = async () => account();
  await isAdmin({ ...req, authAccount: undefined }, response(), () => { called = true; });
  assert.equal(called, true);
});

test('shape validation and registration reject nested and numeric strings without exceptions', () => {
  for (const body of [{ password: { x: 'a' } }, { email: ['a@b.com'] }, JSON.parse('{"metadata":{"__proto__":{"x":1}}}')]) {
    const res = response(); let called = false;
    sanitizeInput({ body, query: {} }, res, () => { called = true; });
    assert.equal(res.statusCode, 400); assert.equal(called, false);
  }
  const res = response(); let called = false;
  validateRegistration({ body: { firstName: 55, lastName: 22, address: 22, role: 12 } }, res, () => { called = true; });
  assert.equal(called, false); assert.equal(res.view, 'register');
});

test('admin creation follows the generated-password form contract and validates required inputs', () => {
  const body = { firstName: 'Test', lastName: 'Account', email: 'test@example.invalid', phone: '09123456789', address: 'Calapan City', dateOfBirth: '1990-05-20', gender: 'Male', role: 'donor' };
  let called = false;
  validateAdminUserCreation({ body }, response(), () => { called = true; }); assert.equal(called, true);
  for (const change of [{ dateOfBirth: '2020-02-31' }, { firstName: {} }, { role: 'hospital' }, { gender: 2 }]) {
    const res = response(); validateAdminUserCreation({ body: { ...body, ...change } }, res, () => assert.fail('Malformed input accepted'));
    assert.equal(res.statusCode, 400);
  }
});

test('password policy is explicit, respects configured length/special characters and bcrypt byte cap', async () => {
  assert.equal(validatePassword('Abcdef12', { minPasswordLength: 8, requireSpecialChars: false }), true);
  assert.equal(validatePassword('Abcdef12', { minPasswordLength: 8, requireSpecialChars: true }), false);
  assert.equal(validatePassword('Abcdef1!', { minPasswordLength: 12 }), false);
  assert.equal(validatePassword('Ab1!' + 'x'.repeat(69), {}), false);
  const hash = await bcrypt.hash('Abcdef1!', 7);
  assert.equal(await bcrypt.compare('Abcdef1!', hash.replace('$2b$', '$2a$')), true);
  assert.equal(await bcrypt.compare('Wrongpassword1!', hash), false);
});

test('self-account mutations require current authorization and a transaction-scoped audit without private field values', async t => {
  const saved = { transaction: sequelize.transaction, user: User.findByPk, donor: Donor.findOne, prefs: UserSetting.findOrCreate, audit: AuditService.logAction, reset: PasswordReset.update };
  t.after(() => { sequelize.transaction = saved.transaction; User.findByPk = saved.user; Donor.findOne = saved.donor; UserSetting.findOrCreate = saved.prefs; AuditService.logAction = saved.audit; PasswordReset.update = saved.reset; });
  const currentPassword = 'SyntheticCurrentAb1!';
  const storedUser = account({ firstName: 'Previous', lastName: 'Name', email: 'synthetic@example.invalid', phone: '09123456789', address: 'Private old address', password: await bcrypt.hash(currentPassword, 7) });
  const storedDonor = { id: 10, userId: 1, isAvailable: false, dateOfBirth: '1990-01-01', mobileNumber: '09123456789', emergencyContactName: 'Private old contact', emergencyContactNumber: '09123456789' };
  const storedPrefs = { id: 20, notifyMatches: true, notifyAppointments: true, emailUpdates: true };
  const audits = [];
  let failAudit = false, committed = 0, rolledBack = 0, transaction;
  const draft = source => ({ ...source, toJSON() { return { ...this }; }, async update(values, options) { assert.equal(options.transaction, transaction); Object.assign(this, values); }, async increment(field, options) { assert.equal(options.transaction, transaction); this[field]++; } });
  let userDraft, donorDraft, prefsDraft;
  sequelize.transaction = async operation => {
    transaction = { LOCK: { UPDATE: 'UPDATE' } }; userDraft = draft(storedUser); donorDraft = draft(storedDonor); prefsDraft = draft(storedPrefs);
    try { const result = await operation(transaction); Object.assign(storedUser, userDraft); Object.assign(storedDonor, donorDraft); Object.assign(storedPrefs, prefsDraft); committed++; return result; }
    catch (error) { rolledBack++; throw error; }
  };
  User.findByPk = async (_id, options) => { if (!options?.transaction) return draft(storedUser); assert.equal(options.transaction, transaction); assert.equal(options.lock, 'UPDATE'); return userDraft; };
  Donor.findOne = async options => { assert.equal(options.transaction, transaction); return donorDraft; };
  UserSetting.findOrCreate = async options => { assert.equal(options.transaction, transaction); return [prefsDraft]; };
  AuditService.logAction = async (...args) => { assert.equal(args[6].transaction, transaction); audits.push(args); if (failAudit) throw new Error('Synthetic audit unavailable'); };
  PasswordReset.update = async (_values, options) => { assert.equal(options.transaction, transaction); assert.equal(options.where.email, storedUser.email); };
  let destroyed = false;
  const req = body => ({ body, session: session({ destroy(callback) { destroyed = true; callback(); } }), ip: '127.0.0.1', get: () => 'Synthetic test', flash() {}, app: { get() {} } });
  await updateProfile(req({ firstName: 'New', lastName: 'Name', phone: '09123456789', address: 'Private new address' }), response());
  await updateDonorSettings(req({ mobileNumber: '09123456789', emergencyContactName: 'Private new contact', emergencyContactNumber: '09123456789', isAvailable: 'on' }), response());
  await updateNotificationPrefs(req({ notifyMatches: 'on' }), response());
  assert.deepEqual(audits.map(row => row[1]), ['PROFILE_UPDATE', 'DONOR_SETTINGS_UPDATE', 'NOTIFICATION_PREFERENCES_UPDATE']);
  assert.equal(committed, 3); assert.equal(storedPrefs.notifyAppointments, false); assert.equal(storedDonor.isAvailable, true);
  assert.doesNotMatch(JSON.stringify(audits.map(row => [row[4], row[5], row[6].metadata])), /Private|SyntheticCurrent|\$2[ab]\$/);
  failAudit = true;
  await updateProfile(req({ firstName: 'Rolledback', lastName: 'Name', phone: '09123456789', address: 'Private failed address' }), response());
  assert.equal(storedUser.firstName, 'New'); assert.equal(rolledBack, 1);
  const previousHash = storedUser.password, previousVersion = storedUser.authVersion;
  await changePassword(req({ currentPassword, newPassword: 'SyntheticReplacementPasswordAb1!', confirmPassword: 'SyntheticReplacementPasswordAb1!' }), response());
  assert.equal(storedUser.password, previousHash); assert.equal(storedUser.authVersion, previousVersion); assert.equal(destroyed, false); assert.equal(rolledBack, 2);
  failAudit = false;
  await changePassword(req({ currentPassword, newPassword: 'SyntheticReplacementPasswordAb1!', confirmPassword: 'SyntheticReplacementPasswordAb1!' }), response());
  assert.equal(audits.at(-1)[1], 'PASSWORD_CHANGE'); assert.deepEqual(audits.at(-1)[5], { sessionsRevoked: true }); assert.equal(storedUser.authVersion, previousVersion + 1); assert.equal(destroyed, true);
});

test('registration, email verification and password reset audit public authorization and roll back when audit fails', async t => {
  const saved = { transaction: sequelize.transaction, create: User.create, findOne: User.findOne, findByPk: User.findByPk, record: PasswordReset.findOne, current: PasswordReset.findByPk, update: PasswordReset.update, audit: AuditService.logAction, verification: emailService.sendVerificationEmail, welcome: emailService.sendWelcomeEmail };
  t.after(() => { sequelize.transaction = saved.transaction; User.create = saved.create; User.findOne = saved.findOne; User.findByPk = saved.findByPk; PasswordReset.findOne = saved.record; PasswordReset.findByPk = saved.current; PasswordReset.update = saved.update; AuditService.logAction = saved.audit; emailService.sendVerificationEmail = saved.verification; emailService.sendWelcomeEmail = saved.welcome; });
  let transaction, failAudit = true, commits = 0, emails = 0, consumed = false, destroyed = false;
  const audits = [];
  const user = account({ firstName: 'Synthetic', email: 'synthetic@example.invalid', emailVerified: false, async update(_values, options) { assert.equal(options.transaction, transaction); }, async increment(_field, options) { assert.equal(options.transaction, transaction); } });
  const record = { id: 10, email: user.email, token: hashToken('a'.repeat(64)), used: false, expiresAt: new Date(Date.now() + 60000) };
  sequelize.transaction = async operation => { transaction = { LOCK: { UPDATE: 'UPDATE' } }; const result = await operation(transaction); commits++; return result; };
  AuditService.logAction = async (...args) => { assert.equal(args[6].transaction, transaction); audits.push(args); if (failAudit) throw new Error('Synthetic audit unavailable'); };
  emailService.sendVerificationEmail = async () => { emails++; return { success: true }; }; emailService.sendWelcomeEmail = async () => { emails++; return { success: true }; };
  User.create = async (_values, options) => { assert.equal(options.transaction, transaction); return user; };
  User.findOne = async () => null;
  const req = { body: { firstName: 'Synthetic', lastName: 'Test', email: user.email, password: 'SyntheticRegistrationPasswordAb1!', confirmPassword: 'SyntheticRegistrationPasswordAb1!', phone: '09123456789', address: 'Private test address', dateOfBirth: '1990-01-01', gender: 'unspecified' }, ip: '127.0.0.1', get: () => 'Synthetic test', flash() {}, app: { get() {} }, session: { destroy(callback) { destroyed = true; callback(); } } };
  await registerUser(req, response()); assert.equal(commits, 0); assert.equal(emails, 0); assert.equal(audits.at(-1)[1], 'ACCOUNT_REGISTER');
  assert.equal(audits.at(-1)[6].metadata.actorAuthenticated, false); assert.equal(audits.at(-1)[6].source, 'public-registration');
  failAudit = false;
  User.findOne = async options => { assert.equal(options.transaction, transaction); assert.equal(options.where.emailVerified, false); assert.equal(options.lock, 'UPDATE'); return user; };
  await verifyEmail({ ...req, query: { token: 'a'.repeat(64) } }, response()); assert.equal(commits, 1); assert.equal(emails, 1); assert.equal(audits.at(-1)[1], 'EMAIL_VERIFY');
  assert.equal(audits.at(-1)[6].metadata.authorization, 'single-use-email-verification-link');
  User.findOne = async () => user; User.findByPk = async (_id, options) => { assert.equal(options.transaction, transaction); return user; };
  PasswordReset.findOne = async () => record; PasswordReset.findByPk = async (_id, options) => { assert.equal(options.transaction, transaction); return record; };
  PasswordReset.update = async (_values, options) => { assert.equal(options.transaction, transaction); consumed = true; };
  failAudit = true;
  await resetPassword({ ...req, params: { token: 'a'.repeat(64) }, body: { newPassword: 'SyntheticResetPasswordAb1!', confirmPassword: 'SyntheticResetPasswordAb1!' } }, response());
  assert.equal(consumed, true); assert.equal(commits, 1); assert.equal(destroyed, false);
  assert.equal(audits.at(-1)[1], 'PASSWORD_RESET'); assert.equal(audits.at(-1)[6].source, 'password-reset');
  assert.doesNotMatch(JSON.stringify(audits.map(row => [row[4], row[5], row[6].metadata])), /Private test address|SyntheticRegistrationPassword|SyntheticResetPassword|aaaaaaa|\$2[ab]\$/);
});

test('dashboard database failure reports unavailable totals instead of rendering zeros', async t => {
  const original = BloodRequest.findAll; t.after(() => { BloodRequest.findAll = original; });
  BloodRequest.findAll = async () => { throw new Error('Synthetic database unavailable'); };
  const res = response(); await dashboardPage({ session: { userId: 1 } }, res);
  assert.equal(res.statusCode, 503); assert.equal(res.view, 'error'); assert.equal(res.body.donationStats, undefined);
});

test('CMS parser rejects encoded protocols, SVG/script, inline styles and event handlers', () => {
  for (const html of ['<a href="jav&#x61;script:alert(1)">link</a>', '<a href="java\nscript:alert(1)">link</a>', '<img src="data:image/svg+xml,test" onerror="alert(1)">', '<svg onload="alert(1)"><script>alert(1)</script></svg>', '<p style="background:url(javascript:x)" onclick="x()">safe</p>', '<a href="//evil.invalid">link</a>']) {
    const result = sanitizeRichHtml(html);
    assert.doesNotMatch(result, /javascript|onerror|onload|onclick|<script|<svg|style=|data:|href="\/\//i);
  }
  assert.match(sanitizeRichHtml('<p><strong>Safe</strong> <a href="/about">about</a></p>'), /<strong>Safe<\/strong>/);
});

test('CSRF rejects a Unicode byte-length mismatch safely', () => {
  const res = response();
  csrfProtection({ method: 'POST', session: { csrfToken: 'aa' }, body: { _csrf: 'éé' }, headers: {} }, res, () => assert.fail('Invalid token accepted'));
  assert.equal(res.statusCode, 403);
});

test('CSP provides a per-response inline script nonce, disables eval, and preserves external scripts', () => {
  const res = { locals: {}, headers: {}, setHeader(name, value) { this.headers[name] = value; }, removeHeader() {} };
  securityHeaders({}, res, () => {});
  const header = res.headers['Content-Security-Policy'];
  assert.match(header, /script-src 'self' 'nonce-[^']+'/); assert.doesNotMatch(header, /unsafe-eval/);
  const scriptPolicy = header.split(';').find(item => item.startsWith('script-src ')); assert.doesNotMatch(scriptPolicy, /unsafe-inline/);
  const html = applyScriptNonce('<script>initialize()</script><script src="/js/test.js"></script>', res.locals.cspNonce);
  assert.equal(html.split(`nonce="${res.locals.cspNonce}"`).length - 1, 2); assert.match(html, /src="\/js\/test.js"/);
});

test('auth throttling counts HTTP 200 failures; Express 4 catches async errors without stopping the server', async t => {
  const app = express(); app.use(express.json());
  app.post('/login', authLimiter, (req, res) => { req.session = { userId: 1 }; res.redirect('/alive'); });
  app.post('/attempt', authLimiter, (_req, res) => res.status(200).json({ failedLogin: true }));
  app.get('/async', asyncHandler(async () => { throw new Error('expected'); }));
  app.get('/alive', (_req, res) => res.json({ alive: true }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: 'Controlled failure' }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Ten successful session-establishing logins must not exhaust the five-failure
  // budget for a shared clinical network. This uses the production limiter.
  for (let i = 0; i < 10; i++) assert.equal((await fetch(base + '/login', { method: 'POST', redirect: 'manual' })).status, 302);
  for (let i = 0; i < 5; i++) assert.equal((await fetch(base + '/attempt', { method: 'POST' })).status, 200);
  assert.equal((await fetch(base + '/attempt', { method: 'POST' })).status, 429);
  assert.equal((await fetch(base + '/async')).status, 500);
  assert.deepEqual(await (await fetch(base + '/alive')).json(), { alive: true });
});

test('authenticated request limits isolate accounts behind a shared IP and permit bounded API polling', async t => {
  assert.equal(accountRateLimitKey({ ip: '127.0.0.1', authAccount: { id: 101 } }), 'user:101');
  assert.equal(accountRateLimitKey({ ip: '192.0.2.1', authAccount: { id: 101 } }), 'user:101');
  assert.notEqual(accountRateLimitKey({ ip: '127.0.0.1', authAccount: { id: 101 } }), accountRateLimitKey({ ip: '127.0.0.1', authAccount: { id: 102 } }));
  assert.equal(accountRateLimitKey({ ip: '127.0.0.1', session: { userId: 101 } }), accountRateLimitKey({ ip: '127.0.0.1' }));
  assert.equal(accountRateLimitKey({ ip: '2001:db8::1' }), accountRateLimitKey({ ip: '2001:db8::2' }));

  const app = express();
  // This synthetic middleware stands in for a successfully loaded DB account;
  // no cookie/session claim alone selects an account rate-limit key.
  app.use((req, _res, next) => { if (req.get('X-Test-Account')) req.authAccount = { id: Number(req.get('X-Test-Account')) }; next(); });
  app.use(generalLimiter);
  app.use((req, res, next) => isApiRequest(req) ? apiLimiter(req, res, next) : next());
  app.get('/api/read', (_req, res) => res.json({ ok: true }));
  app.get('/page', (_req, res) => res.send('ok'));
  app.post('/upload', uploadLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/mutation', mutationLimiter, (_req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, id, method = 'GET') => { const reply = await fetch(base + path, { method, headers: id ? { 'X-Test-Account': String(id) } : {} }); await reply.arrayBuffer(); return reply; };
  assert.equal((await request('/page', 101)).headers.get('ratelimit-limit'), '300');
  assert.equal((await request('/page')).headers.get('ratelimit-limit'), '100');
  for (let batch = 0; batch < 12; batch++) {
    const replies = await Promise.all(Array.from({ length: 50 }, () => request('/api/read', 101)));
    assert.ok(replies.every(reply => reply.status === 200 && reply.headers.get('ratelimit-limit') === '600'));
  }
  assert.equal((await request('/api/read', 101)).status, 429);
  assert.equal((await request('/api/read', 102)).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await request('/upload', 101, 'POST')).status, 200);
  assert.equal((await request('/upload', 101, 'POST')).status, 429);
  assert.equal((await request('/upload', 102, 'POST')).status, 200);
  for (let i = 0; i < 60; i++) assert.equal((await request('/mutation', 101, 'POST')).status, 200);
  assert.equal((await request('/mutation', 101, 'POST')).status, 429);
  assert.equal((await request('/mutation', 102, 'POST')).status, 200);
});

function socket(id, userId) {
  return { id, userId, request: { session: { userId }, sessionID: `sid-${id}` }, handlers: {}, events: [], join() {}, on(name, handler) { this.handlers[name] = handler; }, emit(name, value) { this.events.push({ name, value }); }, disconnect() { this.disconnected = true; this.handlers.disconnect?.(); } };
}
function signalingFixture(options = {}) {
  const io = { sockets: { sockets: new Map() } };
  const outcomes = [];
  const server = new SignalingServer(io, null, { getOperatingStatus: () => 'online', loadAccount: async s => s.revoked ? null : { id: s.userId, role: 'donor' }, history: { createCallRecord: async () => 9, updateCallOutcome: async (...args) => outcomes.push(args) }, ...options });
  const sockets = [socket('caller', 1), socket('callee', 2), socket('other-tab', 2), socket('attacker', 3)];
  for (const item of sockets) { io.sockets.sockets.set(item.id, item); server.handleConnection(item); }
  return { server, sockets, outcomes };
}

test('call signaling blocks third-party answer/ICE/decline/end and supports multi-tab recipients', async t => {
  const { server, sockets, outcomes } = signalingFixture();
  t.after(() => sockets.forEach(s => s.disconnect()));
  const [caller, callee, otherTab, attacker] = sockets;
  await server.handleCallOffer(caller, { recipientId: 2, offer: { type: 'offer', sdp: 'sdp' }, callType: 'audio' });
  assert.equal(server.activeCalls.size, 1);
  for (const operation of [() => server.handleCallAnswer(attacker, { callId: 9, answer: { type: 'answer', sdp: 'x' } }), () => server.handleIceCandidate(attacker, { callId: 9, candidate: { candidate: 'x' } }), () => server.handleCallDecline(attacker, { callId: 9 }), () => server.handleCallEnd(attacker, { callId: 9 })]) await operation();
  assert.equal(server.activeCalls.get(9).state, 'ringing'); assert.equal(outcomes.length, 0);
  assert.equal(caller.events.some(e => e.name === 'call:accepted'), false);
  await server.handleCallAnswer(callee, { callId: 9, answer: { type: 'answer', sdp: 'valid' } });
  assert.equal(server.activeCalls.get(9).state, 'active');
  assert.equal(otherTab.events.some(e => e.name === 'call:answered-elsewhere'), true);
  otherTab.disconnect(); assert.equal(server.isUserOnline(2), true); assert.equal(server.activeCalls.size, 1);
  await server.handleCallEnd(caller, { callId: 9, duration: 999999 });
  assert.equal(server.activeCalls.size, 0); assert.equal(outcomes.at(-1)[1], 'completed'); assert.ok(outcomes.at(-1)[2] < 10);
});

test('call events reload authorization; revoked recipient cannot receive new calls', async t => {
  const { server, sockets } = signalingFixture();
  t.after(() => sockets.forEach(s => s.disconnect()));
  const [caller, callee, otherTab, attacker] = sockets;
  callee.request.session.revoked = true; otherTab.request.session.revoked = true;
  await caller.handlers['call:offer']({ recipientId: 2, offer: { type: 'offer', sdp: 'sdp' }, callType: 'audio' });
  assert.equal(server.activeCalls.size, 0); assert.equal(callee.disconnected, true); assert.equal(otherTab.disconnected, true);
  attacker.request.session.revoked = true;
  await attacker.handlers['call:end']({ callId: 9 }); assert.equal(attacker.disconnected, true);
  for (let i = 0; i < 11; i++) server.allowEvent(caller, 'offer');
  assert.equal(caller.events.some(e => e.value?.code === 'RATE_LIMITED'), true);
});

test('operating status rejects new non-admin socket connections and closes ongoing non-admin calls', async t => {
  let status = 'online';
  const roles = new Map([[1, 'donor'], [2, 'donor'], [3, 'admin']]);
  const { server, sockets, outcomes } = signalingFixture({ getOperatingStatus: () => status, loadAccount: async s => ({ id: s.userId, role: roles.get(s.userId) }) });
  t.after(() => sockets.forEach(s => s.disconnect()));
  const [caller, callee, otherTab, administrator] = sockets;
  await server.handleCallOffer(caller, { recipientId: 2, offer: { type: 'offer', sdp: 'sdp' }, callType: 'audio' });
  await server.handleCallAnswer(callee, { callId: 9, answer: { type: 'answer', sdp: 'sdp' } });
  assert.equal(server.activeCalls.get(9).state, 'active');
  status = 'maintenance';
  await server.enforceOperatingStatus();
  assert.equal(caller.disconnected, true); assert.equal(callee.disconnected, true); assert.equal(otherTab.disconnected, true);
  assert.equal(server.activeCalls.size, 0); assert.equal(outcomes.at(-1)[1], 'failed');
  assert.equal(administrator.disconnected, undefined);
  assert.equal(caller.events.some(e => e.value?.code === 'SERVICE_UNAVAILABLE'), true);
  // The exception depends on a fresh account role, never a role saved on the socket.
  roles.set(3, 'donor');
  await administrator.handlers['call:end']({ callId: 9 }); assert.equal(administrator.disconnected, true);

  const handlers = [];
  const io = { use(handler) { handlers.push(handler); }, on() {} };
  const handshake = new SignalingServer(io, (_req, _res, next) => next(), { getOperatingStatus: () => 'offline', loadAccount: async s => ({ id: s.userId, role: roles.get(s.userId) }) });
  handshake.initialize();
  let rejection;
  await handlers[1](socket('new-donor', 1), error => { rejection = error; }); assert.equal(rejection?.message, 'Service temporarily unavailable');
  roles.set(3, 'admin');
  let admitted = false;
  await handlers[1](socket('new-admin', 3), error => { assert.equal(error, undefined); admitted = true; }); assert.equal(admitted, true);
});

test('voice downloads query participant authorization and reject traversal; audio MIME alone is insufficient', async t => {
  const original = Message.findOne; t.after(() => { Message.findOne = original; });
  let query;
  Message.findOne = async options => { query = options; return null; };
  const res = response(); await serveVoiceMessage({ params: { id: '99' }, session: { userId: 1 } }, res, error => { throw error; });
  assert.equal(res.statusCode, 404); assert.deepEqual(query.where[Op.or], [{ senderId: 1 }, { receiverId: 1 }]);
  Message.findOne = async () => ({ audioFilePath: 'private:../../outside.webm' });
  const traversal = response(); await serveVoiceMessage({ params: { id: '99' }, session: { userId: 1 } }, traversal, error => { throw error; });
  assert.equal(traversal.statusCode, 404);
  assert.equal(audioSignatureMatches(Buffer.from('<script>x</script>'), 'audio/webm'), false);
  assert.equal(audioSignatureMatches(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm'), true);
});

test('historical public recording URLs stay closed through encoded slash/dot/Windows/case aliases', () => {
  for (const value of ['/uploads/voice-messages/voice_1.webm', '/uploads%2fvoice-messages/voice_1.webm', '/other/..%2fuploads%2fvoice-messages/voice_1.webm', '/uploads%5cvoice-messages%5cvoice_1.webm', '/UPLOADS/VOICE-MESSAGES/voice_1.webm']) {
    const res = response(); blockLegacyVoiceMedia({ path: value }, res, () => assert.fail('Legacy recording alias reached static middleware'));
    assert.equal(res.statusCode, 404);
  }
  let called = false; blockLegacyVoiceMedia({ path: '/images/public.png' }, response(), () => { called = true; }); assert.equal(called, true);
});

test('ICE configuration issues expiring TURN credentials and never returns the signing secret', t => {
  const previous = { urls: process.env.TURN_URLS, secret: process.env.TURN_SECRET };
  t.after(() => { for (const [key, value] of [['TURN_URLS', previous.urls], ['TURN_SECRET', previous.secret]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.TURN_URLS = 'turn:relay.example.invalid:3478?transport=udp'; process.env.TURN_SECRET = 'x'.repeat(32);
  const res = response(); getCallConfiguration({ session: { userId: 42 } }, res);
  assert.equal(res.body.relayConfigured, true); assert.match(res.body.iceServers[1].username, /^\d+:42$/);
  assert.ok(res.body.iceServers[1].credential); assert.equal(JSON.stringify(res.body).includes(process.env.TURN_SECRET), false);
  delete process.env.TURN_SECRET;
  const absent = response(); getCallConfiguration({ session: { userId: 42 } }, absent); assert.equal(absent.body.relayConfigured, false);
});

test('service worker never reads or writes cache for private APIs, recordings or cross-origin assets', async () => {
  const handlers = {}, reads = [], writes = [], deleted = [];
  const cache = { addAll: async () => {}, put: async key => writes.push(key) };
  const caches = { keys: async () => ['vitalmatch-v1', 'vitalmatch-v12', 'unrelated-cache'], delete: async key => deleted.push(key), open: async () => cache, match: async key => { reads.push(key); return undefined; } };
  const self = { location: { origin: 'http://localhost:3000' }, skipWaiting() {}, clients: { claim() {} }, addEventListener(name, handler) { handlers[name] = handler; } };
  const context = { self, caches, URL, Response, fetch: async () => new Response('private body') };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), context);
  for (const path of ['/admin/users/api', '/api/blockchain/recent', '/messages/voice/1', '/uploads/voice-messages/voice_1.webm']) {
    let reply;
    handlers.fetch({ request: { method: 'GET', mode: 'cors', url: path.startsWith('https:') ? path : self.location.origin + path }, respondWith(promise) { reply = promise; } });
    assert.equal(await (await reply).text(), 'private body');
  }
  for (const url of ['https://other.invalid/js/test.js', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/9/237/428']) {
    handlers.fetch({ request: { method: 'GET', mode: 'no-cors', url }, respondWith() { assert.fail('External assets must use the browser network, outside the worker CSP'); } });
  }
  assert.equal(reads.length, 0); assert.equal(writes.length, 0);
  let activation; handlers.activate({ waitUntil(promise) { activation = promise; } }); await activation;
  assert.deepEqual(deleted, ['vitalmatch-v1', 'vitalmatch-v12']);
  context.fetch = async () => { throw new Error('offline'); };
  let offline; handlers.fetch({ request: { method: 'GET', mode: 'cors', url: self.location.origin + '/messages/voice/1' }, respondWith(promise) { offline = promise; } });
  assert.equal((await offline).status, 503); assert.equal(reads.length, 0);
});

test('service worker refreshes public code online, uses safe offline fallback and never substitutes stale cache after storage failure', async () => {
  const handlers = {}, entries = new Map(), network = [], writes = [];
  let mode = 'fresh', failOpen = false, failPut = false, failRead = false;
  const assetResponse = (body, headers = {}, status = 200) => {
    const response = new Response(body, { status, headers });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  };
  const key = request => typeof request === 'string' ? request : request.url;
  const cache = {
    async match(request) { if (failRead) throw new Error('Synthetic read failure'); return entries.get(key(request)); },
    async put(request, response) { if (failPut) throw new Error('Synthetic write failure'); writes.push(key(request)); const stored = assetResponse(await response.text()); entries.set(key(request), stored); },
    async delete(request) { entries.delete(key(request)); }
  };
  const self = { location: { origin: 'http://localhost:3000' }, addEventListener(name, handler) { handlers[name] = handler; } };
  const context = { self, URL, Response, caches: { async open(name) { assert.equal(name, fs.readFileSync('public/sw.js','utf8').match(/const CACHE_NAME = '([^']+)'/)[1]); if (failOpen) throw new Error('Synthetic cache failure'); return cache; } }, fetch: async (request, options) => {
    network.push({ request, options });
    if (mode === 'offline') throw new Error('Synthetic network unavailable');
    if (mode === 'not-found') return assetResponse('Current 404', {}, 404);
    return assetResponse(mode === 'no-store' ? 'Private network bytes' : 'Fresh network bytes', mode === 'no-store' ? { 'Cache-Control': 'private, no-store' } : { 'Cache-Control': 'public, max-age=0, must-revalidate' });
  } };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), context);
  const reply = async path => {
    const request = { method: 'GET', mode: 'cors', url: self.location.origin + path };
    let promise; handlers.fetch({ request, respondWith(value) { promise = value; } }); return promise;
  };
  for (const path of ['/js/app.js', '/css/app.css', '/offline.html', '/manifest.json']) {
    entries.set(self.location.origin + path, assetResponse('Stale cached bytes'));
    assert.equal(await (await reply(path)).text(), 'Fresh network bytes');
    assert.equal(network.at(-1).options.cache, 'no-cache');
    assert.equal(await entries.get(self.location.origin + path).clone().text(), 'Fresh network bytes');
  }
  mode = 'offline'; assert.equal(await (await reply('/js/app.js')).text(), 'Fresh network bytes');
  entries.set(self.location.origin + '/js/private.js', assetResponse('Forbidden cached bytes', { 'Cache-Control': 'private, no-store' }));
  assert.equal((await reply('/js/private.js')).status, 503);
  failRead = true; assert.equal((await reply('/js/app.js')).status, 503); failRead = false;
  mode = 'fresh'; failOpen = true; assert.equal(await (await reply('/js/app.js')).text(), 'Fresh network bytes'); failOpen = false;
  entries.set(self.location.origin + '/js/app.js', assetResponse('Stale cached bytes'));
  failPut = true; assert.equal(await (await reply('/js/app.js')).text(), 'Fresh network bytes'); failPut = false;
  mode = 'not-found'; const missing = await reply('/js/app.js'); assert.equal(missing.status, 404); assert.equal(await missing.text(), 'Current 404'); assert.equal(entries.has(self.location.origin + '/js/app.js'), false);
  entries.set(self.location.origin + '/js/app.js', assetResponse('Prior public bytes'));
  mode = 'no-store'; const writeCount = writes.length; assert.equal(await (await reply('/js/app.js')).text(), 'Private network bytes'); assert.equal(writes.length, writeCount); assert.equal(entries.has(self.location.origin + '/js/app.js'), false);
  mode = 'offline'; assert.equal((await reply('/js/app.js')).status, 503);
  // Even asset-like API paths ignore seeded cache entries and stay network only.
  entries.set(self.location.origin + '/api/private.js', assetResponse('Seeded private bytes'));
  assert.equal((await reply('/api/private.js')).status, 503); assert.equal(network.at(-1).options.cache, 'no-store');
});

test('fetch wrapper injects CSRF only for same-origin mutations and preserves Request headers', async () => {
  const sent = [];
  const document = { querySelector: () => ({ content: 'synthetic-csrf' }), addEventListener() {}, getElementById() {} };
  const window = { location: { href: 'http://localhost:3000/messages', origin: 'http://localhost:3000' }, addEventListener() {}, fetch: async (input, options) => sent.push(options) };
  const context = { window, document, navigator: {}, Request, Headers, URL, console, HTMLFormElement: class {}, Promise, location: window.location };
  vm.runInNewContext(fs.readFileSync('public/js/pwa-register.js', 'utf8'), context);
  await window.fetch(new Request('http://localhost:3000/api/change', { method: 'POST', headers: { 'Content-Type': 'application/json' } }));
  assert.equal(sent[0].headers.get('X-CSRF-Token'), 'synthetic-csrf'); assert.equal(sent[0].headers.get('Content-Type'), 'application/json');
  await window.fetch('//other.invalid/post', { method: 'POST' }); assert.equal(sent[1].headers, undefined);
  await window.fetch('/api/data'); assert.equal(sent[2].headers, undefined);
});
