import crypto from 'node:crypto';

const FLOW_TTL = 10 * 60 * 1000;
export function googleConfig(env = process.env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const redirectUri = env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
  try {
    const url = new URL(redirectUri);
    if (url.pathname !== '/auth/google/callback' || url.search || url.hash || url.username || url.password) return null;
    if (env.NODE_ENV === 'production') {
      const base = new URL(env.BASE_URL);
      if (url.protocol !== 'https:' || base.protocol !== 'https:' || url.origin !== base.origin) return null;
    } else if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
  } catch { return null; }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri };
}

export function beginGoogleFlow(session, config, rememberMe, now = Date.now()) {
  const state = crypto.randomBytes(32).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  delete session.googleRegistration;
  session.googleFlow = { state, verifier, rememberMe, expiresAt: now + FLOW_TTL };
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email profile', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return url.toString();
}

export function consumeGoogleFlow(session, state, now = Date.now()) {
  const flow = session.googleFlow;
  delete session.googleFlow;
  if (!flow || typeof state !== 'string' || state.length !== flow.state.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(flow.state)) || flow.expiresAt < now) throw new Error('Google sign-in expired. Please try again.');
  return flow;
}

export function googleIdentity(profile) {
  if (typeof profile.sub !== 'string' || !profile.sub || profile.email_verified !== true || typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) || profile.email.length > 254) throw new Error('Google could not verify your email address.');
  // Google is not authoritative for consumer Google accounts using third-party mailboxes.
  // Never use those profiles to access an existing account by email alone.
  if (!profile.email.toLowerCase().endsWith('@gmail.com') && !(typeof profile.hd === 'string' && profile.hd)) throw new Error('Use a Gmail or Google Workspace account, or sign in with your VitalMatch password.');
  return { email: profile.email.toLowerCase(), firstName: String(profile.given_name || '').slice(0, 100), lastName: String(profile.family_name || '').slice(0, 100) };
}

export async function exchangeGoogleCode(code, flow, config, fetcher = fetch) {
  const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Google sign-in failed. Please try again.');
  const tokens = await response.json();
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw new Error('Google sign-in failed. Please try again.');
  const userinfo = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
  if (!userinfo.ok) throw new Error('Google sign-in failed. Please try again.');
  return googleIdentity(await userinfo.json());
}

export function createGoogleHandlers({ config = googleConfig, exchange = exchangeGoogleCode, findUser, createUser, signIn }) {
  const fail = (res, message, status = 400) => res.status(status).render('login', { error: message });
  const allowed = user => user.isActive === true && user.emailVerified === true && !user.archivedAt;
  const pending = req => {
    const registration = req.session.googleRegistration;
    if (!registration || registration.expiresAt < Date.now()) { delete req.session.googleRegistration; return null; }
    return registration;
  };
  return {
    start(req, res) {
      const settings = config();
      if (!settings) return fail(res, 'Google sign-in is not configured yet. Please use your email and password.', 503);
      const target = beginGoogleFlow(req.session, settings, req.query.remember !== 'false');
      req.session.save(error => error ? fail(res, 'Unable to start Google sign-in. Please try again.', 503) : res.redirect(target));
    },
    async callback(req, res) {
      res.set('Cache-Control', 'private, no-store');
      let flow;
      try { flow = consumeGoogleFlow(req.session, req.query.state); }
      catch { return fail(res, 'Google sign-in expired. Please try again.'); }
      const settings = config();
      if (!settings) return fail(res, 'Google sign-in is not configured yet. Please use your email and password.', 503);
      if (req.query.error || typeof req.query.code !== 'string' || !req.query.code) return fail(res, 'Google sign-in was cancelled. You can try again.');
      let identity;
      try { identity = await exchange(req.query.code, flow, settings); }
      catch { return fail(res, 'Google could not verify your sign-in. Use a Gmail or Google Workspace account, or try your password.'); }
      const user = await findUser(identity.email);
      if (user) {
        if (!allowed(user)) return fail(res, 'This account is unavailable. Verify your VitalMatch email or contact support.', 403);
        return signIn(req, res, user, flow.rememberMe);
      }
      req.session.googleRegistration = { ...identity, rememberMe: flow.rememberMe, expiresAt: Date.now() + FLOW_TTL };
      req.session.save(error => error ? fail(res, 'Unable to continue registration. Please try again.', 503) : res.redirect('/auth/google/complete'));
    },
    page(req, res) {
      res.set('Cache-Control', 'private, no-store');
      const registration = pending(req);
      if (!registration) return fail(res, 'Google registration expired. Please sign in again.');
      return res.render('google-complete', { title: 'Complete your account', ...registration });
    },
    async complete(req, res) {
      res.set('Cache-Control', 'private, no-store');
      const registration = pending(req);
      if (!config() || !registration) return fail(res, 'Google registration expired. Please sign in again.');
      const fields = {};
      for (const key of ['firstName', 'lastName', 'phone', 'address', 'dateOfBirth', 'gender']) fields[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : '';
      const date = new Date(`${fields.dateOfBirth}T00:00:00Z`);
      if (!fields.firstName || fields.firstName.length > 100 || !fields.lastName || fields.lastName.length > 100 || !/^09\d{9}$/.test(fields.phone) || !fields.address || fields.address.length > 2000 || !/^\d{4}-\d{2}-\d{2}$/.test(fields.dateOfBirth) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fields.dateOfBirth || date > new Date() || date.getUTCFullYear() < 1900 || !['Male', 'Female', 'Other'].includes(fields.gender)) {
        return res.status(400).render('google-complete', { ...registration, ...fields, error: 'Complete all fields with valid details, including an 11-digit mobile number starting with 09.' });
      }
      // Recheck email: another tab may have registered it in the meantime.
      if (await findUser(registration.email)) return fail(res, 'An account now exists for this email. Please start sign-in again.');
      let user;
      try { user = await createUser({ ...fields, email: registration.email, role: 'donor', isActive: true, emailVerified: true }); }
      catch { return fail(res, 'Unable to create your account. Please try signing in again.', 503); }
      return signIn(req, res, user, registration.rememberMe);
    }
  };
}
