# Complete Quality Review Implementation Plan

> **For agentic workers:** Use the existing focused subagents for their bounded work, followed by independent review. Preserve concurrent edits and do not publish.

**Goal:** Resolve every actionable finding in the 15 October whole-repository review, including the additional HUD/layout backlog.

**Architecture:** Keep the static HTML wrappers, versioned loading graph, city data, scoring interfaces and service workflows. Repair the existing calculators, persistence identity and responsive layouts in place. Reuse the unpublished Geo focus fix already in this worktree.

**Tech Stack:** Browser JavaScript, Leaflet, Three.js, Node behavioral tests, Python terrain tests, Playwright browser QA.

**Spec:** `../whole-repo-review-20261015/FINAL-REVIEW.txt` from the workspace parent; the user's latest instruction authorizes fixing all reported findings. The user already selected task-scoped agents, autonomous reversible decisions and local completion when publication is not authorized.

## Constraints and acceptance

- Preserve authoritative data, coordinate contracts, geographic identities, attribution, Fire/EMS behavior and compatibility loaders.
- No new modes, dependency migrations, remote writes or publication.
- Route endpoint connections must respect directed road access; roundabouts imply one-way unless explicitly overridden. Fire response and EMS transport recommendations must remain usable.
- Completed history must survive reload/navigation without losing deduplication of the same mission.
- Plain Route Mapping URLs must select the same supported city for bases, calls and roads.
- Training notices, answer labels, editor panels and the 3D driving help must not cover relevant information or controls at desktop/narrow sizes.
- Geo keyboard focus must survive next/retry/base/finish/settings transitions. Long landscape call review remains readable while protecting the playfield.
- Draft recovery must distinguish unchanged from changed published content, including legacy null-revision documents.
- Release tests must validate the active versioned loader graph, not a retired cache literal.

## Review focus

- Opposite one-way direction and nearby disconnected/divided roads: no shortcut connectors; preserve valid same-segment routes.
- Same mission recorded twice versus two missions after reload: one row versus two rows.
- Stored unsupported city and explicit supported city: usable Route Mapping without unrelated city mutation.
- Resize/orientation change with both editor panels open: at most one narrow panel, reachable controls.
- Legacy drafts with no useful revision: never falsely label a changed publication as a matching base; preserve recover/export options.

## Task 1 Directed driving guidance and history

Owner: existing GPT-6.1 Sol High agent. Files: `response-simulator/route-reveal.js`, `response-simulator/training-history-1.6.45.js`, relevant tests under `tests/`.

- [x] Add failing behavioral tests from `reproduce-driving-findings.cjs`, plus legal same-segment routes, explicit one-way overrides and disconnected access.
- [x] Repair endpoint routing and roundabout direction without changing route-result consumers.
- [x] Give history completions stable deduplication within a document and unique identity across reloads; keep old stored rows readable.
- [x] Run targeted routing, EMS and history tests; report exact evidence and any tradeoff.

## Task 2 City selection and visual corrections

Owner: existing GPT-6 Luna High agent. Files: `route-mapping/index.html` and minimal bootstrap dependency if needed; `shared/build-version.js`; `route-mapping/styles.css`; `city-explorer/editor/city-editor.js` panel behavior; `city-explorer/styles.css`/`current-street-hud-1.6.77.css`; `geo-guesser/app.css`; `tools/test_city_editor_release.mjs`; narrowly relevant tests.

- [x] Reproduce plain-link stored-city startup and pin all Route Mapping data to Peterborough before its loaders run.
- [x] Make the training notice compact and safely positioned on Route Mapping and the city editor, retaining its full accessible explanation/link.
- [x] Reconcile editor panel states on resize and prevent simultaneous overlapping mobile panels; separate the 3D help strip and street HUD.
- [x] Improve long landscape Geo review readability; preserve existing Geo JavaScript focus/label fixes.
- [x] Replace obsolete release literals with current loading/cache-contract assertions.
- [x] Run targeted checks. Root owns shared CI changes and browser evidence.

## Task 3 Published-content draft identity

Owner: GPT-6.1 Sol High after Task 2 has released `city-editor.js`. Files: `city-explorer/editor/draft-store.js`, `city-explorer/editor/city-editor.js`, `city-explorer/app.js` and persistence/publication modules only as necessary, plus relevant `tools/test_city_editor_*.mjs` tests.

- [x] Add regression for an old draft and changed published document both carrying null revisions.
- [x] Bind recovery to stable published content identity; conservatively handle legacy envelopes and preserve existing export/recovery behavior.
- [x] Verify matching, mismatching, legacy, corrupted, unchanged and post-save cases.

## Task 4 Integration and acceptance

Owner: lead. Files: existing Geo fix/tests, CI regression wiring, browser harnesses and evidence documentation.

- [x] Preserve the existing Geo changes and verify their focused tests.
- [x] Add consequential new regression checks to the existing CI workflow without dropping gates.
- [x] Run the complete main/tool/Python suites, static checks, normalized release staging and `git diff --check` once the batch is integrated.
- [x] Exercise every affected mode in real Chromium; inspect desktop/narrow screenshots and error/retry paths. State emulation and synthetic setup limits.
- [x] Obtain a fixed-role deep_reviewer Sol Medium review of the integrated diff; resolve actionable findings and rerun affected checks.
- [x] Leave a reviewable local result, preview and concise completion report with release status.

## Progress

- Baseline: GitHub and worktree HEAD remain `5f37936489d9d0fa1e144fcb5fca19680c3b28ba`, v1.6.110. Audit: main tests 407/407, standalone tools 90/91 (known stale release assertion), Python 4/4; source unchanged.
- Worktree: existing isolated `repository-quality-audit`, now `codex/complete-quality-review`. Preserved Geo modifications and saved `../whole-repo-review-20261015/pre-fix-working.patch`.
- Authorization: proceed with the fixes and appropriate agents under the user's existing instructions; no repeated approval gate for routine implementation.

- Final acceptance: all reported findings and three independent-review follow-ups resolved; 540 automated checks and 19 distinct Chromium journeys passed. See docs/quality-review-2026-10-15.txt for evidence, fixtures and release limits. No publication.
