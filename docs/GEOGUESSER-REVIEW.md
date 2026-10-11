# Geo Guesser review preview

Status: publication authorized by the user on 2026-10-10; release v1.6.99 is being verified for GitHub Pages.

Source: development began at `f7895a6` and incorporated `origin/main` at `2caa037` before release on 2026-10-10. The work is isolated on `codex/geoguesser-station-loop`. Existing unpublished changes in other checkouts are not part of this release.

## Intended experience

Choose Peterborough Fire or EMS, then a starting station/base. Every location begins with the map centred close to that base. Read the location name and address, pan and zoom, and place the fixed centre crosshair inside the location's configured radius. Each check shows a clear Correct/Incorrect result, the actual target area and the submitted guess. A miss adds a measured connecting line; Try again returns to the submitted view with the same question. A correct answer briefly shows the result, then returns to the same base and loads a fresh location automatically. Continuous practice runs until the player ends it; timed modes remain available.

Use existing city-package stations and training locations, including their coordinates and target radii. The preview does not establish new surveyed building boundaries or certify training records as current.

## Quality scorecard

This is an engineering assessment for deciding when to offer the preview. The user's playtest determines whether it meets their 9/10 expectations. Each category earns its full weight only after the listed checks pass; partial credit must identify a remaining gap.

| Aspect | Weight | Acceptance evidence |
| --- | ---: | --- |
| Fire/EMS station selection | 2.0 | Three Fire stations and two EMS bases from the Peterborough package; each starts and resets at its own coordinates and close zoom; service-appropriate targets. |
| Correct location loop | 3.0 | Raw metre distance compared to configured radius; miss retries the same target; correct answer automatically loads another target at the selected base; no double submissions or stale transitions; no avoidable repeated targets. |
| Map interaction and presentation | 2.0 | Full map with fixed centre crosshair; pan/zoom, keyboard and visible touch controls; return-to-base action; task readable; attribution visible; no obstructed map centre or overlapping controls. |
| Learning and feedback | 1.5 | Clear instructions, supportive miss feedback, success feedback, optional assisted reveal, honest first-try/assisted statistics and session summary, replay. |
| Reliability and accessibility | 1.5 | Focused regression checks; browser checks on desktop, compact/mobile/landscape; visible focus and reduced-motion support; empty pools and blocked storage handled; exit/restart cancels transitions. |

Ready for user review: at least 9.0/10, all essential station/reset/accuracy/retry checks passing, and no known blocking gameplay defect. Unverified physical-device or data checks are recorded separately.

## Improvement loop

1. Play the current flow and run focused regression checks.
2. Record failures against the scorecard.
3. Fix the largest demonstrated gap within Geo Guesser's scope.
4. Re-run affected checks and inspect the rendered experience.
5. Repeat until the review threshold is supported, then provide the local play link and wait for the user's verdict.

The loop continues during development and subsequent requested revisions. It does not publish or run a background schedule. GitHub publication requires the user's separate instruction after their playtest.

## Iterations and evidence

- Baseline: current code offers three Fire stations, has no EMS selection, begins at zoom 15, reveals the answer after every submission, and advances after misses. Every target requires a dispatch-start card and a next-call action. These behaviors do not meet the requested continuous success/retry loop.
- Baseline regression check: 16 passed, 0 failed across `geo-map-policy`, `critical-gameplay`, and `desktop-keyboard`.
- Iteration 1: added the service/base selector, uninterrupted practice deck, exact-radius answers, same-question retries, automatic success/reset, optional assisted reveal, session statistics and summary. Five helper tests cover accuracy boundaries, pool selection, deck cycling, duplicate submissions and cancellation.
- Iteration 2: browser play exposed selector styling and compact-screen control overlap. Fixed the cascade, selected states and mobile/landscape controls. Disabled map inertia and animated station resets so the released crosshair and the next question's starting view remain stable. Fixed an exit-before-start race, with a failing-then-passing regression.
- Iteration 3: the mobile wrapper exposed an initial iframe loading race. The shared Geo Guesser readiness bridge now ignores the initial blank document, duplicate installs and obsolete document results. Three regression tests failed before this repair and passed afterwards. Scoped legacy wrapper styles to preserve the new practice layout.
- Iteration 4, user feedback: added a prominent Correct/Incorrect panel, labeled actual target area and submitted guess, and a measured dashed line for misses. The panel reports distance to the target and distance outside its radius. Try Again restores the submitted view without counting another miss. Correct results remain visible for 2.5 seconds before the next station start. Returning to the station restores the normal practice controls.
- Result framing: browser play exposed excessive padding on short landscape screens, which made Leaflet zoom past both endpoints. Deferred framing now uses the final control layout, refreshes the map dimensions, preserves a positive fitting area, and cancels obsolete frames. Regression checks reproduce the short-screen failure and stale-frame case.
- Latest focused verification: **44 passed, 0 failed** across `geo-map-policy`, `critical-gameplay`, `desktop-keyboard`, `geo-station-practice`, `geo-station-integration`, `geo-station-flow`, `geo-wrapper-readiness` and `analytics-bootstrap`. These include JavaScript parsing. `git diff --check` passed. Integration and full-script flow tests use DOM/Leaflet fakes with the real practice helper; they are synthetic evidence, separate from browser play.
- Release verification: **189 passed, 0 failed** across all `tests/*.test.cjs` and `tests/*.test.mjs` after incorporating the upstream menu-test correction and normalizing v1.6.99. Release JavaScript syntax checks passed.
- Browser play: verified Fire and EMS selectors, close station starts, same-target miss feedback, assisted reveal/continue, finish/summary, desktop and mobile wrappers, and the online wrapper's map readiness. Checked 1280×720, 390×844, 320×568 and 844×390 layouts. A real first-try answer at Real Canadian Superstore was confirmed using map zoom/drag and Enter; the next location appeared automatically at Fire Station 1. Also verified the existing Random Shift's dispatch, timer, answer review and next-call flow.
- Feedback revision browser checks: verified labeled endpoints and distance line on desktop, compact portrait and landscape, plus the EMS mobile wrapper. Both landscape endpoint labels were checked against the visible result panel and Try Again button bounds. A correct answer at Chemong/Towerhill displayed a 15.4 m result before automatically returning to the same station. Saved screenshots are in `artifacts/visual-qa/geoguesser/feedback-distance.jpg`, `feedback-mobile.jpg` and `feedback-landscape.jpg`.
- Final bounded review: no actionable material defects found in the practice state machine, station adapter or iframe readiness repair.

### Provisional engineering assessment: 9.2/10

| Aspect | Earned | Remaining evidence |
| --- | ---: | --- |
| Fire/EMS station selection | 2.0/2.0 | Five package bases covered by synthetic integration; both services played in the browser. |
| Correct location loop | 3.0/3.0 | Essential accuracy, retry, reset and cancellation checks pass; successful automatic advance observed in browser play. |
| Map interaction and presentation | 1.8/2.0 | Responsive browser layouts pass; physical phone gestures and the user's preferred visual feel remain to be assessed. |
| Learning and feedback | 1.3/1.5 | Feedback, assisted learning and honest statistics checked; recruit/user playtest still needed. |
| Reliability and accessibility | 1.1/1.5 | Focused tests and keyboard/focus checks pass; physical-device, assistive-technology and online scoreboard verification remain open. |

This supports the engineering review threshold. It is not the user's 9/10 approval, a production certification, or a live-release claim. Continue the improvement loop against issues reported in the user's playtest.

### Known limits and release follow-up

- The configured location radii are existing training tolerances, not surveyed building footprints. No fresh audit of business/address accuracy was performed.
- Online scoreboard writes and a physical phone were not verified. Continuous practice does not require an online score submission.
- One mobile-wrapper load did not load Leaflet and prevented station start. The local Leaflet and practice stylesheet URLs returned HTTP 200; a fresh reload restored station start and the new feedback. The intermittent initial asset failure has not been isolated. An inherited missing analytics asset also produced a warning. These observations should be checked before publication.
- Release v1.6.99 applies the existing release normalizer to align the canonical cache references across entry points. The new practice regression tests are included in the Pages deployment gate.
- The user authorized GitHub publication after reviewing the preview. Deployment status will be checked against the exact published commit before reporting it live.

## Play locally

Run `node tools/serve-preview.cjs 4180` from this checkout. Open [the Geo Guesser preview](http://127.0.0.1:4180/geo-guesser/). The server binds to this computer only.
