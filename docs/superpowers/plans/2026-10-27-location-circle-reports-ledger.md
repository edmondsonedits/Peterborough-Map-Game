# Execution ledger — 2026-10-27-location-circle-reports

- Baseline: isolated worktree /workspace/scratch/340d5a98e4dd/location-reports, branch feat/location-circle-reports, parent 5843c37; original feedback worktree unchanged.
- Baseline tests: node --test tests/*.test.cjs tests/*.test.mjs — 695 passed, 0 failed (location-baseline-tests.log in task scratch).
- Ruling: Geo Guesser result screens are the first integration because the approved discussion concerns their acceptance circles. The existing inbox remains available across modes; this does not claim all-mode structured capture.
- Ruling: suggestions use 5–2000 m radius limits and never update the live catalog. Original circles permit a larger bounded diagnostic range.
- Ruling: reuse the committed v1.6.133 private inbox as the foundation and increment this update to v1.6.134; main remains v1.6.132 until separately published.
- Ruling: Firebase is available but unconnected; existing recent suggestions are preserved rather than repeated. Build and test locally; leave delivery disabled until project activation is verified.
- Task 1: complete (backend/model/rules, commit ffc0f52).
- Task 2: complete (Geo capture, circle composer, private-thread details, root).
- Task 3: complete for implementation/review delivery; live activation is blocked as documented below.

## Verification

- Root final Node suite after first independent-review fixes: `node --test tests/*.test.cjs tests/*.test.mjs` — 746 passed, 0 failed, no skipped tests (2026-10-27). Local log: `test-artifacts/location-reports-final-node.log`.
- Backend agent real Auth/Firestore emulator suite: 19 passed, 0 failed. Root independently reran `npm run test:rules --prefix tools/feedback-tests`: 19 passed, 0 failed; emulator exited successfully and shut down. Local log: `test-artifacts/location-reports-final-rules.log`.
- Regression tests were run failing before fixes for real Leaflet initialization/undefined subdomains, numeric input draft retention, cross-realm snapshots, fresh guest receipt and stale inbox failures.
- Native desktop Chrome: independently moved proposed centre and edge, confirmed 60→128 m, reset to exact original 60 m, rejected radius 0; final edited centre/radius 125 and note survived close/reopen; local acknowledged send showed receipt and developer read-only comparison had no drag handles.
- Narrow CSS frame: 390×844 and 390×400; no horizontal overflow at 390×400, radius 150 editable and Send fully inside the short frame; local Send acknowledged. This is desktop Chrome inside a narrow iframe, not a physical phone or touch/virtual-keyboard test.
- Native fixture uses the production feedback UI and Leaflet with in-memory I/O and blank local tiles. A public street tile request was visibly rejected by its provider; no alternate external provider was substituted. Live street tiles/geographic picking and real production delivery remain unverified. Numeric editing still works when the map cannot load.
- Evidence: `docs/superpowers/evidence/location-circle-reports/` contains screenshots and final native journal. No real player messages or shared datasets were modified.

## Review follow-up

- Independent reviewer reproduced first-time guest creation leaving the UI in account view internally, suppressing a successful receipt. Root reproduced it with a failing full mountFeedback regression, then restores report view after the guarded auth await.
- Root reproduced an earlier inbox rejection replacing a newer report; added a failing regression and guards stale inbox errors with the existing request token.
- Both regressions pass. The reviewer also identified repeated-world longitude validation and an available catalog revision omitted from snapshots. Root reproduced both with failing tests, normalized Leaflet coordinates at placement/drag boundaries and captured the correct normal-call baseline revision. Separate care-home revisions remain unknown. Final independent review: no remaining Critical or Important findings; 51 focused feature/model tests pass and diff check is clean.

## Activation boundary

`feedback/config.mjs` remains disabled with empty Firebase project fields. The feature cannot deliver reports to the developer until a dedicated project is connected, Auth/Firestore rules and indexes are deployed, developer custom claim is set, and actual owner/developer delivery is verified. No production deployment or dataset corrections were performed. Suggestions remain proposed changes for developer review.

## Remaining minor follow-ups

- Very distant guesses can make the initial comparison bounds too broad; consider a circle-focused default with a separate guess-inclusive view.
- Panning to a repeated world and placing there now serializes valid canonical coordinates, but the canonical vector may be outside that repeated-world viewport; consider world-copy recentering.
- Scoring reports intentionally use the existing Bug category; other location reasons use Map correction. The design wording has been aligned with the implemented classification.

## Final checks

- `node scripts/normalize-release.cjs` — active artifact normalized to v1.6.134.
- Full Node suite — 746/746, zero failures/skips.
- Real Auth/Firestore emulator suite — 19/19, successful exit.
- Changed source syntax and `git diff --check` — clean.
- Main rechecked through GitHub and git remote: 19cf059746ab5241fdc5ebb236f1d20f4fc81c2b, unchanged.
- Only explicit feature/release/docs/test paths are staged; unrelated temporary geodata is excluded.

## Delivery

- Draft PR: https://github.com/edmondsonedits/Peterborough-Map-Game/pull/60 (open, mergeable, unmerged).
- Remote branch: `feat/location-circle-reports`; initial remote commit `4a839c133d59d5bd6c5164c9f8ffdad556ef10a6`. Its tree `2f7c6f1cfa19a11fd74dc1ae99878d2cb2e220da` exactly matched the locally tested implementation commit `aaf3f26`.
- Git HTTPS write authentication was unavailable, so the authenticated GitHub connector saved the identical tree as one commit atop main. The remote includes the required v1.6.133 foundation plus this v1.6.134 update. Local commit ancestry is retained; use the remote PR branch for future review work.
- This documentation-only delivery record is a follow-up to that implementation commit. The local preview server and test tab were closed. No work continues after the turn ends.
- To activate: connect the dedicated Firebase project; configure public browser fields; enable Auth; deploy only feedback rules/indexes; assign the verified developer custom claim; test real guest/owner/developer reporting and reply delivery; then enable feedback and publish after separate authorization.
