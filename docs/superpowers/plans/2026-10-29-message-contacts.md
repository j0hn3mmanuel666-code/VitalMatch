# Message Contacts Implementation Plan

**Goal:** Start administrator and account conversations directly from Messages.
**Architecture:** Add a permission-scoped JSON contact endpoint and an inline contact picker; reuse existing conversation and sending routes.
**Tech Stack:** Express, Sequelize, Xian/Handlebars, browser JavaScript and existing CSS.
**Spec:** docs/superpowers/specs/2026-10-29-message-contacts-design.md (approved).

## Constraints and review focus

No dependencies, schema changes, automatic messages, or real-account test sends. Preserve the existing working tree. Server authorization must prevent non-admin account-directory access. Exclude self, archived, inactive, and unverified accounts. Handle short searches, duplicate names, stale requests, errors, empty results and keyboard navigation.

## Task 1: Scoped contact discovery

- [x] Add HTTP regression tests in tests/integration/http.test.js for admin search, ordinary/hospital admin selection, field privacy, unavailable recipients and opening without sending.
- [x] Run npm run test:integration and observe missing endpoint failure.
- [x] Implement messageContacts in controllers/messageController.js and authenticated GET /messages/contacts in routes/index.js. Return {contacts:[{id,name,role,hospitalName,email?}],hasMore:boolean}, maximum 20. Ordinary accounts see admins only; admins search by names/email/hospital. Admin email is returned only to admin callers.
- [x] Enable existing /messages/admin action for ordinary authenticated accounts and require verified/nonarchived admin eligibility.
- [x] Run integration tests to green.

## Task 2: Inbox contact picker

- [x] Add role-aware Message admin/New message action and inline search/results to views/messages.xian, preserving conversation filter and existing composer.
- [x] Add public/js/message-contacts.js using safe DOM text nodes, debounced requests, cancellation/stale-result protection, loading/error/retry/empty states, and focus return on closing.
- [x] Add scoped styles to public/css/internal.css using existing tokens and themes.
- [x] Verify tests, project checks, and browser desktop/mobile rendering with synthetic accounts; review diff for security and unrelated edits.

Execution: inline in this chat, as authorized by the user's approval. No automatic Git commit/push or production replacement of unrelated local changes. Use the current working tree because the existing deployed baseline includes extensive uncommitted work; a clean HEAD worktree would test a different application. Record evidence below.

## Evidence

Observed regression failure before implementation: missing contact route returned 404. Final integration: 33 passed. Unit: 98 passed. Targeted Edge browser suite: 5 passed, including desktop/phone, light/dark screenshots, safe rendering, keyboard dismissal, retry and empty results. Project check: 154 JavaScript files and 59 templates passed. Independent reviewer found no actionable issues. Fixed Escape default behavior exposed by browser regression. No real accounts messaged. Feature-only deployment archive prepared with server-side prior-file backup; deployment pending restoration of server access. Current PC public IP is 143.44.156.97; configured SSH source was 143.44.156.68, and SSH to 56.10.145.163 times out. No firewall, IAM, live source or production data changes made.


Deployment completed 29 October 2026, 23:38 PHT after explicitly approved Systems Manager setup restored access. Live ordinary-user admin chooser verified; public and TURN checks pass. Server backup: /srv/vitalmatch/backups/message-contacts-20261029T153659Z. See .local/deployment/REPORT.md for infrastructure and deployment evidence.
