# Google sign-in configuration

Google sign-in runs on localhost and on `https://vitalmatch.site`. Production requires an explicitly configured HTTPS callback matching `BASE_URL`. No database migration is needed.

## Production deployment — 16 November 2026

Deployed Google sign-in and the landing-page install suggestion after user authorization. The **VitalMatch web** OAuth client permits both `http://localhost:3000/auth/google/callback` and `https://vitalmatch.site/auth/google/callback`. Credentials are stored in the ignored local `.env` and protected production `.env`, never in source control.

Live verification: a real Google authorization returned to the new-donor completion page with the verified identity. No donor account was created during verification. The existing production admin session remained valid. Public login/registration, install assets, the floating landing card, Google redirect, forged-callback rejection and database health passed. Application hashes matched all 15 deployed files. Backups: `/srv/vitalmatch/backups/google-install-20261116T060420Z`.

The Google project remains in Testing mode. This app requests only `openid email profile`, which Google [exempts from the test-user allowlist restriction](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview). App-level checks still require verified Gmail or Google Workspace email, and active/verified existing VitalMatch accounts. Workspace administrators may restrict their users' access.

## Local setup status — 16 November 2026

Initially configured and verified using the separate **VitalMatch Local** Google Cloud project (`vitalmatch-local`). A real local Google authorization completed successfully, redirected to the existing hospital dashboard, and remained signed in after reload. Production was enabled later the same day, as recorded above. Manage Google app settings under [Audience](https://console.cloud.google.com/auth/audience?project=vitalmatch-local).

## Configure another local environment

1. In [Google Cloud Console](https://console.cloud.google.com/), configure Google Auth Platform branding/audience and a **Web application** OAuth client. If the app is in testing, add your test users.
2. Add this exact authorized redirect URI: `http://localhost:3000/auth/google/callback`.
3. Add the client credentials to your local, git-ignored `.env`:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

4. Restart `npm start` and open `http://localhost:3000/login`. Use that hostname consistently; starting from `127.0.0.1` while redirecting to `localhost` loses the session cookie. For a different port, update both the environment and Google's redirect URI.

Existing verified, active accounts sign in by their Google-verified email and retain their role. Archived, suspended, pending hospital and unverified VitalMatch accounts cannot bypass their restrictions. Google is authoritative for Gmail and verified Workspace addresses; consumer Google accounts using other providers' mailboxes should use their VitalMatch password instead.

New emails complete required name, birth date, gender and contact details before a donor account is created. Passwords are randomly generated and never exposed; users may use Forgot password to set a password later. Google credentials/tokens are never sent to the page or stored in the user table. OAuth state, PKCE verifier and pending registration expire after ten minutes. New sessions use the same role redirects and lifetimes as password login.

Reference: [Google's server-side OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [email authority guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
