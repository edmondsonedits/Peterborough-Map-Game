# Project State

Updated: 2026-09-08

## Current phase
**Phase 1 — Station 1 named-view fidelity baseline**

The geospatial city foundation already exists. Regular ChatGPT has completed the repository/CI preflight. The remaining Phase 1A work is limited to reproducible Station 1 renders and real browser/GPU measurements, followed by an independent resemblance critique.

## Repository state
- Branch: `main`
- Current production-code HEAD: `eecace29927d71776bc3380aaec855fc39ffdac3`
- Repository production version: **v1.6.39**
- City Explorer UI/subsystem label: **v1.5.6**
- GitHub Pages deployment run: **34290047215 — success**
- Main live site: `https://edmondsonedits.github.io/Peterborough-Map-Game/`
- City Explorer: `https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/`

## ChatGPT preflight completed
- Inspected the current City Explorer architecture and existing Station 1 survey/reference package.
- Confirmed the Pages deployment gate runs the project regression suite before publishing.
- Found and corrected a runtime/test compatibility issue in the shared base-location store.
- Restored the v1.6.26 route-review wrapper as the canonical implementation while retaining the v1.6.39 dependency-bundle revision.
- Corrected EMS operational-access regressions introduced by the preceding location update: PRHC now uses a drivable arrival coordinate and the Clonsilla EMS operational yard again intersects the shipped road network.
- Full Pages regression gate now passes **69/69 tests** and v1.6.39 is deployed.

## Completed 3D foundation
- Browser-based Three.js 0.180.0 renderer with local vendoring.
- Full prepared Peterborough extent.
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
- Existing Station 1 and downtown screenshots under `city-explorer/screenshots/`.

## Verified geographic facts
- Road validation report dated 2026-09-01: PASS.
- Public OSM → ORN median centreline offset: 0.64 m; P95: 3.63 m; 98.43% within 10 m.
- ORN → public OSM median: 0.63 m; P95: 3.57 m.
- Official-name agreement: 95.22% across 2,638 comparable named segments.
- Station 1 source-aligned district inventory: 441 building footprints, 110 road-surface polygons, 294 curb sections and 99 mapped trees.
- Captured-detail manifest contains no licensed loadable production splat asset.

## Current visual quality
**Provisional:** geographic structure is stronger than close-range architectural fidelity. Station 1 has explicit reviewed facade roles/site detail, but a fresh current-build resemblance score cannot be claimed until the named renders are captured from the deployed/runtime scene.

## Current performance baseline
No trustworthy current browser FPS/load-time/GPU-memory baseline has been captured. Automated regression reliability is green, but CI test duration is not a rendering benchmark. See `PERFORMANCE-BASELINE.md`.

## Remaining Phase 1A blocker
Regular ChatGPT does not have a live interactive browser/GPU scene-control environment in this chat. The remaining work that genuinely merits Astra is therefore narrow:
1. capture the six fixed Station 1 named views with camera metadata;
2. measure full and forced-lite runtime performance on the same machine;
3. return the images/measurements without redesigning the scene.

## Reference uncertainty
- 2023 orthophoto is authoritative for that imagery date, not necessarily every 2026 site change.
- Street imagery can differ by date, season, lens/FOV and viewpoint.
- Temporary vehicles, people, construction, shadows and seasonal clutter are excluded from permanent city truth.
- Google/Street View may be consulted only for visual comparison under its terms; it is not a production texture/splat source.
