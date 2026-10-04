# VitalMatch UI refresh

Date: 3 October 2026

The workspace now carries the approved public landing page's restrained red accents, locally hosted Inter typography, warm neutral backgrounds, and open composition into account and administration screens.

## Delivered changes

- Brand red primary actions; green approvals, verification, confirmations, donation completion and call acceptance; amber warning/rescheduling actions; red cancellation, rejection, archive and withdrawal actions; neutral secondary controls. Dynamic appointment dialogs and account bulk controls use the same meanings.
- Clearer page headings and active navigation, quieter control borders, white summary bands, open report summaries and activity lists, tinted guidance rails, and simple table surfaces. Shared styles apply to account, administration, form, messaging and map screens in both appearances.
- Server search on requests, donors, facilities, hospital accounts, appointments, donor enquiries, patient records and personal history. Search composes with existing role, ownership, eligibility and status predicates before pagination.
- Full-set filtering and sorting for My Requests. Search and filter changes reset pagination; page links preserve the current query. Stale page numbers are clamped to available results. Blood types containing plus signs retain their exact values.
- Independent pagination for hospital accounts and donation history, replacing fixed account/history cutoffs. Each hospital table has its own search field.
- Independent local search, result counts and accessible empty feedback for complete report tables and dashboard preview tables. Server-paged tables do not receive local row filtering. Existing account API search remains in use.
- Literal wildcard input, safe numeric ID matching, labeled search fields, keyboard focus styling and table-contained horizontal scrolling.
- Correct donor display on administration appointments, and removal of a duplicate admin request-form footer that loaded call scripts twice.
- Asset query revisions and the public stylesheet precache reference updated for refreshed delivery. Cache regression tests derive the worker's current version rather than assuming an older revision.

## Verification

| Check | Result |
| --- | --- |
| UI stylesheet compilation | PASS |
| Unit and DOM regression checks | PASS: 98 tests |
| Isolated database and HTTP integration checks | PASS: 31 tests |
| Chrome browser checks | PASS: 18 tests |
| Project JavaScript/template validation | PASS: 138 JavaScript files, 57 templates |
| Scoped tracked-file whitespace check | PASS |

Browser checks cover public entry pages, navigation for four roles, forms, dialogs, protected response caching, search beyond page one, filter preservation, literal percent searches, independent pagination, sorting across the full dataset, semantic button colors, desktop/sidebar placement, mobile containment and report empty results.

The review captured 45 screenshots in `.local/ui-review/` using disposable synthetic records. Representative dashboard, report, appointment, donor and hospital views were visually inspected. Desktop captures use 1440px width; responsive checks include 390px and 768px; a dark appointment capture is included. These checks establish local Chrome behavior and representative rendered layouts, not production or physical-device certification.

The browser-act executable was blocked by Windows Application Control. The project's installed Playwright setup successfully used Chrome for browser verification. Existing dirty workspace changes were preserved. Real demo-account credentials were not read, and no production deployment or real-record mutation was performed.

## Review artifacts

- `.local/ui-review/admin-dashboard-desktop.png`
- `.local/ui-review/admin-reports-390.png`
- `.local/ui-review/donor-dashboard-1440.png`
- `.local/ui-review/hospital-patients-390.png`
- `.local/ui-unit-tests.log`
- `.local/ui-browser-tests.log`
- `.local/ui-project-check.log`

The current shared design and maintenance rules are documented in `UI_DESIGN_SYSTEM.md`.
