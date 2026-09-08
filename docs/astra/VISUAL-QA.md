# Visual QA

## Rubric
Independent critique scores resemblance, not cinematic quality. Severity: P0 geographic/structural; P1 major recognizability; P2 noticeable realism/material/detail; P3 polish.

## Current named-view evidence
Existing repository captures:
- `station-1-aerial-v1.5.6.jpg`
- `station-1-accuracy-v1.5.6.png`
- `station-1-player-view-v1.5.6.jpg`
- `station-1-semantic-survey-v1.5.6.jpg`
- `station-1-street-v1.5.6.jpg`
- `station-1-street-corrected-v1.5.6.png`
- `downtown-city-hall-v1.5.5.png`
- `downtown-core-overview-v1.5.5.png`
- `downtown-market-hall-george-st-v1.5.5.png`
- `central-district-10x-overlay-v1.5.6.png`

These prove that visual auditing has been attempted, but they are not a sufficient current baseline because the repository has advanced since those captures and their camera/FOV metadata is not recorded here.

## Phase 1 required Station 1 views
Produce a fresh set from one current commit, daylight first, with camera metadata recorded for every view:

1. **S1-AERIAL-NORTH** — elevated north-up/near-orthographic view showing Station 1 footprint, yard, adjacent roads and tree pattern.
2. **S1-APPARATUS-FRONT** — street-level view normal to the four-bay apparatus facade.
3. **S1-PUBLIC-ENTRY** — street-level/three-quarter view showing public-office facade, projecting entry, planting bed and flagpole.
4. **S1-YARD-CONTEXT** — oblique view showing apparatus apron/yard relationship to road geometry and neighbouring parcels.
5. **S1-PLAYER-SPAWN** — normal gameplay camera at the Station 1 starting position.
6. **S1-SURVEY-OVERLAY** — developer survey view with Ontario 2023 orthophoto overlay for alignment diagnosis.

For each render record: commit SHA, viewport resolution, camera lat/lon or world position, AGL/altitude, heading, pitch, FOV, time theme, quality profile and any active debug/reference mode.

## Current critic result
No fresh-context pixel-level critic score is claimed in this initialization. The connected GitHub text API exposes the image filenames/metadata but not decoded repository image pixels to the current reviewer. Once fresh renders are produced or attached to regular ChatGPT, run the independent A-rubric and append only the resulting actionable findings here.

## Known visual work orders before fresh scoring
These are evidence-based workflow needs, not guessed appearance defects:
- **P1 — Reproducibility:** named views lack durable camera/FOV metadata; create repeatable capture presets or a capture manifest before comparing iterations.
- **P1 — Current baseline:** existing Station 1 screenshots are tied to v1.5.6-era captures and must be refreshed from the current production code.
- **P1 — Close-range facade fidelity:** Station 1 has semantic facade roles, but the wider city remains largely procedural; do not expand the district until Station 1 proves the authored/reusable facade workflow.
- **P2 — Version clarity:** visual evidence should record both project production version and exact commit; do not rely on the City Explorer title string alone.
- **P2 — Reference comparability:** street-level references must record date/viewpoint/FOV confidence before geometry is changed to match them.

## Critic output format
Every finding must include: mismatch, severity, visual importance, confidence, error class (geometry/material/placement/reference/lighting/missing detail), and one concrete correction. Finish with the five highest-value corrections and whether a Peterborough-local viewer would recognize the exact place without HUD.