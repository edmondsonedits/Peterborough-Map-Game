# Editor-authored scene integration — v1.6.79

Task 2 adds the first simulator-owned consumer for scenes exported by the 3D Simulator Map Editor.

## Current beta behavior

- The layer is **off by default**. Add `?authored=1` to a City Explorer URL to enable it.
- `authored-scene-bootstrap.js` captures the City Explorer's existing `scene`, `project()` and `terrainHeightAtWorld()` interfaces through the already-created captured-detail layer. No second map projection or terrain engine is introduced.
- Initialization waits until gameplay has initialized and both the firefighter and pumper asset promises have settled.
- `authored-scene-runtime.js` validates handoff format v1 and editor scene schema v1, stable IDs, known asset IDs, Peterborough WGS84 bounds, transforms and surface modes.
- Terrain-relative objects are resampled against the simulator's rendered-terrain sampler. `absolute` objects use `heightOffsetM` as world Y, matching the editor production-loader contract.
- All editor objects live in a separate `authoredDetailGroup` owned by the simulator. They do not alter terrain, roads, GIS buildings, gameplay state or semantic-survey records.
- v1.6.79 renders intentionally neutral project-owned proxy geometry only. Production asset mapping is Task 3.
- Missing, corrupt, invalid or unsupported authored data clears only the authored group, publishes a `failed` diagnostic, and leaves the base simulator running.

## Diagnostics

`document.documentElement.dataset.authoredSceneStatus` is one of `disabled`, `loading`, `ready`, or `failed`.

`globalThis.__PTBO_AUTHORED_SCENE__` exposes:

- `status()` — current state, object count, child count and bridge status;
- `reload()` — dispose the current authored objects, refetch and rebuild;
- `dispose()` — remove/dispose only the authored layer.

## Reviewed Task 2 fixture

`data/authored/peterborough-details.handoff.json` contains one `generic-prop-marker` near Fire Station 1. It exists only to prove editor JSON → validation → WGS84 projection → rendered terrain → isolated Three.js group. Replace/expand it only with reviewed editor exports.

## Tests

- `node tools/test_authored_scene_runtime.mjs`
- `node tools/check-authored-scene.cjs http://127.0.0.1:4174` after starting a local server and installing Playwright.

The browser check verifies default-disabled behavior, a successful one-object load, reload without duplication, disposal, and fail-open handling for missing, corrupt and invalid scene documents.
