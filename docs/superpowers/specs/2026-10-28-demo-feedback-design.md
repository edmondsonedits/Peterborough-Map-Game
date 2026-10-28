# Demo requests in private feedback

The user authorized replacing the device-only demo counter with the existing private feedback conversations, deleting the old displayed request, and publishing the change.

## Approach
Use the existing homepage demo confirmation and feedback transaction, rather than a second request database or separate admin dashboard. Request this demo creates a normal private thread in a new `demo` category, with a generated city/mode-specific message. Keep the existing guest/account identity, server timestamps, developer queue, replies, notes, filters and AI export. After server acknowledgement, offer Open conversation. No analytics transport or browser counter can count as a successful submission.

## Behavior and constraints
- Capture the city/mode at confirmation open; validate against the city registry.
- Create guest identity through the existing service only when explicitly sending.
- Idempotent in-page retries use the same immutable thread/message IDs. Successful repeat clicks return the same receipt for that account and city/mode. Identity changes never expose another account's receipt.
- Failed writes remain retryable and never display success. No guest cache warnings.
- Show message timestamps and identify the developer's own submissions as You; other players remain represented by their existing private UID, without claiming to know a guest's real identity.
- Remove the old local aggregate and session markers on the next homepage/stats load. Do not turn the old anonymous count into a new feedback conversation.
- Replace the local/shared demo statistics tables with a link to the demo category in feedback. Leave unrelated secure analytics unchanged.
- Extend the existing category allowlist only; preserve ownership, immutability, role and throttling rules.
- Reuse the current dark mobile UI; no additional persistent gameplay HUD.
- Increment to 1.6.148, deploy only the dedicated feedback rules and publish GitHub Pages.
