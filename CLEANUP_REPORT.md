# Cleanup report

## Completed cleanup

### Deleted files

- Generated manual-test artifacts: `lastResponse.html` and `test_output.html`.
- One-off scratch/debug scripts: `scratch*.js`, `testform.js`, `test_hbs.js`,
  `test_js.js`, `test_fulfill.js`, `test_db.js`, and `test_server.js`.
- Ad-hoc data inspection/seeding scripts: `checkData.js`, `showUsers.js`,
  `seed_notif.js`, `sync_calls.js`, `sync_notifications.js`,
  `create-test-admin.js`, and `verify-admin.js`.
- `services/realTimeNotifications.js`: an abandoned parallel Socket.IO
  notification abstraction. It had no import, route setup, dynamic import,
  configuration reference, client subscription, or documentation reference;
  the active real-time path is `SignalingServer` plus the calling client.
- The unreferenced root-level `red cross.png` asset and its byte-for-byte
  duplicate `public/red_cross.png`. Neither source, template, manifest, nor
  service worker referenced them.

The deleted scripts had no package script, source import, documentation link,
or CI reference. Several hard-coded test account IDs, test credentials, fixed
database record IDs, or an obsolete absolute user path; they were not safe
operational tooling.

### Dependencies removed

- `node-fetch`: used only by the deleted `test_fulfill.js`; Node 18+ supplies
  `fetch` natively.
- `socket.io-client`: the browser loads Socket.IO's client bundle from the
  running Socket.IO server at `/socket.io/socket.io.js`; there was no server
  import of this package.

Removing those two direct dependencies pruned 13 packages from the local
installation.

### Runtime cleanup

- Removed per-request success/failure `console.log` diagnostics from
  `middleware/adminAuth.js`. Authorization checks, session destruction for
  deactivated accounts, redirects, and fail-closed database error handling are
  unchanged. The retained `console.error` reports unexpected account-check
  failures without logging every authenticated request, account ID, or role.

## Intentionally retained

- Database migration scripts, including the older one-off migrations: they may
  be needed to reconstruct or upgrade existing databases. Removing them would
  make fresh/install recovery less safe.
- `createAdmin.js` and `createHospital.js`: `.env.example` explicitly defines
  their seed credentials, so they remain supported bootstrap tooling.
- `setupEmail.js` and `testEmail.js`: the email setup guide documents them.
- PWA icons, manifest, service worker, WebRTC client scripts, and Socket.IO
  server: each has a current template, manifest, service-worker, or runtime
  reference.
- The unimplemented `/api/donors/search`, `/api/requests/urgent`, and
  `/api/statistics/dashboard` endpoints: the local repository does not call
  them, but they are externally addressable API contracts; removing them needs
  consumer/deprecation evidence beyond this checkout.
- Current security middleware, session persistence, audit/business models, and
  all tests.

## Verification

- `npm test`: 10 passing smoke tests.
- `node --check` run for every tracked project JavaScript file: passed.
- Searched all non-dependency source, templates, docs, and configuration for
  deleted filenames and removed package names: no remaining references.
- `npm ls node-fetch socket.io-client --depth=0`: empty.
- `git diff --check`: passed.

## Follow-up boundary

`npm audit` currently reports 24 dependency vulnerabilities (1 low, 4
moderate, 17 high, 2 critical). They were not automatically upgraded during
cleanup because a vulnerability remediation needs a compatibility review and
runtime regression testing; it should be handled as a separate, dependency
upgrade batch.

## Audit remediation follow-up (2026-10-03)

The earlier cleanup above describes its original scope. `socket.io-client` was subsequently added as a development-only dependency for actual Socket.IO integration tests. Inquirer and Tailwind/Playwright tooling are development-only; Node watch mode replaces nodemon. The abandoned simple request view and fake draft/security controls were removed while compatibility URLs use the canonical request flow. Dead session-cache and query-hint helpers were removed; protected responses bypass response caching. See `AUDIT_REMEDIATION.md` for current checks and operational limits.
