# Astra Execution Packet

## Phase
**1A — Station 1 Reproducible Baseline Capture (render/measure only)**

## Repository
`https://github.com/edmondsonedits/Peterborough-Map-Game`

## Exact expected base
- Branch: `main`
- Commit: `eecace29927d71776bc3380aaec855fc39ffdac3`
- Production version: **v1.6.39**
- Deployed City Explorer: `https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/`

Regular ChatGPT has already completed repository review, reference-system review and CI preflight. GitHub Pages run `34290047215` passed all **69/69 regression tests** and deployed successfully. Do not repeat that work unless the local checkout conflicts with the commit above.

## Objective
Produce the visual/performance evidence that cannot be truthfully produced from a text-only repository review:
1. six reproducible Station 1 renders;
2. real browser/GPU measurements for full and forced-lite quality;
3. a compact factual execution receipt.

Do **not** redesign Peterborough, perform broad research, optimize unrelated code, grade your own renders or rewrite project-management docs.

## Startup
1. Sync `main`.
2. Confirm HEAD is `eecace29927d71776bc3380aaec855fc39ffdac3` or a later documentation-only `docs/astra/` commit whose production files are identical.
3. Run `git status --short`; begin only from a clean tree.
4. Read applicable repository instructions/AGENTS if present.
5. Read only:
   - `docs/astra/PROJECT-CHARTER.md`
   - `docs/astra/PROJECT-STATE.md`
   - `docs/astra/VISUAL-QA.md`
   - `docs/astra/PERFORMANCE-BASELINE.md`
   - `city-explorer/README.md`
   - `city-explorer/SEMANTIC-SURVEY-WORKFLOW.md`
   - `city-explorer/data/survey/station-one-survey.geojson`
6. Open other code only as needed to operate/capture the existing scene.

## Preserve
- GIS/geospatial truth remains authoritative.
- Visual assets do not own collision/navigation.
- Existing mesh city remains fallback.
- Three.js/browser remains the runtime target.
- No unlicensed capture/texture assets.
- No gameplay changes.

## Required named views
Use the same commit and daylight theme unless survey overlay is required.

1. `S1-AERIAL-NORTH` — elevated north-up/near-orthographic context showing Station 1, yard, adjacent roads and stable tree pattern.
2. `S1-APPARATUS-FRONT` — street-level view normal to the four apparatus bays.
3. `S1-PUBLIC-ENTRY` — three-quarter/street-level view showing office facade, projecting entry, planting bed and flagpole.
4. `S1-YARD-CONTEXT` — oblique view showing apron/yard relationship to road and neighbouring parcels.
5. `S1-PLAYER-SPAWN` — normal gameplay camera at the Station 1 starting position.
6. `S1-SURVEY-OVERLAY` — developer survey mode with Ontario 2023 orthophoto visible for alignment diagnosis.

For every view save the image and record:
- exact commit SHA;
- viewport width/height;
- camera geographic position or world XYZ;
- AGL/altitude;
- heading/yaw;
- pitch;
- camera FOV;
- quality profile;
- time/lighting theme;
- debug/reference mode.

If fixed camera presets do not exist, record reproducible metadata rather than adding a large camera system.

## Performance measurement
No approved splat asset is installed; measure the mesh city.

### Full profile
At `S1-PLAYER-SPAWN`, record:
- browser/version, OS, GPU/device class;
- viewport/DPR;
- cold-load time to ready;
- 30-second median FPS;
- 1% low FPS if readily available;
- readily available renderer memory/program/draw-call stats;
- HUD feature/object count;
- any stall, black frame, context loss or loading failure.

### Forced low-power
Repeat on the same machine using `?lite=1`, keeping the view and viewport as similar as practical.

Do not build elaborate benchmarking infrastructure unless the existing HUD/browser tooling cannot provide a useful comparison.

## Code-change rule
**No production code change is expected.** If capture is impossible because of a genuine bug, stop and report the blocker rather than using Astra credits on an unrelated fix. Regular ChatGPT will handle code changes first where possible.

## End-of-session receipt
Return only:

BASE COMMIT:
FINAL COMMIT:
BRANCH:
PRODUCTION VERSION:

CAPTURED VIEWS:
- name -> exact path + camera metadata

PERFORMANCE — FULL:

PERFORMANCE — LITE:

VERIFIED:

BLOCKERS / UNCERTAINTIES:

FINAL `git status --short`:

UNCOMMITTED / UNPUBLISHED WORK:

Stop after the receipt. Do not begin Phase 1B.
