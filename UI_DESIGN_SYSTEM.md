# VitalMatch workspace design system

The approved landing page establishes the product's visual language: local Inter typography, charcoal text, light neutral surfaces, a restrained blood-red brand mark, 4px controls, fine borders, and open sections. The account workspace carries those principles into forms, records, and coordination tasks. Public landing-page layouts and styles remain independent.

## Shared foundations

`public/css/internal.css` owns workspace tokens and component appearance. `public/css/internal-utilities.css` is compiled from the existing template utilities; it provides layout support rather than a second component theme. Both load through `views/partials/internal-assets.xian` on `.vm-internal` bodies. Public typography is reused without changing its font files or rules.

| Foundation | Workspace rule |
| --- | --- |
| Font | Locally hosted Inter, regular 400, medium 500, semibold 600, bold 700 |
| Page title | 24–30px, compact line height, restrained negative tracking |
| Section title | 18px; smaller subgroup headings use 16px |
| Body / controls | 15px body; 14px buttons, labels, and table content |
| Supporting text | 12–14px, muted; keep essential instructions readable |
| Spacing | Use 4, 8, 12, 16, 20, 24, 28, and 36px; page gutters scale from 16–36px |
| Content width | Workspace maximum 1240px, with narrower forms where appropriate |
| Navigation | 232px desktop sidebar; 66px top header |
| Corners | 4px controls, panels, and scroll regions; 3px statuses; 6px focused dialogs |
| Borders | 1px neutral separators; stronger control borders and visible focus |
| Shadows | Reserved for overlapping dropdowns, dialogs, and transient feedback |
| Motion | Short navigation/control transitions; loading indicators; reduced-motion override |

## Color and action meaning

| Token | Light appearance | Dark appearance | Purpose |
| --- | --- | --- |
| `--vm-ink` | `#252b2d` | `#e9ebee` | Main text |
| `--vm-muted` | `#596367` | `#b5bbc2` | Supporting text |
| `--vm-paper` | `#ffffff` | `#222529` | Working surface |
| `--vm-canvas` | `#f5f6f3` | `#191b1f` | Page background |
| `--vm-soft` | `#eef1ec` | `#2a2d32` | Quiet grouping, table headings, neutral states |
| `--vm-line` | `#dce0df` | `#3b4047` | Structural borders |
| `--vm-control-line` | `#98a29f` | `#717982` | Visible field and secondary-action borders |
| `--vm-brand` | `#b82025` | `#e8787b` | Blood-drop identity |
| `--vm-focus` / `--vm-info` | `#305c78` | `#a8cbe0` | Keyboard focus and informational states |
| `--vm-success` | `#226449` | `#91c8a3` | Active, approved, fulfilled, completed |
| `--vm-warning` | `#815619` | `#e4c183` | Pending, waiting, attention |
| `--vm-danger` | `#a32129` | `#f19699` | Rejection, cancellation, failure, critical urgency |

Dark appearance has a corresponding neutral token set in the same stylesheet. `theme-bootstrap.js` initializes the stored/system preference; `internal-ui.js` controls the shared appearance switch.

Use `.vm-button--primary` for the principal save, submit, create, or continue action. It uses the restrained brand red (`#b82025`, hover `#94171c`) in both appearances. Use `.vm-button--success` for approval, verification, confirmation, and recording completed donations; its green surface is `#226449`. Use `.vm-button` for view, edit, back, close, export, download, and other secondary actions. Use `.vm-button--danger` for cancel, reject, decline, delete, remove, archive, and withdrawal actions and `.vm-button--danger-solid` for their final confirmation. Use `.vm-button--warning` when an action requires attention without being destructive. Use `.vm-button--small` where table density requires it. Status color and action color serve different purposes; a completed record does not require a green navigation button.

Keep one visually strong primary action in each action group. A table's view/edit controls should stay neutral. Short row actions retain visible words such as View, Complete, and Cancel. Icon-only controls need accessible labels.

## Reusable structure

| Component | Implementation |
| --- | --- |
| Account assets | `internal-assets.xian` and `.vm-internal` |
| Brand mark | `brand-mark.xian` |
| Header | `internal-header.xian`; dashboard search is an optional variant |
| Sidebar | Existing `user-sidebar.xian` / `admin-sidebar.xian`, with shared `.vm-sidebar` rules and navigation controller |
| Page | `.vm-page`, `.vm-page-container`, `.vm-page-heading`, `.vm-heading-actions` |
| Content sections | `.vm-section`, `.vm-section-heading`; `.vm-panel` only where grouping helps |
| Forms | `.vm-form-shell`, above-field labels, `.vm-form-actions`, native controls and server constraints |
| Tables | `.vm-table-scroll` and `.vm-table`; scoped headings, one scroll region, clear row actions |
| Statuses | `status-badge.xian` with `value` and optional `label`; `.vm-status` variants for existing dynamic renderers |
| Confirmation | `confirm-dialog.xian` / `confirm-dialog.js`, retaining existing global dialog APIs |
| Alerts / toasts | `.vm-alert` and semantic variants; `.vm-toast` with success/danger variants |
| Tabs / pagination | `.vm-tabs`, pressed/current state, `.vm-pagination` |
| Empty state | `.vm-empty-state`, a short explanation and a useful next action |
| Notifications | Shared badge/polling behavior in `workspace-notifications.js` |
| Dashboard search | `workspace-search.js`, with separate desktop/mobile result regions and real loading/error feedback |
| Request list | `request-list.js` for filtering, sorting, expansion, and confirmed server submission |

Example status usage: `{{> status-badge value=status}}`. Unknown or neutral values retain a neutral treatment and their text. Known scheduled/review/contacted states use blue, pending/high/urgent use amber, active/fulfilled/completed use green, and cancelled/rejected/failed/expired/overdue/critical use red. Do not convey status solely through a colored dot.

A typical page starts with its title, a short description, and the main action. Search/filter controls follow, then the main records or form. Use dividers and open lists before adding another card. Dashboard summaries stay compact; current requests, review tasks, activity, and frequent actions precede optional analytics. Estimated impact figures are labeled as estimates.

## Responsive behavior and accessibility

At widths below 1024px, navigation becomes a drawer. It isolates the background, keeps keyboard focus within navigation, closes with Escape or the backdrop, and restores focus and scrolling. Desktop collapse preference remains separate from mobile open state. Active navigation uses `aria-current`.

Below 768px, page gutters and panel padding become compact, form inputs remain 16px, forms stack, and action groups can wrap. Data tables scroll horizontally within their own region. Mobile messages show the conversation list or the selected conversation, with a visible return action. Forms can keep their final action row visible while scrolling.

Use above-field labels, visible focus, required indicators, native field constraints, helper text, and associated error messages. Dialogs keep a focus loop and restore their trigger. Larger existing user editors use a full-height workspace surface. Avoid scroll-reveal animation or fabricated progress in account pages. Keep map pins and operational loading indicators functional.

## Maintaining the assets

Run `npm run build:ui` after changing utility classes in templates or scripts. The generated CSS is served locally and is included with the application; production does not need to execute the compiler. Tailwind and LinkeDOM are development dependencies. The compilation approach follows the [Tailwind CSS v3 installation documentation](https://v3.tailwindcss.com/docs/installation).

Run `npm test` for existing public/security checks and workspace interaction regressions. CSS/HTTP/template checks and actual browser review are separate gates. When releasing another asset revision, update its query version in the relevant partial because the existing service worker caches static assets.

Preserve field names, default values, required/validation attributes, CSRF handling, endpoints, and role conditions when extending the visual system. Keep business decisions on the existing server. The approved public landing page remains the reference for visual discipline, rather than a source of dashboard hero sections.

## Record search and composition

Full record lists search on the server before pagination, retaining role and ownership scopes. Shared GET forms preserve active filters and reset page positions; pagination retains search, filters, and sorting. Facility accounts and donation history have independent page parameters. Request-list filtering and sorting cover all owned records. Search treats percent and underscore as literal text.

Compact dashboard previews and complete report tables use independent local search with result counts and an accessible empty row. Full server-paged tables explicitly opt out of local filtering. The existing account API search remains authoritative for its table.

Warm light neutral canvas, small red heading markers, tinted active navigation, open report summaries and activity lists, white metric bands, quiet guidance rails, and simple table surfaces create visual variety. Forms remain open, without adding decorative cards or imagery. Dark appearance uses the same action meanings.
