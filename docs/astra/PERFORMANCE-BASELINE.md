# Performance Baseline

Updated: 2026-09-08

## Status
A current measured browser-performance baseline is **not yet established**. Do not convert configured budgets into claimed FPS or memory performance.

## Current renderer configuration
From the deployed City Explorer code:
- Three.js: 0.180.0, vendored locally.
- Renderer: WebGL, `powerPreference: high-performance`.
- Full-profile pixel ratio cap: 1.65× device pixel ratio.
- Low-power pixel ratio cap: 1.2×.
- Full profile: antialiasing on, PCF soft shadows on, 2048×2048 directional shadow map.
- Low-power profile triggers on forced `?lite=1`, viewport width <760 px, reported device memory <=4 GB, or hardware concurrency <=4.
- ACES Filmic tone mapping; sRGB output.
- Batching/instancing and spatial tile culling are already used for major city systems.

## Captured-detail budgets
Configured visible-splat budgets (not measured usage):
- Desktop: 2,200,000
- Medium: 1,400,000
- Mobile/low-power: 750,000
- Maximum simultaneous desktop pilots: 2

No approved splat asset is currently installed, so present production measurements should first benchmark the mesh city alone.

## Geometry/data validation relevant to performance/reliability
- Full prepared city extent: west -78.405, east -78.245, south 44.245, north 44.385.
- City Basedata building detail layer: 5,325 selected official building features, compared against 30,568 OSM footprints.
- City eMaps packaged features: 4,326.
- City road-surface package: 18,862 features across streets, curbs, parking, road surfaces and bridges.
- Public-road ORN validation: 2,775 public OSM roads checked; 5,957 rendered drivable OSM features reported in the latest validation.

## Phase 1 benchmark protocol
Capture both **desktop/full** and **forced low-power (`?lite=1`)** profiles on the same machine where possible.

For each profile record:
1. browser + version;
2. OS and GPU/device class;
3. viewport and DPR;
4. cold-load time to loading-screen dismissal/ready state;
5. 30-second median FPS at S1-PLAYER-SPAWN;
6. 30-second 1% low FPS if tooling allows;
7. renderer memory/program/draw-call statistics if readily available;
8. whether shadows/AA were enabled;
9. visible feature/object counters already exposed by the HUD;
10. any long task, stall, black frame or context-loss event.

Do not spend Astra time on an elaborate benchmarking harness unless the existing HUD/browser tooling cannot supply a useful comparison. The purpose is regression detection, not a synthetic benchmark score.

## Acceptance rule
A visual change that materially lowers performance must either be optimized before release or accompanied by a measured, explicitly accepted new baseline. Performance measurements are compared commit-to-commit using the same named view and device/profile.