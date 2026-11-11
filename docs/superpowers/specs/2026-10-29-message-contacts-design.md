# Start conversations from the inbox

Users and hospital accounts need a direct way to contact an administrator before any conversation exists. Administrators need to find an account and start a conversation without a blood request or an existing chat.

## Proposed behavior

- Add a visible **Message admin** action to Messages for non-admin accounts. It opens a picker of active, verified administrator accounts. The user chooses an administrator, then writes their message in the existing conversation view.
- Here, available means an active, verified account that can receive messages; being offline does not prevent receiving a message. Do not imply that an administrator is online or promise an immediate reply.
- Add **New message** for administrators. Search active, verified accounts by name, email, or hospital name. Results show the account name, role, and hospital where applicable. Email can be used to disambiguate admin search results; ordinary accounts receive only administrator contact information.
- Selecting a contact opens the existing conversation, reusing its history if present. Opening a chat never sends an automatic message or creates an empty database message.
- Retain the existing conversation filter. Provide clear loading, no-results, unavailable-admin, and retry states for the new picker.
- Match the existing inbox design in light and dark themes, with keyboard operation and a layout usable on phones.

## Implementation and boundaries

Reuse the existing Message model, participant conversations, text and voice sending, and authentication. Enforce contact discovery permissions on the server: administrator search is admin-only; ordinary accounts can discover administrators only. Return only the fields needed by the picker, limit search results, and exclude the current account and inactive or unverified recipients.

This changes how a conversation is started. It does not introduce a shared support queue, automatic messages, online-status tracking, or replace the current delivery behavior. No new dependency or database migration is expected.

## Approaches

Recommended: a contact picker within Messages. It reuses the existing conversation implementation and keeps the action beside the inbox.

Alternative: a separate contact-directory page. It adds navigation for the same task without improving this requested flow.

Alternative: a shared admin support inbox. It requires assignment and shared-access rules and does not match the user's choice to select an administrator.

The user chose selection among available administrators. The embedded picker is the implementation recommendation, pending approval.

## Validation

Verify user and hospital access to the admin picker; admin search and first-message flow; reuse of existing conversations; rejection of unauthorized directory access; exclusion of unavailable accounts; preserved participant privacy; and desktop/mobile inbox rendering. Do not send messages to real accounts during verification.
