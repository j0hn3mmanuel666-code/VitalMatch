# Installed website alerts and remembered devices

## Intent

The user wants the installed VitalMatch website to receive phone notifications while closed, and to keep a selected device signed in. Apply to user, donor, hospital and administrator website accounts. The native Expo app is a separate client and is not the target of this change.

## Recommended behavior

- Add an unchecked **Remember this device for 30 days** login option, with personal-device guidance. Without it, retain the configured short session timeout. With it, issue the existing secure HttpOnly, SameSite cookie and persistent server session with a fixed 30-day maximum; do not store passwords in browser storage or extend indefinitely through polling.
- Retain current account, verification, archive, role and authVersion checks. Logout ends the device's session. Password changes, suspension and other existing session revocations still invalidate remembered sessions. Other devices retain their own independent sessions.
- Add **Enable phone notifications** and **Turn off on this device** controls to authenticated website settings for every role. Ask browser permission only following the user's tap. Explain unsupported browsers, denied permission, offline failures and Home Screen installation requirements. Do not automatically grant or accept permission on the user's behalf.
- Opt-in Web Push subscriptions belong to the current account and browser installation. Account switching cannot leave alerts attached to the previous account. Explicit logout disables that session/device's subscriptions; opting out affects this device only. Account revocation suppresses delivery.
- Deliver generic coordination alerts for existing notification events, plus text/voice message arrivals. Lock-screen content contains no patient names, clinical details, message contents or sensitive links/tokens. Tapping opens the authenticated notifications/inbox page; expired sessions require normal sign-in.
- A push subscription is independent of whether a webpage is currently running. It can remain eligible after ordinary session expiry, until explicit logout, opt-out, revocation or subscription expiry. Opening private content still requires a valid session. The 30-day remembered session governs signed-in access, not a claim of guaranteed notification delivery.
- Browser Web Push does not provide native lock-screen telephone answering. Closed-app calling is not promised by this change. Existing calls continue to require the website to be open. Call-attempt notifications could be added separately if requested.

## Approach and constraints

Use standard VAPID/Web Push and the existing service worker. Keep VAPID private keys server-side and stable across restarts, with the public key exposed for subscription only. No paid notification provider or native build is required by this approach.

Reuse the existing persisted sessions, notification queue and outbox conventions. Add dedicated web subscription/delivery storage where needed rather than treating browser subscriptions as Expo tokens. Add an additive, idempotent migration with a verified database backup before production application. Preserve all existing user records, settings, native push groundwork and in-app alerts.

Browser subscription registration and removal are authenticated, CSRF-protected, validated and rate limited. Treat endpoint URLs as untrusted outbound destinations: permit supported browser push services only, reject local/private targets and redirects, and validate endpoint lengths and encryption keys. Do not expose subscription keys or endpoints through another account's API response.

Record delivery claims, bounded retries, suppression and provider expiry (404/410). Avoid duplicate alerts from retried notification creation. Recheck current subscription ownership and account authorization immediately before sending. Use generic safe same-origin destinations on notification click; do not fetch private notification content from the service worker without authentication. Handle already-open windows and multiple accounts safely.

## Alternatives

Recommended: extend the installed website with Web Push and opt-in persistent sessions. This directly addresses the requested installed-site experience.

Native Expo notifications require a separately built and installed native app and mobile release setup; they do not enable push for the installed website.

Keeping a website polling in the background cannot reliably deliver notifications while the app is closed. Email does not provide the requested installed-site notification experience.

## Verification and delivery

Use isolated synthetic accounts for session duration, default timeout preservation, cookie attributes, logout/device separation, account switching, revocation and invalid subscriptions. Test queue deduplication/retries/expired endpoints and absence of sensitive payload data. Test worker push/click behavior and settings/browser permission states without using real patient data or unsolicited real-user alerts.

Verify production migration, stable private key permissions, service recovery and public health after deployment. Confirm supported-browser delivery with the website closed where the environment permits; a physical Android/iPhone delivery test remains necessary if no phone is connected. Report tested outcomes and device-specific limitations accurately. Notification permission and installation on each real phone remain user actions.

## Approval status

The user authorized pursuing these capabilities. The recommended 30-day duration and above behavior are proposed implementation choices awaiting design approval.
