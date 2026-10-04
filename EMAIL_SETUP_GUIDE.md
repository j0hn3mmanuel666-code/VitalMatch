# Email configuration and delivery

VitalMatch uses one configured SMTP transport. Administrator email settings are stored in ignored `.local/settings.json` and override the corresponding environment defaults. The repository `settings.json` is a nonsecret template. There is no Ethereal account, mock delivery, or automatic fallback to a test inbox.

Configure SMTP in Admin Settings, or provide `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`, and `BASE_URL` through the deployment environment. Port 587 uses required STARTTLS; port 465 uses implicit TLS. Production `BASE_URL` must use HTTPS. Follow your provider's current credential and sender requirements; never commit its password. Do not change source code to switch providers.

Admin Settings shows whether a transport is configured and whether its connection has been verified. **Verify connection** authenticates to the provider without sending a message. `node testEmail.js verify` performs the same check. A verified connection does not establish inbox delivery.

For an intentional delivery test to a designated recipient, run `node testEmail.js test-send intended-recipient@example.com`. This sends a clearly labeled test message and prints only its outcome. Check the intended inbox and spam folder. Provider acceptance does not establish recipient delivery or domain authentication. Verification tests for this audit used synthetic transports and sent no real messages.

Registration, verification resend, and password reset report send failures honestly. Request outreach and appointment updates are saved in a durable database outbox with retries. The worker checks the current account, email preferences, and appointment version before sending. Admin Settings shows pending and failed email counts and can retry failed rows. A stale appointment message is superseded, and disabled preferences are recorded as suppressed. Recovery after ambiguous SMTP acceptance can produce a duplicate message; appointment links remain single-use and version-bound.

Coordination dispatch has its own durable jobs and retry status. It is distinct from SMTP delivery. Retrying coordination only dispatches requests that are still active and approved. Keep both workers running in the documented single application process. See [OPERATIONS.md](OPERATIONS.md) for provider, worker, HTTPS, backup and release checks.
