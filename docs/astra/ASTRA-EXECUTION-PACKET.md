# Astra Execution Packet

## Phase
**1A — Station 1 Reproducible Baseline Capture**

## Repository
`https://github.com/edmondsonedits/Peterborough-Map-Game`

## Expected production-code base
`62bdd24d077c74758ad8042a218cb90f3d43032b` (v1.6.38)

Documentation-only `docs/astra/` commits may exist after that SHA. Before doing any production work, sync `main`, run `git status`, and compare the current tree against the expected code base. If files outside `docs/astra/` changed after that base unexpectedly, report the conflict before proceeding.

## Objective
Capture trustworthy current Station 1 visual/performance evidence. Do **not** redesign Peterborough, perform broad research, or grade your own renders.

The existing GIS city is authoritative and already contains Ontario lidar terrain, OSM/municipal geometry, Station 1 semantic survey data and a calibrated 2023 Ontario orthophoto.

## Read only what is needed
Always read applicable repository instructions first. Then read:
- `docs/astra/PROJECT-CHARTER.md`
- `docs/astra/PROJECT-STATE.md`
- `docs/astra/VISUAL-QA.md`
- `docs/astra/PERFORMANCE-BASELINE.md`
- `city-explorer/README.md`
- `city-explorer/SEMANTIC-SURVEY-WORKFLOW.md`
- `city-explorer/data/survey/station-one-survey.geojson`

Open other files only when needed to run/capture the existing scene.

## Preserve
- GIS/geospatial truth remains authoritative.
- Visual assets do not own collision/navigation.
- Existing mesh city remains fallback.
- Three.js/browser remains the runtime target.
- Do not create unlicensed capture/texture assets.
- Do not break existing gameplay.

## Required named views
Capture all from the same commit and daylight theme unless a view explicitly requires survey overlay:

1. `S1-AERIAL-NORTH` — elevated north-up or near-orthographic context showing Station 1, yard, adjacent roads and stable tree pattern.
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

If repeatable named camera presets already exist, use them. If they do not, prefer recording reproducible metadata without changing production code. Do not add a large camera system merely for this session.

## Performance baseline
Measure mesh-only City Explorer first; no approved splat asset currently exists.

On the same machine where practical capture:

### Full profile
- browser/version, OS, GPU/device class;
- viewport/DPR;
- cold load time to ready;
- 30-second median FPS at `S1-PLAYER-SPAWN`;
- 1% low FPS if readily available;
- readily available renderer memory/program/draw-call stats;
- any stall, black frame, context loss or loading failure.

### Forced low-power
Repeat using `?lite=1` with the same view and viewport where practical.

Do not build elaborate benchmarking infrastructure unless existing browser/HUD tooling is insufficient.

## Code-change rule
This phase should normally require **no production code change**. If a genuine blocker requires code modification, keep the change minimal, run relevant tests, increment production version exactly 0.0.1, and identify why the capture could not be completed without it.

## Do not do
- no broad Peterborough reference research;
- no new city-wide feature;
- no splat/capture generation;
- no visual beauty score;
- no self-authored resemblance verdict;
- no rewriting the five project-management documents;
- no starting Phase 1B.

## End-of-session receipt
Return only facts from the execution environment:

BASE CODE COMMIT:
FINAL COMMIT:
BRANCH:
PRODUCTION VERSION:
DEPLOYED VERSION/URL (if changed):

CHANGED FILES:

CAPTURED VIEWS:
- name -> exact file/path + camera metadata

VERIFIED:
- tests/actions actually performed

PERFORMANCE — FULL:

PERFORMANCE — LITE:

BLOCKERS / UNCERTAINTIES:

FINAL `git status --short`:

UNCOMMITTED / UNPUBLISHED WORK:

Do not speculate about the next phase. Stop after the receipt.