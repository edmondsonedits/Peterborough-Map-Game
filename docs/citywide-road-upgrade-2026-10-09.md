# Peterborough citywide roads — development checkpoint (2026-10-09)

## Goal

Make the **entire Peterborough street network** more faithful to surveyed municipal pavement and more comfortable to drive, without moving a published road centerline, replacing the Three.js renderer, changing dispatch gameplay, or overwriting the validated Station 1 treatment.

**Status:** Implemented and committed to isolated development branch. **Not released to `main`.** Browser/mobile testing and site deployment are outstanding.

## Why Sherbrooke looked better

Source inspection of `city-explorer/app.js` confirmed:
1. Station 1's official pavement triangle edges were capped at 8 metres, vs up to 36 m for city roads on desktop and 48 m on mobile.
2. The 240-metre Station 1 area had specialized pavement continuity and raised-curb/sidewalk alignment. The whole-city renderer did not apply these height matches.
3. The former mobile profile **skipped municipal road surfaces entirely**, substituting generalized OSM ribbons. The official City Basedata polygons are far better XY geometry for intersections, cul-de-sacs, turnouts and road widths.
4. Road driving posture used centre/front/rear/left/right surface points rather than actual four-wheel corners.
5. The pavement road batching path created an unnecessary all-white colour attribute equal in size to the position attribute.

The City road datasets have 2D polygons and curb lines plus separately sampled terrain/road height. They do **not** provide centimetre-accurate surveyed road/curb elevations. Adding triangles improves approximation to the existing heightfield, not surveying accuracy.

## Implemented this pass

| Area | Previous | Experimental branch |
|---|---|---|
| Desktop official road maximum triangle edge | 36 m | **24 m** |
| Desktop official bridge maximum edge | 36 m | **20 m** |
| Desktop official parking maximum edge | 42 m | **30 m** |
| Mobile official road maximum edge | Official asset disabled | **34 m** with municipal XY polygons |
| Mobile official bridge maximum edge | Official asset disabled | **30 m** |
| Mobile official parking maximum edge | Official asset disabled | **40 m** |
| Station 1 near-field maximum | 8 m | **8 m**, preserved |
| Curbs outside Station 1 | Fixed inferred height | Nearby rendered municipality road-face height where explicitly classified raised; unclassified cached curbs retain original inferred treatment |
| Official sidewalks outside Station 1 | Terrain offset | Align to nearby actual paved road faces where available; otherwise preserve terrain fallback |
| Truck road pitch/roll | Axial and lateral midpoints | Four wheel-corner samples, same number of per-frame surface queries |
| Road batch vertex colors | All-white 3-channel buffer | Removed, uses material color |
| Curb-type source | Not retained in export | Metadata-discovered optional `CURBTYPE` forwarded on future geospatial rebuilds |

**Critical backward compatibility:** The currently packaged official curb layer in the repo only includes `STATUS`. No claim is made that it already contains `CURBTYPE`. Therefore unknown classifications must not be taken as proof of flat edges or as proof of raised kerbs. Existing unclassified segments retain their approximate display; known flat edges are not rendered as concrete curbs. Do not force a City asset rebuild without first verifying the upstream field exists and the layer returns a complete result.

**Mobile performance risk:** Enabling the full municipal dataset on mobile may consume significantly more startup time and memory than the previous OSM fallback. The reduced tessellation budget, redundant GPU buffer removal, and yield-every-900-features loop help, but no Android/desktop runtime benchmark has been run. The automatic mobile upgrade must remain development-only until real-device results meet budget.

## How to compare / roll back

All flags apply to the development code **after** it is deployed to an isolated preview. They do not activate changes on the current published `main` Pages site.

- Default branch build: citywide official road/curb treatment.
- `?roadMesh=legacy` restores the previous triangle edge budget for same-hardware mesh comparisons; Station 1's existing 8 m rule is unchanged.
- `?municipalRoads=0` disables mobile official road data and restores the original OSM-only fallback.
- `?pavementContinuity=0` disables the existing special Station 1 pavement reconciliation if it regresses.
- `?junctionPrototype=1` is the older isolated fallback-junction experiment. It has **no effect** with official road surfaces successfully loaded.

Documented runtime diagnostics on the root HTML element:
- `data-official-road-detail`: selected municipal/mobile/fallback source
- `data-official-road-build-ms`: elapsed geometry building time
- `data-official-road-triangles`, `data-pavement-height-triangles`: mesh/index counts
- `data-official-curb-types`: source classification counts (`raised`, `edge-of-pavement`, `unclassified`)
- `data-city-ready-ms`: total load/initialization timing

## Tests

Isolated direct execution of the **saved code**, not a production browser:
- Four synthetic triangulation modes (legacy, improved desktop, improved mobile, Sherbrooke) passed edge-length expectations: 80 m right-triangle workload returned 16 / 32 / 16 / 256 sub-triangles respectively, all with expected maximum edges.
- Four-wheel attitude sample returned four contact heights, mathematically expected 2% pitch and 3% roll, and retained height hints.
- Municipal road and bridge policy and closest height sampling passed in-memory geometry checks.
- Previous prototype had ten isolated road topology checks and three real gameplay-surface function checks passing.

New repository regression test is `tools/test_citywide_road_quality.mjs`; the station pavement regression is updated to inject the policy. Test source is committed, **but the repository-wide Node suite has not been run** due to lack of a cloneable local checkout in this session.

Run on an actual checkout before promotion:
```sh
node tools/test_citywide_road_quality.mjs
node tools/test_station_road_detail.mjs
node tools/test_official_road_surface_index.mjs
node tools/test_rendered_pavement.mjs
node tools/test_gameplay_systems.mjs
node tools/test_fallback_junction_geometry.mjs
node tools/geospatial/test_road_network.mjs
node tools/geospatial/test_road_terrain_clearance.mjs
node tools/geospatial/test_official_road_surfaces.mjs
```

Visual benchmark matrix (compare all with the same start/spawn, camera settings, weather, cache and hardware):
- Sherbrooke / Station 1 apron (verify **no regression**)
- George Street North and South (downtown one-way and intersection markings)
- Water Street (crossings, abrupt turns)
- Lansdowne Street (arterial widths, median/turn lanes)
- Chemong Road / The Parkway (wide intersections, signals)
- Parkhill Road East and West (grade transitions)
- Ashburnham Drive (East City geometry)
- Highway 115 ramps (stacked decks / divided highway)
- Service driveways, parking aisles and dead ends in varied neighborhoods

Measure p50/p95 frame times, draw calls, GPU memory, WebGL context loss, startup/build time, road-face samples missed at wheel corners, visual roadway continuity, bridging, and camera motion smoothness. A quality increase is not a performance improvement until measured.

## Remaining scope

1. **Run real phone/desktop tests before enabling full municipal loading in production.** If too expensive, implement visible-tile / proximity municipal index and mesh streaming rather than discarding surveyed roads or silently degrading the entire map.
2. Integrate proper ribbon trimming and curb-corner geometry with the earlier opt-in fallback junction solver.
3. Rebuild the municipal curb snapshot if the real service exposes curb classification; record source version and counts. A street-specific photograph or field survey is needed to establish actual curb reveal and markings.
4. Improve bridge/underpass reference-height evidence before changing vertical grade.
5. Add OSM turn restrictions and surveyed road/pavement occupancy checks to driver training routes.
6. Add source-aware lane markings so paint never leaves official pavement boundaries, with stable IDs for editing manual exceptions.

No production link for the unmerged changes is claimed. To review code, open the development branch and compare against `main`.
