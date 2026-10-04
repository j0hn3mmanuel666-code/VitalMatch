# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The public landing page serves people in Oriental Mindoro who need to initiate or understand an urgent blood request, volunteer blood donors, and the hospitals and Philippine Red Cross - Mindoro Chapter staff who coordinate those requests. These audience descriptions are derived from the implemented workflows and public copy.

## Product Purpose

VitalMatch is a digital blood request and donor-matching platform for faster emergency blood coordination. It lets hospitals or authorized requesters submit requests, helps identify qualified available donors, and supports notification and scheduling workflows.

## Positioning

VitalMatch is locally focused coordination infrastructure: it connects the request, donor-matching, notification, and follow-through steps of blood support within Oriental Mindoro rather than being a general health-information site.

## Operating Context

Requests may be urgent and need a clear next action. The application includes account-based donor, hospital, and administrator workflows; blood request forms; availability and donor profile details; matching; notifications; appointments; messaging; a map; and calls for donation.

## Capabilities and Constraints

- Public entry points include request blood, donor registration, login, information pages, and a call-for-donation submission.
- The existing system treats hospital and request workflows as authenticated actions.
- The public homepage is CMS-backed for hero, about, call-for-donation, and additional content sections.
- Do not invent clinical eligibility guarantees, current donor counts, wait times, testimonials, hospital partnerships, or outcomes that are not supplied by the system.
- Product name and Philippine Red Cross - Mindoro Chapter context are established in the current public content.

## Brand Commitments

VitalMatch should communicate calm, trustworthy, locally grounded emergency coordination. Its visual language must distinguish an urgent request from a clinical emergency, without sensationalism or coercive donation messaging.

## Evidence on Hand

- Implemented Express/Xian pages and routes in `views/`, `controllers/`, and `routes/`.
- Existing application icon assets in `public/icons/`.
- CMS-provided fields for public homepage content; one CC0 archive photograph now provides authentic Philippine Red Cross context, with its actual event location and source identified; no verified testimonials, metrics, or case studies are supplied.

## Product Principles

1. Make the next safe action unmistakable for both people seeking blood and potential donors.
2. Earn trust through clear process language, not unsupported claims or urgency theatrics.
3. Keep local coordination and human follow-through visible.
4. Preserve the distinction between public orientation and authenticated clinical workflows.

## Accessibility & Inclusion

Use semantic landmarks, keyboard-accessible navigation and dialog controls, readable contrast, reduced-motion support, and mobile layouts that retain the two primary paths without requiring horizontal scrolling.
