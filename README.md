# VitalMatch

## Blockchain-free version

This branch removes the blockchain service, administrator dashboard, and related API. Request, appointment, fulfillment, feedback, and activity records continue to use the existing MySQL database. Any blockchain files from older installs are left untouched and are not used by this version.

## V 1.5: System Optimization and UI/UX Refinements

This release includes refreshed public and internal screens, local fonts and map assets, improved search and pagination, workflow integrity and authorization updates, durable notification jobs, and migration and verification tools.

## Pulling this release

For an existing checkout, save or commit your own work before running `git pull --ff-only origin main`, then run `npm ci`. Keep your private `.env`, uploads, runtime settings and demo credentials on your own computer. Git distributes application code and assets; it does not transfer database records or account passwords. An existing database requires the reviewed backup and migration procedure below before startup.

For a new checkout:

```powershell
git clone https://github.com/j0hn3mmanuel666-code/VitalMatch.git
cd VitalMatch
npm ci
Copy-Item .env.example .env
```

Edit `.env` with your own database connection and SMTP settings. Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and save it only in your private `.env`. Create the empty database named by `DB_NAME` using your database administration tool. After confirming that the database is newly created and contains no existing data, initialize it with `node scripts/migrate-schema.js --apply --backup-confirmed`, then run `npm start`. The backup confirmation flag is an explicit operator acknowledgement; for any existing data, use the verified backup procedure below.

For local testing, `npm run seed:demo` generates separate random credentials on each computer in ignored `.local/demo-accounts.json`. Keep that file private. It requires an explicitly named local, nonproduction database with the current schema and preserves existing accounts.

VitalMatch coordinates blood requests, facility review, donor invitations, appointments, messages and recorded donation outcomes in Oriental Mindoro. The existing Express/Xian application and approved public landing are retained. Clinical suitability and transfusion arrangements remain decisions for authorized medical staff.

## Local setup

Use Node.js 22 or later and MySQL/MariaDB. Run `npm ci` from the repository root. Configure a private `.env` with the intended database name, host, port, user and password, a strong `SESSION_SECRET`, and the public `BASE_URL`. Never commit credentials or demo account passwords. Runtime administrator settings are stored in ignored `.local/settings.json`; `.env` SMTP values serve as defaults. Runtime SMTP settings override those defaults so the connection test and actual delivery use the same transport.

Stop the application during the backup/upgrade window. The verified wrapper restore-tests the selected snapshot, rehearses the migration twice, applies the upgrade and checks preserved rows/fields. Intentional historical consent invalidation or any preservation difference requires review before reopening the service. Application startup only checks the schema. `npm run migrate` inspects it; applying an upgrade is an explicit separate operation. Read [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) and take and restore-test a backup first. For an existing local database:

```powershell
node scripts/backup-database.js
node scripts/apply-verified-migration.js .local/backups/<the-generated-backup>.sql
npm start
```

Bootstrap administrator and hospital scripts require complete environment-provided account details. They never force/alter the schema or overwrite existing records. An administrator assigns verified facility membership; editing a display name cannot grant facility access. Historical membership is left unassigned until reviewed by an administrator.

For an existing local synthetic demo fixture, `node scripts/repair-demo-facility.js` checks eligibility without changes. `--apply` assigns only the exact known demo hospital through the verified demo administrator and records an audit entry; repeated application is a no-op. It refuses production, unknown identities and mismatched existing facilities. See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for that limited fixture procedure.

## Development and verification

`npm run xian` starts Node's watch mode. `npm run build:ui` compiles local utilities; shared component appearance is in `public/css/internal.css`. The public landing keeps its own approved assets. `impeccable/` is development tooling and is excluded from product runtime and verification scans.

```powershell
npm test
node scripts/verify-project.js
node scripts/run-integration-tests.js
node scripts/run-integration-tests.js --browser
npm audit
npm audit --omit=dev
```

Integration tests create uniquely named `vitalmatch_audit_test_*` databases, apply migrations twice, use synthetic accounts and disable real delivery workers. They remove only the database they created. The browser suite uses installed Chrome in headless mode. It does not require private demo credentials. Test results, traces and snapshots are ignored under `.local/test-results`.

## Mobile app

The Expo/React Native client lives in `mobile/`. It supports requester, donor, hospital, and administrator accounts with role-filtered request lists, native request and donor-profile forms, review actions, appointment confirmations, notifications, and private system feedback. Start the web server first, then run the client from the `mobile` directory. During Expo development the API host is inferred from the Expo bundle URL, so a physical phone on the same Wi-Fi can reach the computer. Android emulator builds use `http://10.0.2.2:3000` as a fallback. Set `EXPO_PUBLIC_API_BASE_URL` to override the address; use the deployed HTTPS address for production builds.

```powershell
cd mobile
npm ci
npm start
```

Open the project with Expo Go to preview it during development. A standalone Android install requires building an APK with the production API URL configured.

Requester, donor, hospital, and administrator permissions are enforced by the server. Donor availability is a coordination preference; it does not establish medical eligibility.

## Coordination rules

Ordinary requests start pending review. An assigned facility or coordinator can approve them for donor outreach. Hospital-owned and administrator-created requests use the same creation service. A scheduled appointment is distinct from a recorded fulfillment. Scheduled completion requires current confirmations and a past appointment date; collected units are recorded transactionally, partial collections leave outstanding demand open, and duplicate operation keys cannot double count. Walk-in completion requires a staff note. Cancelling or rescheduling invalidates old links and queues recovery notices.

Donor availability is a coordination preference. `DONATION_INTERVAL_DAYS` defaults to 56 days and is an administrative interval, not clinical clearance. Each verified completion records actual units and date and updates the donor's last donation date. Unknown historical quantities and completion dates are preserved as unknown, never inferred from a status or last edit.

Account removal archives/deactivates the account and preserves requests, messages, donations and audit history. Restoration or legal erasure/anonymization needs a separately reviewed retention procedure; do not manually delete related rows.

See [OPERATIONS.md](OPERATIONS.md) for deployment/provider acceptance gates, [SECURITY.md](SECURITY.md) for implemented boundaries and [AUDIT_REMEDIATION.md](AUDIT_REMEDIATION.md) for finding-by-finding verification.
