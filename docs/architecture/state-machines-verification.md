# State lifecycle verification — v1.6.202

Date: 2026-11-10. Baseline: `094b465931dd7174b8cf75621b28637e3f33f7c0` (v1.6.201).

| Check | Observed result |
| --- | --- |
| Baseline `node --test tests/*.test.cjs tests/*.test.mjs` | 1,564 passed, 0 failed after installing repository test dependencies. The initial attempt without those dependencies had missing jsdom/express/SDK errors; no product assertion failure was established by that attempt. |
| New multiplayer regression file before fixes | 7 failed, 2 passed; failures covered duplicated initialization, cancellation, replacement ownership, and disposal. |
| New feedback UI cases before fixes | Four failing ownership assertions: newer draft cleared, edited-back draft cleared, retired error displayed, and stale status rollback. Unchanged retry identity already passed. |
| Additional pagination and reply cases from independent review, before fixes | Both stale-error regressions failed; current-conversation error controls passed. |
| New account refresh cases before fixes | Two stale-failure cases failed; current failure and stale success controls passed. |
| New restored HUD case before fix | Failed: no refresh interval after cached page restore. |
| Feedback service cache identity before normalization change | Failed: dated service import differed from the canonical build. |
| Final `node --test tests/*.test.cjs tests/*.test.mjs` | 1,591 passed, 0 failed, 0 skipped. Includes real local Colyseus SDK/server tests and DOM integration. |
| Final `node --test tools/test_city_editor_*.mjs` | 71 passed, 0 failed, 0 skipped. |
| `node tools/check-state-inventory.mjs` | 152 unique groups, 83 implicit / 59 mixed / 10 explicit; validated anchors in 119 source files and related-test paths. Does not prove semantic exhaustiveness. |
| `node scripts/normalize-release.cjs` and release tests | Canonical v1.6.202, including feedback service import. |
| `node tools/export-multiplayer-world.mjs` then world-data diff | No world-data changes. World `6a591732d8f63f37a15c7a93`, road pack `4ac89570c75e0922fd6e`. |
| `git diff --check` | Passed. |
| Whole-change independent code review | Completed: no unresolved introduced defect or blocking finding. Two additional preexisting feedback error races were reproduced and fixed; an obsolete inventory event was corrected. Reviewer independently checked all source line hints and Markdown IDs, plus 20 feedback workflow tests. |
| Local Playwright/Chromium | Attempted; launch failed at required socket creation with `Operation not permitted`. No browser rendering assertions ran. |
| Separate cloud browser / local preview | Attempted; `net::ERR_CONNECTION_REFUSED` for local preview. |
| GitHub source parity | Runtime commit `8b8721dd3f3f33dd9e847cdffa3db050cffca48b` has tree `337aac1ebf1beed8ad39145d9116ddc38014afd1`, exactly matching the locally tested tree. |
| Remote browser QA and asset checks | The existing workflows were triggered for [PR #81](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/81/checks). Consult the check tied to the relevant commit for its outcome; this document does not treat a queued or running check as a pass. |
| Publication | PR #81 is a review branch. Main was unchanged at preparation time; no production deployment is claimed. |

The audit uses first-party source, deterministic asynchronous ordering and real DOM
handlers. It does not establish actual BFcache eligibility in every browser,
mobile touch/keyboard appearance, live Firebase/Render behavior, or a production
deployment. Those are separate verification boundaries.
