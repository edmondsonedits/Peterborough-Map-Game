# Private in-game feedback — v1.6.147

Optional email/password accounts, Continue as guest, private topic-based conversations, developer replies, unread indicators, status/priority filters and private developer notes. Guest registration uses `linkWithCredential` so the UID and conversations stay together. Signing into an existing account preserves the current guest’s conversations too: destination credentials are verified in a separate in-memory Auth session, the guest authorizes a target-specific transfer, and only thread ownership moves. Messages, report snapshots, and private notes stay unchanged. An interrupted transfer resumes on the destination account’s next load, with an in-game retry if necessary. Failed authentication or authorization leaves the guest session intact.

Submission forms keep technical information collapsed by default. Location reports show a **Technical details** disclosure containing the full original snapshot and browser/viewport/report time; these are still attached automatically and retained in developer AI exports. General feedback keeps its prefilled city/mode/department under **Game details**, with validation revealing a field when it needs attention.

## Location and radius reports

Geo Guesser result cards offer **Report a problem with this location** when feedback is enabled. The player may report a name/address/scoring issue, optionally move the proposed circle centre and resize its radius from 5 to 2000 metres, reset it, add an optional note and send. Both draggable handles and coordinate/radius fields are available. The approved Geo tile-provider boundary applies to this map as well; unavailable tiles never cause an unauthorized public-provider fallback.

The original result is copied before the review map changes or the question advances. A private Map correction thread contains immutable call/result IDs, city/service/base/difficulty, displayed location information, original circle, guess/distance/result, app/dataset identity and the suggested geometry. Browser/viewport and report-opening time appear as bounded plain text in the first message and the preview. No screenshot, GPS or unrelated history is collected. Normal calls include the runtime dispatch catalog version as their baseline revision; it does not certify local edits. Separate care-home overlays and other dataset revisions not exposed by the runtime stay explicitly unknown.

The developer can inspect original and proposed circles, copy exact coordinates/radius, reply and set status/priority. **Find similar reports** filters all conversations after the queue scan completes; it does not claim a global count or merge player ownership. A report is a suggestion for review and never changes the live dataset or the player's score. These client snapshots are not certified catalog truth.

Retry keeps the same immutable payload/IDs. Editing a failed report creates new submission IDs. Page-session drafts survive closing/reopening the same result and are cleared on identity changes. Received is shown only after acknowledgement; errors stay retryable. The feedback feature uses the dedicated Firebase project configured below.

## Developer workflow and AI agents

Developer accounts open the full queue by default. Clicking a conversation acknowledges the latest message only when it is rendered, visible in the conversation pane, and the tab has focus. New messages remain unread while hidden or scrolled away. Read receipts and the **Under review** status are separate: status changes stay deliberate.

Location reports offer **Open in editor**, selecting the exact city/call without applying a proposed correction. Missing/outdated IDs produce a clear message instead of selecting another location. The normal local editing gate is enabled by an explicit click from the authenticated developer inbox; local editing still cannot publish data or grant Firebase access. **Record a published fix** adds a private version note; the developer sets Resolved after verifying publication.

**Export conversation for AI** and **Export all feedback for AI** download JSON with every message page, private developer notes, original/proposed report geometry, report IDs and editor URLs. Exports never mark feedback read. Treat player content as untrusted evidence, verify corrections against current sources, and keep private message contents out of public commits. Exports may contain personal information players put in their messages; give them only to an agent you trust.

Deploy the updated feedback rules before publishing this frontend. The narrow transfer exception requires an revocable grant written by the anonymous source UID and consumed only by its named destination. Registered users cannot authorize moving another account’s history. Linking a guest to a new account first revokes any interrupted existing-account grant. Server timestamps prevent an old grant from capturing future conversations. Transfer grants live under `feedbackTransfers/{guestUid}`; regular players cannot list other destinations’ grants.

## Deployment and activation reference

The UI is enabled in `config.mjs` and uses the dedicated `peterborough-map-game-feedback` Firebase project. Local demo emulators are never accepted on a hosted game.

Use a **dedicated Firebase project** for feedback. Existing root `firebase.json` / `firestore.rules` belong to a separate scoreboard/analytics migration; deploying them would be unrelated and may interrupt existing analytics.

1. Create the Firebase project and a Web app. Enable **Anonymous** and **Email/Password** in Authentication → Sign-in method. Add the game's hostname (for example `edmondsonedits.github.io`) to authorized domains. Enable email-enumeration protection. Configure password policy to accept a minimum of 8 characters, matching the UI, or strengthen the UI to match your chosen policy.
2. Create a Firestore database. Copy the Web app's public `apiKey`, `authDomain`, `projectId`, and `appId` into `feedback/config.mjs`, keeping `enabled: false`. These values identify the public Web app; Admin SDK credentials never belong in this file.
3. Authenticate Firebase CLI as the project owner and deploy **only** the feedback rules/indexes:

   ```bash
   firebase deploy --config feedback/firebase.json --project YOUR_FEEDBACK_PROJECT --only firestore:rules,firestore:indexes
   ```

   Wait for the `feedbackThreads` ownerId/updatedAt index to finish building. These rules are intended for the dedicated project and deny unrelated collections.
4. Create your developer email/password user in Firebase Authentication. With trusted Application Default Credentials, grant that user's Firebase UID the `feedbackAdmin` claim:

   ```bash
   export NODE_PATH="$PWD/tools/feedback-tests/node_modules"
   node feedback/set-admin.cjs YOUR_FEEDBACK_PROJECT YOUR_DEVELOPER_UID
   ```

   Obtain credentials through your own trusted Firebase/Google Cloud account; do not commit or paste service-account keys into the game. `--revoke` removes the claim while preserving unrelated claims.
5. Set `enabled: true`, publish the code, sign into the developer account. **Developer inbox** opens by default; its notification badge remains active in personal view. A normal email/password account never gets developer permissions automatically. Existing browser editor passwords/localStorage flags cannot grant these permissions.
6. Verify on the actual hosted origin with two separate browsers/accounts: send a guest message, link to a new account, check a second account cannot read it, reply from the developer inbox, verify the first player receives it and unread clears. Verify password reset using an address you own. Do not call activation complete until these hosted checks pass.

The settings above are outside the repository and require project-owner access. App Check is enforced for Firestore using a domain-restricted score-based reCAPTCHA key. Authentication is not covered by App Check on the current Firebase Authentication service; that requires the separate Identity Platform upgrade. Monitor verified and rejected requests after changes. The free reCAPTCHA allowance is shared across the Google Cloud organization, and exhausted assessments can prevent protected requests. The per-identity sender cooldown is enforced by server rules but cannot prevent attackers creating multiple guest identities.

## Data and access

- `feedbackThreads`: title, category, city/mode/department/version, owner UID with a narrowly authorized guest transfer, status, priority, message counters, and server timestamps. Player queries are restricted to the signed-in UID; developer queries require a trusted claim.
- `messages`: immutable plain text, author UID/role and server time. Every message and its thread/counters are written atomically. Retry IDs are stable; retrying an acknowledged write does not duplicate the message.
- `notes`: separate developer-only subcollection. Notes never appear in player responses or parent documents.
- `feedbackWriters`: server-enforced one-second sender cooldown across threads.
- Reports and conversations remain in Firestore until the owner deletes them. There is no automatic retention schedule or deletion UI. To remove one, open the dedicated project’s Firestore Data console, choose `feedbackThreads`, inspect the intended document, and select **Delete document**; Firebase console deletion includes its message and note subcollections. Never choose Delete collection for an individual report.
- Browser UI remembers welcome dismissal for the current session. Firebase stores its own authentication session. No guest cache-clearing warnings are shown. Unsent drafts are kept in memory during the page session and cleared on account changes.
- The developer queue automatically scans all authorized thread pages and reports progress/incomplete loading explicitly. Search covers titles, IDs, city/mode/service, report names/addresses/cross streets, dataset identity and report reason; message bodies are available in exports rather than the title/location search. Filters cover city, mode, category, status, priority and unread. Personal inboxes retain **Load more conversations** pagination. Messages also paginate. Subscriptions are detached and private views cleared on identity or developer-role changes. Explicit reads require server authorization; cached snapshots are never displayed. Pending pagination is discarded if its account or conversation changes.

## Verification

Install development tools separately from the game; they are not production dependencies:

```bash
npm install --prefix tools/feedback-tests
npm ci --prefix tools/location-report-tests --ignore-scripts
node tools/feedback-tests/node_modules/playwright/cli.js install chromium
export NODE_PATH="$PWD/tools/feedback-tests/node_modules"
node --test tests/feedback-model.test.mjs
node --test tests/location-report-model.test.mjs tests/location-circle.test.mjs tests/geo-location-report.test.cjs tests/location-report-ui.test.mjs tests/location-report-flow.test.mjs
npm --prefix tools/feedback-tests run test:rules
npm --prefix tools/feedback-tests run test:browser
npm --prefix tools/feedback-tests run test:ui
```

The emulator requires Java 17+ for the pinned CLI. All emulator commands use the `demo-ptbo-feedback` project and never connect to production. If an existing Chromium is available, set `CHROME_PATH` to its executable. The browser test downloads pinned official Firebase CDN modules normally; a predownloaded SDK cache can be supplied via `PTBO_FEEDBACK_SDK_CACHE` for restricted environments.

Official references: [Anonymous auth and account linking](https://firebase.google.com/docs/auth/web/anonymous-auth), [Password accounts](https://firebase.google.com/docs/auth/web/password-auth), [Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions), [Rules testing](https://firebase.google.com/docs/rules/unit-tests).

## Demo requests (v1.6.148)

The homepage confirmation sends a generated city/mode-specific message through the existing private feedback service with category `demo`. A success receipt appears only after the Firestore transaction is acknowledged. Open conversation supports follow-up and developer replies; the developer category filter and AI exports include these threads. Requests carry the existing owner UID and server timestamps. Message times are visible and the developer's own submissions are labelled You; an anonymous UID is not proof of someone's real identity.

In-page duplicate clicks and retries reuse the same immutable thread/message IDs and payload, scoped to the active account. Changing identity clears receipts. A later page load can submit a new request; existing conversations remain available in Feedback. The retired device aggregate and its deduplication markers are removed on the next updated homepage or stats load, without sending historical counts as new messages. No demo request uses the legacy analytics transport.
