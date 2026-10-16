# Task 2 — City selection and visual corrections

Implemented in the local `codex/complete-quality-review` worktree; no commit, push, or deployment.

- Route Mapping now pins its URL to `city=peterborough` before the shared service/base/call loaders run, preserving other query parameters and the hash. It does not change the remembered city. Added a focused bootstrap regression.
- The training-use link is a compact “Training only” pill on Route Mapping and City Explorer. Its accessible label retains the full operational warning and it still links to the legal notice. Placement avoids the Route call card and moves to the open center lane during City Editor use.
- City Editor panels now reconcile on viewport resize. Desktop entry opens both; narrow entry opens neither; narrowing two open panels keeps the most recently opened one; narrow toggles keep panels mutually exclusive. Added behavioral assertions for panel-state reconciliation and resize wiring.
- Driving instructions are raised clear of the centered current-street HUD. Long landscape Geo call/review panels have more readable spacing and an internally scrollable viewport while leaving the crosshair/playfield clear.
- The editor release test now validates local stylesheet/script references and their active versioned cache token; the stale `city-editor-20260925` expectations were removed.

Verification: panel regression was first run red for the absent reconciliation helper, then green. `node tools/test_city_editor_interactions.mjs` passed; `node tools/test_city_editor_release.mjs` passed with 56 local modules checked; 25 focused Route Mapping, gesture, route-quality and mode-quality tests passed; syntax checks for `shared/build-version.js` and `city-explorer/editor/city-editor.js` passed. Actual Chromium layout/interaction verification remains with the parent integration pass.
