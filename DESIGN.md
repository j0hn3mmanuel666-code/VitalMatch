---
name: VitalMatch Humanitarian Public Website
scope: public-journey
typography:
  family: Inter, sans-serif
  body: 400-500
  controls: 500-600
  sectionHeading: 600
  mainHeading: 700
colors:
  accent: '#b82025'
  accentHover: '#94171c'
  text: '#252b2d'
  secondaryText: '#596367'
  surface: '#ffffff'
  subtleSurface: '#f5f6f3'
  border: '#dce0df'
  footer: '#252d2f'
---

# VitalMatch public design

The public website presents blood donation coordination as a community service. Its visual direction is calm, readable, and human: restrained red actions, charcoal text, white and light neutral surfaces, real contextual photography, and open layouts. Inter remains the single typography family throughout the application.

## Scope and implementation

The shared public shell covers the landing page, About, Contact, Privacy, Terms, login, donor registration, password recovery/reset, registration/email verification states, appointment confirmation, 404/application errors, and the offline page. Protected account and administration layouts remain separate. All public templates use head-public, public-nav, and public-footer. Styles live in public/css/public-journey.css and public/css/landing.css; shared typography remains in public/css/typography.css.

Public pages use local CSS rather than the Tailwind CDN. The authenticated interface extends the same typography, neutral palette, restrained borders, and spacing principles through the shared workspace system documented in [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md). Its styles live in public/css/internal.css, with locally compiled utility support. No new dependency is needed for the public design or motion.

## Composition and hierarchy

- The header has a small chapter-context strip, a compact VitalMatch wordmark with a blood-drop symbol, direct information links, sign-in, and donor registration. It remains sticky and gains a subtle shadow after scrolling. Mobile navigation uses a button with an expanded state, closes on Escape or outside interaction, and remains navigable without JavaScript.
- The hero introduces the purpose and two existing primary actions beside a real Philippine Red Cross blood-drive photograph. Image captions identify the actual event rather than implying that archive photography depicts a VitalMatch or Mindoro deployment. CMS hero title, supporting text, actions, and image remain supported.
- An open introduction explains the human purpose. Two simple role paths clarify requester and donor actions. A light neutral process section explains three handoffs. Native disclosure elements answer practical entry questions. The call-for-donation section retains the public review-intake form. Optional CMS story and additional sections retain their text, imagery, and actions.
- The footer provides essential account, information, and policy links with a short coordination boundary. It does not display a placeholder telephone number or invented partnership logos.
- Information pages use a quiet article layout with local page navigation. Contact distinguishes platform account support from official Philippine Red Cross blood service information.

## Typography and spacing

Use Inter Regular or Medium for prose, Medium or SemiBold for controls, SemiBold for sections, and Bold for major page titles. Body copy has 1.65-1.75 line spacing. Main headings use about 1.12 line spacing and -0.035em tracking; sections use about 1.22 and -0.025em. Labels use small, restrained uppercase only for context. Hero headings scale from 2.6rem to 3.8rem on wide screens rather than dominating the first screen.

The main container is 1120px with 2rem side insets on desktop, 1.5rem on tablets, and 1rem on small phones. Sections use responsive 3.5rem-5.5rem vertical spacing. Forms and buttons use 4px corners, visible borders, and controls at least 44-48px high. Mobile inputs remain 16px or larger.

## Forms and interactions

Registration uses personal, contact, and security fieldsets, with an unboxed form and a simple next-step rail. The existing field names, required fields, endpoints, CSRF fields, and server validation are preserved. Hospital accounts are still issued by administrators. Password visibility and matching feedback enhance existing checks; the backend remains authoritative.

The donation dialog has a focus loop, Escape/backdrop close, restored trigger focus, and an inert background. Hidden CSRF inputs are excluded from the focus loop. Successful server redirects display a review confirmation. Verification resend feedback uses the existing endpoint's uniform message in a live region. Account recovery keeps its conditional account-existence language.

## Motion and accessibility

Selected below-the-fold sections reveal once using opacity and a 14px translation over 380ms. Staggers are capped at 140ms. The first screen is visible immediately. Content remains visible without JavaScript or IntersectionObserver; keyboard focus reveals waiting content. Reduced-motion visitors receive visible content and no transition or smooth-scroll effects. No counters, continuous floating, parallax, or invented metrics are used.

Pages include a skip link, one main landmark, heading hierarchy, native labels/disclosures, visible focus, contextual image alt text, and touch-sized controls. Navigation and form interaction logic have regression checks; those checks do not certify rendered browser layout.

## Photography and references

The locally hosted hero photograph is a real community blood donation event at SM City Baliuag, Bulacan, taken on 20 February 2017 by Judgefloro. It is available under CC0 and delivered at 1280px, approximately 244 KiB. See public/images/ATTRIBUTION.md for its source and license. CMS images below the fold use lazy loading and explicit dimensions.

Design references were reviewed for service clarity and participation paths, not copied:

- Philippine Red Cross blood services: https://redcross.org.ph/national-blood-service/
- Philippine Red Cross donor information: https://redcross.org.ph/give-blood/
- British Red Cross involvement: https://www.redcross.org.uk/get-involved
- IFRC: https://www.ifrc.org/

Keep clinical decisions with professionals. Do not add unsupported donor counts, wait times, testimonials, guarantees, programs, or partnerships. Existing CMS content remains editable and should use the same evidence standard.

## Validation

Run npm test for security smoke tests, public navigation/motion/password/dialog checks, and workspace navigation/dialog/request-list checks. Template/render and HTTP checks verify the public shell, form contracts, and asset delivery separately. Browser visual verification requires an enabled browser surface; desktop/tablet/mobile appearance and full browser workflows remain a separate gate. See [UI_REDESIGN_REPORT.md](UI_REDESIGN_REPORT.md) for the workspace implementation and current evidence.
