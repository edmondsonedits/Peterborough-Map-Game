# Private feedback execution record

## Implementation
- Approved scope and no-warning preference recorded in the design; native implementation used in a fresh feature checkout.
- Synced the separately delivered compact driving UI update from main before bumping the shared release from 1.6.132 to 1.6.133.
- Model tests failed before implementation and passed afterward. Real Firestore emulator rules initially denied valid owner writes; the completed rules pass all 9 authorization/immutability/cooldown cases.
- Real Firebase Auth/Firestore browser flow verifies guest skipping, guest-to-account identity linking, two-player isolation, trusted developer claim/replies/private notes, unread/read behavior, offline retry, sign-out, same-browser switching, keyboard containment and mobile bounds.

## Independent review and fix pass
A separate reviewer read commit 89ddc9c. No Critical findings. All reported findings were addressed, including the lower-severity items because they affect the specified all-mode entry points, pagination and visible conversation status.
- Confirmed the SDK-cache privacy leak in a real browser: Bob could receive Alice's cached messages offline. Explicit reads now require the server; listeners ignore cached/pending results and request metadata changes so server acknowledgement still renders reopened chats. The same-browser offline isolation scenario now passes.
- UI regression scenarios failed before fixes for stale pagination, role downgrade, lost retry IDs, old send completion replacing a newer view, lost pagination cursors, stale status and station-picker entry. All 9 final scenarios pass.
- Developer-role changes now clear subscriptions and private UI, including notes.
- Draft submission IDs survive close/reopen; async completions check identity/view generations.
- Conversation detail scrolls at short viewport heights and notes start collapsed; Send remains reachable at 390×400.
- Route station picker now has Feedback, alongside the existing settings/menu integrations.
- Pagination preserves the oldest loaded cursor across live updates, and open status controls/header refresh.

## Final verification
- `node --test tests/*.test.cjs tests/*.test.mjs`: 695 passed, 0 failed.
- Real Firestore emulator `feedback/tests/rules.test.cjs`: 9 passed, 0 failed.
- `tests/feedback-browser.cjs` against Auth/Firestore emulators: PASS.
- `tests/feedback-ui-races.cjs`: 9 scenarios passed.
- Syntax checks and `git diff --check`: pass. Desktop/mobile screenshots inspected.

## Deployment decisions and limits
- Ruling: Keep feedback's Firebase configuration and deny-by-default rules separate from the existing scoreboard/analytics migration. This prevents an unrelated analytics migration; it requires feedback project setup.
- Ruling: Deliver as a draft PR with `enabled: false` until a Firebase connection/project is available. This avoids presenting unsent local messages as delivered feedback; players cannot use the feature until activation.
- Live Firebase project settings, indexes, account recovery delivery, developer grant and hosted end-to-end delivery remain unverified. The official Firebase plugin is available for connecting and completing setup.
- Physical phone keyboards were not tested; browser viewport checks include 390×844 and 390×400.
- Existing root analytics rules remain unchanged and are not part of this deployment.
