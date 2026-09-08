# Performance Baseline

Updated: 2026-09-08

## Status
A current measured browser-rendering baseline is **not yet established**. Do not convert configured budgets or CI execution time into claimed FPS/GPU performance.

## Reliability baseline established before visual capture
- Production version: **v1.6.39**
- Production-code commit: `eecace29927d71776bc3380aaec855fc39ffdac3`
- GitHub Pages run: `34290047215`
- Pages regression gate: **69/69 tests passed**
- Deployment: **success**

This proves the shared simulator/gameplay regression gate is green before the Station 1 visual baseline. It is not a substitute for browser/GPU measurement.

## Current renderer configuration
- Three.js: 0.180.0, vendored locally.
- Renderer: WebGL, `powerPreference: high-performance`.
- Full-profile pixel ratio cap: 1.65× DPR.
- Low-power pixel ratio cap: 1.2×.
- Full profile: antialiasing on, PCF soft shadows on, 2048×2048 directional shadow map.
- Low-power profile triggers on `?lite=1`, viewport width <760 px, reported device memory <=4 GB, or hardware concurrency <=4.
- ACES Filmic tone mapping; sRGB output.
- Batching/instancing and spatial tile culling are already used for major city systems.

## Captured-detail budgets
Configured visible-splat budgets (not measured usage):
- Desktop: 2,200,000
- Medium: 1,400,000
- Mobile/low-power: 750,000
- Maximum simultaneous desktop pilots: 2

No approved splat asset is installed. Phase 1 measurements benchmark the mesh city only.

## Geometry/data scale relevant to the baseline
- Prepared city bounds: west -78.405, east -78.245, south 44.245, north 44.385.
- Selected City Basedata building detail: 5,325 features, compared against 30,568 OSM footprints.
- City eMaps packaged features: 4,326.
- City road-surface package: 18,862 features.
- Latest public-road validation: 2,775 public OSM roads checked; 5,957 rendered drivable OSM features reported.

## Remaining Phase 1 benchmark protocol
Use the exact v1.6.39 commit above and capture both **desktop/full** and **forced low-power (`?lite=1`)** profiles on the same machine where possible.

For each profile record:
1. browser + version;
2. OS and GPU/device class;
3. viewport and DPR;
4. cold-load time to ready/loading-screen dismissal;
5. 30-second median FPS at `S1-PLAYER-SPAWN`;
6. 30-second 1% low FPS if readily available;
7. renderer memory/program/draw-call statistics if readily available;
8. whether shadows/AA were enabled;
9. visible feature/object counters exposed by the HUD;
10. any long task, stall, black frame or context-loss event.

Do not build an elaborate benchmark harness unless existing HUD/browser tooling cannot provide the comparison. The purpose is regression detection.

## Acceptance rule
A visual change that materially lowers performance must be optimized or explicitly accepted with a measured new baseline. Compare commit-to-commit using the same named view, machine and quality profile.
