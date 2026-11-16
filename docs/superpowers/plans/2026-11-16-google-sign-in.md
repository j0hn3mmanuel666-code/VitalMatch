# Local Google sign-in

Goal: Google sign-in for existing roles and new donor registration, local only.

Initial scope was local development. The user subsequently authorized production deployment on 16 November 2026; production HTTPS configuration, live verification and backup details are recorded in `docs/PENDING_DEPLOYMENT.md` and `docs/GOOGLE_SIGN_IN_LOCAL.md`.

Use Google's authorization-code flow with state, PKCE and short-lived server-side session data. Use Google's authenticated userinfo endpoint; accept verified Gmail or Workspace emails where Google is authoritative. Preserve role, activation and archival checks. New users complete required contact details; assign donor only and a random unknowable password (password reset remains available). No schema changes or deployment.

- [x] Add tested OAuth helpers and request handlers, with mocked Google and account dependencies.
- [x] Wire routes and add matching login, registration and completion UI.
- [x] Document localhost credentials and verify unit tests and local HTTP behavior.

Verification: 122 tests pass. Edge checks on actual localhost login/register at 1440px and 390px passed with no overflow or browser errors. Missing credentials return 503; forged callbacks return 400. Syntax/diff checks pass. Independent authentication review found no actionable issues. Full Google authorization remains pending client credentials.

Review: missing configuration, forged/replayed/expired state, unverified email, suspended accounts, registration races, incomplete details, session fixation and server failures.
