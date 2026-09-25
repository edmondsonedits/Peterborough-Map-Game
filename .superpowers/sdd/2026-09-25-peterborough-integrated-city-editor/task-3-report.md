# Task 3: Deterministic Generated-Asset Overrides

## Result

Implemented deterministic generated IDs and override application for individually addressable landmarks, trees, street lamps, traffic signals, buildings, and continuous road features. Buildings and roads remain batched for rendering: each feature keeps its merged vertex ranges and receives a non-rendered layer-31 bounding-box raycast proxy. Hiding collapses and restores only that feature's position ranges; color appearance edits only its per-vertex color ranges. Road records set `canTransform: false`.

The registry stores generated records on object metadata and on `cityEditorInstances` for instanced roots. IDs prefer source feature IDs; geometry-only IDs use versioned, sorted-key geometry strings rounded to six decimal places. Authored replacements receive deterministic IDs and `sourceTargetId` metadata. No terrain, player, vehicle, camera, labels, survey markers, or gameplay trigger groups are registered.

## Red/green evidence

1. Before adding `generated-registry.js`, `node tools/test_city_editor_overrides.mjs` exited 1 with `ERR_MODULE_NOT_FOUND` for `city-explorer/editor/generated-registry.js`, as the brief expected.
2. Before adding `feature-batch-binding.js`, the same test exited 1 with `ERR_MODULE_NOT_FOUND` for that helper.
3. Before routing registry overrides through feature bindings, the focused test failed at the assertion `generated overrides route through the exact feature batch binding` (actual target vertices remained `[10, 11, 12]`, expected `[0, 0, 0]`).
4. After implementation, `node tools/test_city_editor_overrides.mjs` passed with `Generated city asset IDs, overrides, and instance masking passed.` This covers creation-order-independent IDs, WGS84 rounding, source ID uniqueness, hide/restore, cloned material appearance, authored replacement and removal, per-instance masking, merged-range hiding, adjacent geometry preservation, color appearance, and attached rooftop-instance masking.

## Verification

Commands run from the assigned worktree:

```text
node tools/test_city_editor_overrides.mjs
Generated city asset IDs, overrides, and instance masking passed.

node tools/test_city_editor_scene_document.mjs
{"status":"pass","validationCases":16,"stableOrdering":true,"roundTrip":true}

node tools/test_city_editor_catalog.mjs
{"status":"pass","catalogueEntries":9,"geographicRoundTrip":true}

node tools/test_city_detail_rules.mjs
{"status":"pass","urbanCurbs":true,"cycleLaneSides":true,"ontarioLanePaint":true,"streetIntersections":1}

node tools/test_gameplay_systems.mjs
Gameplay systems: Station 1 georeference, character inputs, heavy-truck acceleration, braking, steering, and off-road limits passed.

node --check city-explorer/app.js
node --check city-explorer/editor/generated-registry.js
node --check city-explorer/editor/override-runtime.js
node --check city-explorer/editor/feature-batch-binding.js
All syntax checks exited 0 without output.

git diff --check
Exited 0. Git reported only the existing worktree's LF-to-CRLF normalization warning for city-explorer/app.js.
```

## Concerns

- Building and road proxy selection uses a lightweight axis-aligned box. The hidden/appearance ranges are exact, but ray hits can include nearby features for irregular buildings and winding roads.
- Batched and instanced appearance currently supports color tint (including mapping a material key to its color). Per-feature opacity and the full roughness/metalness behavior of arbitrary material keys are not representable by the current vertex-color binding, so those appearance fields do not change those targets.
- Road overrides affect the batched road ribbon/foundation. Separately rendered lane paint, junction and bridge details remain visible when their road target is hidden.

## Files

- `city-explorer/editor/generated-registry.js`
- `city-explorer/editor/override-runtime.js`
- `city-explorer/editor/feature-batch-binding.js`
- `city-explorer/app.js`
- `tools/test_city_editor_overrides.mjs`
- `.superpowers/sdd/2026-09-25-peterborough-integrated-city-editor/task-3-report.md`

## Commit

`8643e9cdb6a9ae686c1c46764c1800de7b626ae9` — `Add persistent generated asset overrides`
