# Blood bank supply

The user confirmed both future pickup/release scheduling and recording stock already supplied. Use an explicit donor/blood_bank source. Donor appointments still need a donor; blood bank supply does not. Coordinators identify the supplying bank/reference in notes. This records coordination, not verified inventory or a completed donation.

1. Add failing isolated workflow tests for donorless stock scheduling, requester confirmation, date enforcement, partial completion, reschedule/cancel, idempotency, no donor history changes, and immediate stock completion.
2. Persist supplySource on appointments and fulfillments (default donor for existing rows). Update schedule/completion policy and bank-specific requester notification; preserve existing donor safeguards.
3. Add source choice to the coordination form and stock-aware labels/status in appointment/request views. Update related browser regression tests.
4. Back up and apply additive source columns locally; run workflow/browser/form checks. Build a targeted, guarded production patch preserving previous online fixes, back up online data/files, add columns, restart and verify without submitting real stock or scheduling a real appointment.
