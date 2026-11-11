# Donor map consent implementation

User confirmed profile consent and an enable/disable control in Settings on 1 November 2026. Build on the existing donor-map consent spec; keep local only.

1. Add failing HTTP coverage in `tests/integration/http.test.js` for default-hidden donors, explicit grant, revocation, all viewer roles, counts, CSRF, and availability independence.
2. Add `Donor.shareOnMap` (false by default, non-null) and `mapConsentUpdatedAt`; parse explicit consent in a small shared service. Save with the existing profile transaction and audit trail. Missing fields in older clients preserve existing consent; new donors default to hidden. Add a separate authenticated Settings privacy action so changing consent never depends on contact fields or availability.
3. Filter the common donor query in `controllers/mapController.js`, covering individual pins, grouped counts and totals. Return no-store responses. Keep the donor's own marker visibly private.
4. Add optional profile checkbox and independent Settings switch with clear sharing scope and error recovery. Carry the same consent through the existing mobile donor profile form and API.
5. Back up the local database, apply additive columns without modifying existing donor preferences, run HTTP/form/project checks and mobile type check. Document production migration and persistence requirements in the pending deployment checklist.
