# Private player feedback and optional accounts

Approved scope: private player/developer conversations in the game, optional sign-in with Continue as guest, permanent account creation that retains the current guest UID and conversations, and no guest cache-clearing warnings. All modes and departments share the inbox.

## Approach
Use Firebase Authentication (email/password and anonymous identities) with Firestore Security Rules enforcing ownership and a trusted `feedbackAdmin` custom claim. The existing scoreboard project is not assumed operational: its public auth configuration request failed, and its checked-in target rules have an unrelated pending analytics migration. Keep this feature's configuration and rules isolated in `feedback/`; activation requires a configured Firebase project and deployed rules. Do not publish an apparently functioning local-only chat.

Browser-only storage cannot deliver cross-device developer conversations. A separate bespoke messaging backend adds a second identity implementation. Firebase fits the existing repository and supports guest-to-permanent linking directly.

## Behavior
Launcher offers Sign in, Create account, Continue as guest. Gameplay never requires authentication; auth/network failures cannot block it. Feedback and account controls live in existing menus. One thread per topic; categories Bug, Map correction, Idea, Question. Capture city, mode, Fire/EMS, version from game state where available; permit editing context on creation. Player sees only own threads and developer replies. Developer sees all threads, can filter/search loaded results, set status/priority, add private notes, and reply. Unread indicators update from database counters. Mobile dialog stays within viewport; keyboard focus is trapped by native dialog. Game keyboard/pointer input is blocked while dialog is open.

Messages are plain text, bounded, immutable, and acknowledged only after server success. Creation/replies atomically update the thread and message with server timestamps. Ownership/roles/read counters cannot be forged. Pagination exposes older threads/messages. Failed drafts remain retryable; reuse message IDs to avoid duplicate submissions after ambiguous failures. No screenshots, bulk responses, or external notifications in this first release.

## Identity boundaries
Creating a new account links the current guest identity and keeps its history. Signing into an already-existing account opens that account's inbox; it does not transfer a shared browser's guest conversations into another account. Developer role can only be assigned by a trusted Admin SDK script, never browser flags or public passwords. Password reset is available on explicit request.

## Release
Increment canonical version from 1.6.132 by 0.0.1, reconcile with main before delivery. Verify rules using a real Firestore emulator and auth/UI flows using Firebase emulators and desktop/mobile browser tests. Publish no working-chat claim without live configuration and an end-to-end live check. If Firebase deployment access is unavailable, deliver the complete tested code as a draft pull request with exact activation instructions.
