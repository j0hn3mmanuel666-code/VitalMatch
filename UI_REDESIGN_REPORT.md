> Current verification (2026-10-03): the audit remediation supersedes the verification limits in this earlier design report. The final Chrome suite passes public/admin pages, protected-cache checks, native forms, mobile containment and keyboard dialogs. The whole application now has independent unit and isolated database/HTTP coverage; current results and operational boundaries are recorded in [AUDIT_REMEDIATION.md](AUDIT_REMEDIATION.md). The historical implementation notes below remain as design context.

# VitalMatch workspace UI implementation report

Date: 3 October 2026

The account and administration interfaces now use a shared design system derived from the approved landing page: local Inter typography, charcoal text, quiet neutral surfaces, fine borders, small corners, and restrained spacing. The workspace has compact navigation, page headers, forms, and record layouts appropriate to daily coordination work. The approved public interface was preserved.

Implementation and the automated checks below are complete. Rendered browser appearance and full browser workflows remain unverified because the available computer-use environment has no enabled browser surface.

## Implemented scope

The redesign covers 27 internal page templates, the administration layout, and both role-based navigation shells. Shared assets, headers, confirmations, statuses, and behavior apply across administrator, hospital, donor, and general account roles.

| Area | Pages and changes |
| --- | --- |
| Account workspace | Dashboard, donor profile, donor detail, help, history, hospital patients, map, messages, appointments, requests, notifications, settings, blood-request forms, and request detail |
| Administration | Dashboard, requests, request creation, appointments, donors, hospitals, reports, users, settings, public content management, and calls |
| Shared shell | 232px desktop sidebar, 66px header, clear active navigation, consistent page context, profile/notification controls, appearance preference, and a simpler footer |
| Content hierarchy | Compact real-data summaries, open activity/request lists, dividers, clearly grouped forms, and single table scroll regions; fewer nested panels and decorative statistics |
| Actions and statuses | Charcoal primary actions; neutral view/edit/export controls; red destructive actions and confirmations; amber attention; labeled neutral, information, success, warning, and danger statuses |
| Forms and tables | Above-field labels, consistent controls and focus/error styles, readable row spacing, visible row-action labels, responsive form stacking, horizontal table scrolling, and useful empty/filter feedback |
| Interaction/accessibility | Navigation and dialog focus handling, Escape/backdrop close, restored focus, background isolation, active/expanded states, loading/error messages, and reduced-motion support |
| Appearance | Shared light/dark tokens, semantic dark-mode mappings for retained utility classes, and matching map controls and popups |

The dashboards use existing controller data to emphasize current requests, pending work, activity, and frequent actions. Estimated donation impact is identified as an estimate. The interface no longer shows simulated request progress, fabricated live notification counters, or decorative dashboard update timers.

## Shared implementation

`public/css/internal.css` owns design tokens and reusable component styles. The existing template layout utilities are compiled locally into `public/css/internal-utilities.css` using `tailwind.config.cjs` and `internal-utilities.source.css`. Internal pages no longer depend on a runtime Tailwind CDN for these styles. Tailwind and LinkeDOM are development dependencies; runtime dependencies were retained.

New shared partials provide account assets, the brand mark, header, confirmation dialog, and status badge. Existing account/administrator sidebars and head partials use those foundations. New shared scripts control navigation and appearance, confirmations, notification polling, request-list interactions, and dashboard search.

The reusable patterns, token values, component classes, semantic meanings, responsive rules, and maintenance commands are documented in [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md). The public design record in [DESIGN.md](DESIGN.md) links to the workspace documentation.

## Functional corrections within the UI

- Request filters use the clicked control consistently, including clicks on its count. Sorting changes the visible record order, expanded details expose their current state, and unmatched searches have clear feedback.
- Request cancellation submits the existing `/cancel-request/:id` POST with CSRF only after confirmation. It retains the server's ownership/status checks and redirect feedback. Cancelling the confirmation does not submit.
- Desktop and mobile dashboard search have separate visible result regions, use the existing `/api/search` endpoint, ignore stale responses, display loading/unavailable states, and restore focus when closed.
- Dashboard keyboard shortcuts use the shared navigation/search controls. Obsolete initialization references and simulated update timers were removed.
- Confirmation dialogs retain the existing global APIs and action callbacks, resolve once, use text-safe copy, and preserve POST/CSRF logout behavior.
- Existing notification endpoints and polling remain in use. Shared badge behavior is consistent, and request alerts open the actual alert dialog.
- Repeated CMS field identifiers were made unique. CMS tabs expose their selected state, and existing editor dialogs participate in the shared focus/close behavior.
- Mobile messaging provides a visible path back to the conversation list while retaining the existing messaging and call handlers.

## Preservation boundary

The working tree already contained backend changes, cleanup, and the approved public redesign when this task began. Those changes were preserved. No controllers, routes, middleware, models, services, database schema, or authentication/permission rules were edited by this UI pass.

The protected baseline comparison confirms that 68 selected backend/public source files retain their start-of-task hashes. This includes the approved public templates/styles and typography rules. Twenty existing template form sets retain their form actions/methods and named-field contracts, including values and validation constraints. The comparison covers source contracts rather than every possible application state.

Runtime verification used separate local sessions for the existing four demo roles. It performed sign-in, page reads, and sign-out. It did not create, approve, delete, fulfil, or cancel operational records, send messages, or run migrations. Cancellation submission is exercised with a DOM test double rather than a live record mutation.

## Verification evidence

All results below were refreshed against the final files and the local preview on port 3000.

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm test` | PASS: 35 tests, 0 failures | Existing public/security checks plus actual shared navigation, confirmation, theme, request-list, and search scripts exercised in DOM/VM tests |
| `npm run build:ui` | PASS | Local utility stylesheet compiles successfully |
| Template/role rendering | PASS: 160 renders | All 40 root templates compile with four role fixtures; duplicate IDs and inline JavaScript/JSON syntax checked, including populated CMS/record fixtures |
| CSS parsing | PASS | Both workspace stylesheets parse successfully |
| Form source contracts | PASS: 20 template form sets | Existing actions, methods, named fields, values, and constraint attributes preserved |
| Protected source baseline | PASS: 68 files | Selected backend/public source hashes match the start of this UI pass |
| Authenticated HTTP checks | PASS: 54 responses | Administrator, hospital, donor, and general account page responses; 53 HTTP 200 responses and one expected account-to-donor-profile redirect |
| Response structure | PASS | Checked account responses have one main landmark, one shared header, local workspace styling, no duplicate IDs or invalid inline scripts, and no unlabeled visible form fields in the parsed HTML |
| Public pages and assets | PASS: 18 checks | Eight public pages return HTTP 200; ten CSS/JavaScript/font assets return HTTP 200 and match the current workspace file hashes |
| Selected token contrast | PASS: 16 pairs | Light/dark text, status, primary-action, and control-border token pairs satisfy their selected contrast thresholds |
| Changed-file whitespace | PASS | Scoped `git diff --check` succeeds |
| Rendered desktop/tablet/mobile review | NOT VERIFIED | No enabled browser surface is available |
| Full browser action workflows | NOT VERIFIED | HTTP/template/DOM checks do not establish complete browser behavior or production readiness |

The contrast calculation covers fourteen text pairs at a 4.5:1 threshold and two control-border pairs at a 3:1 threshold. These follow the W3C explanations for [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). The lowest selected text ratio is 5.90:1; selected control-border ratios are 3.27:1 in light appearance and 3.52:1 in dark appearance. This token calculation is not a complete accessibility audit of rendered pages.

Local evidence is recorded in `.local/ui-contract-check.json`, `.local/ui-http-check.json`, `.local/ui-asset-check.json`, and `.local/ui-contrast-check.json`. Permanent interaction regressions are in `tests/internal-ui.test.js`, `tests/request-list.test.js`, and `tests/workspace-search.test.js`.

## Preview and remaining review

The refreshed application is available at [http://localhost:3000/login](http://localhost:3000/login). The internal stylesheet revision is `internal.css?v=4`, with versioned shared assets to distinguish them from previously cached files.

The remaining review is to inspect real rendered screens in light/dark appearance at desktop, laptop, tablet, and mobile widths; verify populated tables, long forms, navigation, notifications, search, map controls, messaging, and confirmation dialogs; and run permitted browser workflows using suitable test records. No deployment was performed.

For later utility-class changes, run `npm run build:ui`. For interaction changes, run `npm test`. Update the relevant asset query revision when publishing new static assets because the existing service worker caches them.
