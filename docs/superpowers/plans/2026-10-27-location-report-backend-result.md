# Location-report backend result — 27 October 2026

Implemented in the isolated `feat/location-circle-reports` worktree from `5843c37b4e50f48b6d24a37785b338a03d7b50d1`. This change stores private suggestions for review; it never changes a live location, target circle or scoring decision.

## Contract

`feedback/location-report.mjs` exports `normalizeLocationReport`, `locationReportIdentity` and `locationReportGroupKey`. The schema is version 1, kind `geo-location`, with reasons `point`, `radius`, `address`, `name`, `scoring` or `other`. It retains the agreed immutable `snapshot` and optional `suggestion` shapes. Normalization returns an independent, deeply frozen object, without mutating the caller's original snapshot.

- Original and suggested centres require finite numeric Earth coordinates. Original radius is positive and at most 20,000 metres; a suggested radius is 5–2,000 metres inclusive. Centre-only, radius-only, combined and null suggestions are supported; an empty suggestion is rejected.
- IDs are bounded at 160 characters, city/version at 80, dataset ID at 240, name at 200 and address at 300. Displayed name/address may be empty strings because missing text is reportable. Cross streets are null or an array of up to four separate strings of at most 150 characters each. Optional captured fields normalize to explicit nulls.
- A guess and its numeric distance are supplied together or both null. Distances are bounded at 0–40,100,000 metres. Reported result/distance contradictions are retained as evidence, not silently corrected or rejected for disagreeing with the scoring threshold.
- The strict structured schema contains no browser/GPS/screenshot/timestamp fields. Root's bounded browser/context text can accompany the first message without changing the snapshot schema.

`normalizeNewThread` preserves this optional report and derives city/mode/department/version from its snapshot. Legacy threads retain their original normalized shape.

## Persistence, authorization and retry

`sendLocationReport({threadId, messageId, report, note = ''})` uses the existing atomic send path. An empty note receives neutral, valid first-message text. Thread title falls back from name to address to stable call ID when displayed labels are empty.

`feedback/firestore.rules` accepts the optional report on creation, checks bounded nested context and parent/snapshot consistency, and rejects extra or missing fields. Existing update allowlists prohibit changing or adding the report afterward, for both owner and developer. Original and suggested circles therefore remain immutable. Owner/developer replies, read counters, status/priority and developer-only notes retain their existing behavior. Anonymous Firebase users own their threads by UID; only the trusted `feedbackAdmin` claim grants developer access. The one-second server-side writer cooldown and matching atomic first-message/counter/timestamp requirements remain in force.

A retry with the same thread/message IDs, normalized report and normalized first-message body acknowledges the existing submission without incrementing counters or creating another message. Reusing an ID with a changed suggestion, snapshot or note is rejected. Reusing an existing report thread with a different message ID is also rejected by the structured submission path; ordinary `send()` replies remain supported. The UI must freeze its appended context text with the submission, including any opened-at timestamp, so a retry is identical.

Grouping is a developer-side hint derived from reason, city/service/mode, version/dataset revision, call ID, original displayed location identity and original circle. Individual result IDs, guesses and suggestions do not split a group. Each private thread remains independent; the backend neither merges owners nor discards reports.

## Verification

TDD evidence was retained before implementation: initial normalization dropped the report; the validation expansion produced 25 expected failures; old rules rejected valid reports and the service method was absent; the blank-label and title fallback regressions were observed failing. The real emulator additionally caught the 1,000-expression rule budget, including the largest valid optional context. The validator now fits that budget while preserving strict shape/bounds, and the worst-case acceptance regression is retained.

Final checks:

| Command | Observed result | Log |
|---|---|---|
| `node --test tests/location-report-model.test.mjs tests/feedback-model.test.mjs` | 36 passed, 0 failed | `test-artifacts/location-report-backend/model-final.log` |
| `node --test tests/*.test.cjs tests/*.test.mjs` | 740 passed, 0 failed in the integrated worktree | `test-artifacts/location-report-backend/full-node.log` |
| `npm --prefix tools/feedback-tests run test:rules` | 19 passed, 0 failed | `test-artifacts/location-report-backend/rules-final.log` |
| `git diff --check` on owned files | Passed | Final commit preparation |

The rules run uses real local Auth/Firestore emulators and a real Firebase SDK service path under Node; only browser CDN module specifiers are adapted to the identical installed SDK package. It verifies anonymous submission, owner/admin privacy, immutable circles, malformed/missing-field rejection, maximum valid context, blank displayed text, revealed questions, cooldown, ordinary replies and full-payload retry conflicts. No browser automation was run by this backend task.

Development dependencies were installed into ignored local `node_modules` without changing manifests or adding a lockfile. `npm ci` was unavailable because the existing development-tools package has no lockfile; `npm install --no-package-lock` was used. Java 17 and the pinned emulator CLI were used. Installation emitted legacy dependency/Node-engine warnings, but the actual emulator commands completed successfully.

## Limits

Rules validate authorization, bounded shape, immutability and atomic writes; the supplied game context remains client-reported evidence, not a trusted catalog verification. Per-UID throttling does not stop creation of multiple guest identities. Production feedback remains disabled/unconfigured in this branch until the separate activation workflow is completed. No Firebase production deployment, production account operation, backend configuration activation, source dataset change or automatic location/radius update occurred. Root owns UI/native-browser verification, release/version changes and final deployment decisions.
