# Project State

Updated: 2026-09-08

## Current phase
**Phase 1 — Station 1 named-view fidelity baseline**

The geospatial city foundation already exists. The immediate goal is to establish repeatable Station 1 reference/render views, measure the current runtime, run an independent fresh-context resemblance critique, then fix the highest-value P0/P1 mismatches before expanding to another district.

## Repository state
- Branch: `main`
- Baseline HEAD before this state-system commit: `62bdd24d077c74758ad8042a218cb90f3d43032b`
- Repository production version: **v1.6.38**
- City Explorer UI/subsystem label: **v1.5.6**
- Pages workflow deploys every push to `main` after gameplay regression tests.
- Main live site: `https://edmondsonedits.github.io/Peterborough-Map-Game/`
- City Explorer: `https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/`

## Completed foundation
- Browser-based Three.js 0.180.0 city renderer with local vendoring.
- Full prepared Peterborough extent rather than a downtown-only map.
- Ontario 2025 lidar-derived DTM as primary bare-earth terrain.
- OSM roads/buildings/land use plus City of Peterborough eMaps and Basedata layers.
- Official road-surface, curb/edge, parking and bridge geometry.
- Ontario Road Network validation pipeline.
- Terrain-fitted roads, buildings, parks, paths, rail, water and municipal detail.
- Batching/instancing, low-power rendering profile, map mode and fly/play controls.
- Downtown–Little Lake bounded hero-quality presentation layer.
- Optional Spark 2.1.0 captured-detail integration with complete mesh fallback.
- Five splat pilot anchors configured; zero approved production captures installed.
- Developer reference mode and semantic-survey workflow.
- Station 1 10× accuracy district with calibrated Ontario 2023 orthophoto.
- Station 1 reviewed semantic records for footprint/facades, planting bed, flagpole and trees.
- Existing Station 1 and downtown screenshots stored under `city-explorer/screenshots/`.

## Verified facts
- Road validation report dated 2026-09-01: PASS.
- Public OSM → ORN median centreline offset: 0.64 m; P95: 3.63 m; 98.43% within 10 m.
- ORN → public OSM median: 0.63 m; P95: 3.57 m.
- Official-name agreement: 95.22% across 2,638 comparable named segments.
- Station 1 source-aligned district inventory contains 441 building footprints, 110 road-surface polygons, 294 curb sections and 99 mapped trees.
- Captured-detail manifest contains no licensed loadable production splat asset.

## Current visual quality
**Provisional:** geographic structure is substantially stronger than visual/architectural fidelity. The city uses accurate data, procedural materials, procedural/simple roofs and selected authored landmarks, but many close-range facades remain generalized. Station 1 is the first site with explicit reviewed facade roles and site detail. A new independent pixel-level resemblance score has not yet been produced for the current deployed build.

## Current performance baseline
No trustworthy current FPS/load-time/memory benchmark was found in repository state. Runtime budgets and rendering profiles exist, but measurements must be captured in Phase 1 before claiming a baseline. See `PERFORMANCE-BASELINE.md`.

## Unresolved bugs / risks
- Visual fidelity has not been systematically scored against named real-reference views.
- City Explorer subsystem label still reads v1.5.6 while the repository production line is v1.6.38; treat these as separate version concepts until intentionally reconciled.
- Several roads in `ROAD-VALIDATION.md` require manual review; these are not assumed to be visual errors without checking source semantics.
- Mobile/low-power performance is protected by a lighter profile but lacks a current measured benchmark.
- Optional splat pilots cannot become production assets until rights/provenance are approved.

## Reference uncertainty
- 2023 orthophoto is authoritative for that imagery date, not necessarily every 2026 site change.
- Street-level reference imagery may differ by date, season, lens/FOV and viewpoint.
- Temporary vehicles, people, construction, shadows and seasonal clutter are excluded from permanent city truth.
- Google/Street View may be consulted only for visual comparison under its terms; it is not a production texture/splat source.