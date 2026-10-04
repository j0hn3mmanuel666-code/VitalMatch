# Operating VitalMatch

Use one application process while runtime settings and legacy ledger archives use local files. The database stores current request/appointment/fulfillment history and durable notification/outreach jobs. A multi-instance deployment requires shared private media storage and one controlled settings writer; the historical ledger has no distributed consensus and does not certify a medical outcome.

## Before deployment

1. Restore-test the database backup and archive private media, existing public voice files, legacy `blockchain.json`/`blockchain-pending.json`, the consolidated ledger state, and private runtime settings. Protect backups with OS access controls and retention limits. Preserve valid mutations when planning a rollback.
2. Apply the reviewed migration in a maintenance window before deploying code. Startup rejects an older schema. Review and assign historical facility membership explicitly. Resend current appointment links for migrated appointments, whose previous unbound links are invalidated.
3. Set `NODE_ENV=production`, an HTTPS `BASE_URL`, a long random session secret and a restricted database account. Configure the reverse proxy to preserve HTTPS and specify only its actual IPs/subnets in `TRUST_PROXY`; do not trust arbitrary forwarded headers. Verify cookie security, redirects, rate limiting and WebSocket origin handling through the deployed proxy.
4. Configure a real encrypted SMTP service using administrator runtime settings or `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`. An absent or failed provider never falls back to mock/test delivery. The admin connection test checks authentication/connectivity. Separately confirm delivery to controlled recipients and configure the sender's SPF/DKIM/DMARC with the provider. SMTP acceptance is not proof of inbox delivery.
5. Configure `TURN_URLS` and a sufficiently long coturn `TURN_SECRET` for expiring authenticated relay credentials. Test calls between different networks, device browsers, audio devices and a restricted network. STUN-only operation is shown as limited. Do not claim cross-network media readiness from signaling tests.
6. Have the operating organization approve the donation interval, blood/component matching and clinical screening procedure, review responsibilities, urgent publication policy, verified facility/contact directory, retention and recovery procedures. The software's coordination checks cannot establish clinical eligibility.
7. Run unit, schema, isolated database/HTTP and browser suites plus the dependency audit against the exact release. Exercise provider outage, retry, logout, suspension, rescheduling, partial fulfillment and coordinator recovery in staging. Monitor job failures, permission denials and database/provider availability without logging tokens or health payloads.

## Jobs and recovery

The worker claims durable pending outreach/email rows and retries with backoff. Old appointment email payloads are suppressed after cancellation/rescheduling. Account status and email preferences are checked again before dispatch. Failed email and coordination jobs can be requeued from administrator settings; processed/suppressed/superseded counts explain the outcome. The worker labels provider acceptance as `sent`. SMTP uses at-least-once delivery: a provider may accept a message before a process fails to record acceptance, so recipients can occasionally receive duplicates. Operation keys protect recorded clinical quantities independently of delivery.

`EMAIL_OUTBOX_ENABLED=false` disables delivery workers for isolated tests. `COORDINATION_JOBS_ENABLED=false` disables outreach dispatch. Production should enable them under monitoring. Use the separate coordination status and retry action in administrator settings after fixing the cause of a failure. Never restore or delete the queue as a substitute for resolving a request's actual status.

Private voice media is served only through a message membership check. Historical public recording URLs are blocked; keep original files until a reviewed retention/migration procedure has verified authorized playback. Session pages, APIs and media are excluded from service-worker caches. Offline feedback describes connectivity failure without presenting cached private account data.

## Configuration and deployment boundaries

The session timeout and password settings are enforced, with new password rules applying when a password is set. MFA and IP-allowlist controls were removed because they were not implemented; introduce either only with a complete recovery, enrollment and deployment design. Audit logging cannot be disabled by a UI toggle. Settings writes are serialized within the application's single writer, coordinated with mandatory database auditing, and compensated if the audit commit fails. A disk failure during compensation requires restoring the private configuration before reopening service. Use private environment/configuration storage in production and do not track populated `settings.json` files.

Existing historical ledger archives are preserved. Mining yields to the event loop and commits chain plus pending entries atomically, and persistence errors remain visible. Current verified donations come from database fulfillment events. A raw archived medical record must remain restricted to authorized staff and subject to the organization's privacy/retention process.

## Local audit acceptance (2026-10-03)

The configured SMTP connection and authentication passed `node testEmail.js verify` without sending a message. Intended-recipient inbox delivery, sender-domain authentication, deployment HTTPS/proxy behavior, TURN relay/media tests and staging load/recovery remain release acceptance checks. This local environment uses development mode and has no TURN relay configured. Provider connection verification cannot stand in for those checks.

The existing local database was upgraded with preservation checks for all original table rows and field values. Canonical pre-upgrade and post-upgrade snapshots were restore-tested with full field signatures and migrated twice in isolation. The stronger checks corrected an initial logical-export date/time conversion issue; earlier archives are preserved but marked superseded, and the verifier refuses them. Use the canonical snapshot paths and checksums in [AUDIT_REMEDIATION.md](AUDIT_REMEDIATION.md). The live database was never restored from a defective export.

Older authentication sessions require login again. The exact known synthetic demo hospital was assigned through the narrowly guarded demo helper and an administrator audit; a repeated run made no changes. Original account passwords/profile fields were independently compared and preserved. Real historical membership always requires an administrator's explicit assignment.
