# Donor consent for map visibility

## Requested outcome

Ask donors for explicit permission before including their profile-derived information on the Blood Map. Apply locally, then record deployment requirements for the online site while its instance remains off.

## Proposed behavior

- Add an unchecked, optional checkbox to the donor profile: **I agree to show my blood type and approximate city on the Blood Map.**
- Explain that other signed-in VitalMatch accounts can see these limited details. The existing map is authenticated, not an anonymous public directory. Do not publish the donor's name, telephone number, email, address or exact coordinates.
- Default to hidden for new and existing donors until they explicitly opt in. Existing donation availability is not consent.
- Persist consent and its timestamp on the donor profile and record changes in the existing audit trail. A profile edit restores the current choice; validation errors preserve the submitted choice without treating them as saved consent.
- Allow the donor to withdraw by unchecking the choice and saving. Subsequent shared map responses exclude that donor from individual markers, aggregated counts and totals for every viewer role. A user can still see their own private location marker; clearly distinguish that from shared visibility.
- Keep existing eligibility, availability and account checks in addition to consent. Map consent does not change donor matching, medical eligibility, internal authorized coordinator records or donation availability.
- Only the authenticated donor can grant their own consent. Do not accept consent through admin account editing or unrelated mobile/profile updates. Optional registration/profile fields must never infer approval from a missing value.

## Approach

Recommended: persist explicit map consent and filter the shared map query on the server. This enforces privacy even if someone directly requests the map API.

Hiding markers only in browser JavaScript is insufficient because the API would still disclose donor-derived data. Making donation availability imply map consent does not provide the independent choice the user requested.

## Validation and deployment

Add an additive, idempotent migration that leaves existing donors opted out and preserves donor records. Test initial opt-out, grant, withdrawal, validation restoration, ordinary/hospital/admin map results and count filtering, plus continued matching independence. No anonymous map access is added. Check desktop/mobile form usability and local health. Record changed files, migration and backup requirements in docs/PENDING_DEPLOYMENT.md; do not start or modify the online instance.

## Approval status

Confirmed by the user on 1 November 2026: consent during donor profile completion and an enable/disable control in Settings. Proceed locally with the limited shared details and default-hidden behavior described above.
