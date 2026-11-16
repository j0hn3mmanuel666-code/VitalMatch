# Deployment status and change history

## 16 November 2026 — compact Users page deployed

Deployed the Users template and user-register CSS v2. Names stay beside avatars, Edit/Archive actions share a row on desktop, the toolbar and pagination are more compact, and narrow layouts retain all account details. Included the project's existing compact success/error notification styling. No account, permission, database or schema changes.

126 unit tests and 3 browser regression checks passed at 1660px, 1280px and 390px. Live authenticated verification confirmed CSS v2, compact rows, aligned actions and no horizontal overflow. Site/database health passed. Prior files and the standard production backup are retained; rollback files at `/srv/vitalmatch/backups/users-ui-20261116T151427Z`. An initial source guard stopped safely before mutation; review established that the live template differed only in legacy notification classes, and the final package required that exact reviewed source hash.

## 16 November 2026 — Google sign-in and install suggestion deployed

Deployed Google sign-in for existing account roles and new donor registration, plus the small floating install suggestion on the public landing page. Production Google callbacks require HTTPS and the configured BASE_URL origin; localhost remains supported separately. New Google users complete required personal/contact information, and public registration always creates donors. Existing account activation, verification, role and archival checks are retained.

126 unit and 43 isolated integration tests passed before deployment. Live Google authorization returned successfully to donor account completion; no new production account was created. Public pages/assets, install card, auth redirect, forged-callback rejection, all 15 deployed hashes and database health passed. Existing admin session survived deployment. No database migration or operational-data change. Prior application/environment and the normal production backup are retained; rollback package at `/srv/vitalmatch/backups/google-install-20261116T060420Z`. Temporary credential-transfer key removed after verification. See `.local/deployment/REPORT.md` for execution evidence.

The changes listed below were deployed to vitalmatch.site on 4 November 2026 after the user explicitly requested the online update. Native mobile releases and the separate unapproved installed-site Web Push design are outside this deployment. Historical local validation notes are retained below. See .local/deployment/REPORT.md for backup and verification details.

## 1 November 2026 — donor Blood Map consent

Implemented the confirmed consent design locally. Donor Profile step 4 has an optional consent checkbox; Settings → Donor Preferences has a separate map-privacy switch with immediate saving and error recovery. A saved profile displays its sharing status and links to Settings. Map consent is independent of donor availability and matching. New and existing donors default to hidden; only explicit opt-in permits blood type and approximate city to appear. Names, contacts, addresses, clinical information and exact coordinates are never shared through donor map pins. The donor's own private marker is labeled accordingly.

The server filters consent in the common donor query, including ordinary-user city aggregates, hospital/admin markers and donor totals. Map responses are private/no-store. Consent and change time are recorded with audit history. Older clients omitting consent preserve existing choices. The native donor profile also exposes the choice; no native device runtime test has been performed.

Deployment: back up the database, apply the reviewed additive schema upgrade (`20261101_01_donor_map_consent`) before restarting, and deploy the Donor model, map/consent services and controllers, user settings/profile routes, web templates/scripts and relevant mobile profile/API changes. This migration adds `Donors.shareOnMap BOOLEAN NOT NULL DEFAULT false` and nullable `mapConsentUpdatedAt`; it also picks up the pending prescription attribute. The local database was backed up before adding consent columns. Preserve all existing local and production data; no online instance was changed.

Validation: 36 database/HTTP integration tests passed, including default opt-out, explicit grant, revocation, CSRF, invalid values, legacy-client preservation, all viewer roles and counts, and continued donor availability. 17 form/template tests and project syntax/template checks passed; mobile TypeScript check passed.

## 1 November 2026 — optional prescription image

The user request form accepts one optional JPG/PNG/WebP image up to 5 MB in step 5, with a local preview. Uploaded images are stored under `private/prescriptions/` and served through `/requests/:id/prescription` only to the owner, admins, or the assigned hospital. Donors cannot retrieve these files. CSRF, multipart limits, and image signature checks apply before saving. Returned requests can retain or replace their attachment.

Deploy the prescription service and upload middleware, blood request controller/model, `index.js`, routes, request/details templates, and `public/js/workspace-form.js`. Before starting the updated server, back up the database and add nullable `BloodRequests.prescriptionImage VARCHAR(80)` (the existing reviewed schema migration also discovers the new model attribute). The local database was backed up and this column added locally. Back up and persist `private/prescriptions/` together with the database. No production changes were made.

Validation: 19 targeted unit/form tests, 35 database/HTTP integration tests, and project syntax/template checks passed. Integration covers optional submission without an image, actual multipart storage/retrieval, CSRF, disguised files, and owner/admin versus outsider access.

## 31 October 2026 — simplify hospital information on blood request forms

- Removed the Receiving facility selector and its explanatory paragraph from the user/hospital request form and admin new-request form. Hospital Name and the other hospital fields remain.
- Hospital accounts continue to use their assigned facility through existing server authorization. Other accounts submit without a facility selection and use the existing coordinator/admin review path. Hospital names alone do not grant access to patient records.
- Added a null guard to administrator form restoration so removing the selector does not break restored form values. Bumped that script's version.

Files to deploy:

- `views/request-blood.xian`
- `views/admin-new-request.xian`
- `public/js/request-form-context.js`

Database migration: none. Server restart needed to reliably refresh templates if production caching is enabled. Preserve current online files before replacement; validate request forms and health after deployment. No production files or data were changed for this task.

Validation: 17 form tests passed; 34 database/HTTP integration tests passed; project checks passed for 156 JavaScript files and 59 templates. Local health/database check passed. Updated the existing form test to require Hospital Name and confirm the removed facility selector is absent.


## 1 November 2026 — blood component descriptions

Added short, visible definitions below all six blood component labels in views/request-blood.xian, linked to each checkbox for screen readers. Deploy this template with the pending request-form changes. Validation: all 17 form/template tests passed. Definitions checked against American Red Cross blood component information.


Additional consent verification: 2 consent-policy unit tests passed (19 combined consent/form tests). Headless Edge checked Settings grant/revoke saving, failed-save rollback, and desktop/390px mobile layout with no horizontal overflow; both rendered layouts were inspected. Native TypeScript passed; native device behavior remains untested.


## 4 November 2026 — homepage emergency hotlines

Added an Oriental Mindoro emergency hotline section above the public footer, with national 911, provincial rescue numbers, five hospital contacts, tap-to-call links, official source links and the listing-check date. Added a footer shortcut from all public pages. Source listings were checked on the provincial government website and eGov directory; no calls were placed. Deploy views/home.xian, views/partials/public-footer.xian, views/partials/head-public.xian and public/css/landing.css (version 6). No database migration. Local browser checks confirmed all eight phone links, source links, footer shortcut and no horizontal overflow at desktop/390px widths. All 17 form/template checks passed. Production was not changed.


Hotline size refinement: reduced section padding, heading and 911 sizes, contact text and row gaps; removed the forced heading line break. Updated landing CSS cache version to 7. Live desktop/mobile phone-link and overflow checks passed; rendered layouts inspected.


## 4 November 2026 — blood-bank supply

Online: coordinators can choose Blood-bank stock (no donor required), then schedule a future pickup/release or record blood already supplied. Enter the supplying bank and stock/reference details in Notes. Future scheduling does not fulfill the request; actual units are recorded separately. Stock supply does not change donor history. Migration 20261104_01_blood_bank_supply adds source to Appointments and Fulfillments, preserving existing records as donor. This is supply coordination, not a stock inventory/reservation system. Isolated tests and live form verification passed; no real supply was recorded during verification. See .local/deployment/REPORT.md for backups and checks.

## 4 November 2026 — request register layout and pagination

Online: Requests displays five records per page, clear Previous/Next controls above and below the list, and combined related columns so actions remain visible without horizontal scrolling. Narrow displays use labeled request entries. Live Next/Previous navigation and desktop/phone layout checks passed. No request data changed.

## 5 November 2026 — PENDING: silent voice calls and CMS mutation errors

Local fixes and guarded package are ready; not deployed. Voice calls now have an audio player plus an Enable call sound autoplay fallback. Isolated browser audio reception/playback and 108 unit checks passed; two-device production verification still needed. CMS mutations now include required CSRF tokens and actionable session/server errors; selected images must be uploaded before creation. AWS is signed out; awaiting the user's AWS sign-in to apply voice-cms-package.tar.gz. See .local/deployment/REPORT.md. Earlier sections marked online do not include these pending fixes.

## 6 November 2026 — voice/CMS pending deployment resolved

Deployed the 5 November voice playback/CMS token fixes after AWS sign-in. Online now: voice media element, Enable call sound fallback, cleanup, callUI v5, and CMS create/edit/deactivate/upload token/error handling. The instance stop/start changed its IP to 56.10.140.12; root and TURN DNS were updated, site/database health and external authenticated TURN allocation passed. Previous PENDING/LOCAL ONLY notes describe the prior state. Both clients must refresh; real two-device audio still needs confirmation. For a selected image, click Upload before Create Section. No CMS content was published during verification.

## 6 November 2026 — selected tabs

Online: only the selected Settings/Website content tab has red text and underline. Fixed transparent-border tabs incorrectly matching the shared active selector; updated internal CSS to v16. Four light/dark browser checks and live selection switching passed. No settings/content values were saved during verification.

## 6 November 2026 — Users register

Online: five users per page, clear Previous/page-number/Next controls above and below, responsive contact details and visible Edit/Archive actions without sideways scrolling. Search and role filters keep working through pagination. Desktop/tablet/phone and live navigation checks passed. No accounts modified or deleted.

## 6 November 2026 — incoming ringtone

Online: incoming audio/video calls repeat a two-tone ringtone; it stops when the call is accepted, declined, cancelled, timed out, or closed. Mobile web sound is primed by a tap; Enable ringtone appears when the browser blocks autoplay. Footer uses call-ringtone v1 and callUI v6. Desktop/mobile viewport audio playback/stop tests and 112 unit checks passed. Refresh existing pages. Physical phone verification still needed; ringing while the mobile site is closed or suspended by the OS is outside this feature. No real user was called during verification.

## 6 November 2026 — persistent sign-in

Online: Keep me signed in defaults on at login; remembered browser sessions last 30 days and renew with use, including mobile API reads. Unchecked shared-device logins keep the configured short inactivity timeout. Sign out, password/auth-version revocation and account restrictions remain effective. Existing short sessions require one new sign-in with checkbox checked. Cookie/database/logout integration and desktop/mobile viewport checks passed. Native login source was updated locally but no native app build was deployed. Earlier unapproved remembered-device design is now authorized for this sign-in feature only; Web Push remains separate.

## 6 November 2026 — reopening returns to the dashboard

Online: saved valid sign-ins at / and /login automatically return to the correct account dashboard. Public navigation recognizes the validated account; My account uses its current role. The workspace Public website link uses /?public=1 for deliberate landing-page preview. Anonymous users still see public pages/login and revoked sessions are rejected. Desktop/mobile-size close-tab/reopen tests passed, and live Edge close/reopen returned the existing admin session directly to /admin/dashboard without credentials. No real accounts/data modified during verification.

## 6 November 2026 — live message time display

Online: message timestamps use the workspace's Philippine time setting (Asia/Manila), with full-date/time-zone tooltips. Conversation labels such as Just now / 1m ago update automatically every ten seconds while visible and when returning to the page. Saved timestamps remain unchanged; unsent drafts are retained during live label updates. Desktop/mobile viewport and live timestamp checks passed. Refresh an existing Messages page once to load the update.
