# Station 1 road cross-section pass — 10 September 2026

Status: local implementation, following published visual release 1.6.56. Not a declaration that the surrounding block is finished or survey-exact.

## Scope and evidence

Within 200 m of WGS84 44.3010, -78.32212, feathering cross-section changes to the existing system at 240 m. The established projection, metre scale, CGVD2013 terrain and source XY remain unchanged. No new imagery, dependencies, or downloaded geometry.

- City of Peterborough, [2026 Standard Specifications](https://www.peterborough.ca/media/3i0cymfy/c-cop-2026-standard-specifications-final-1.pdf), January 2026, CPD408.090 (December 2025), PDF page 111: 150 mm curb/sidewalk face in the catch-basin detail. Used as a **typical inferred** reveal, not proof of every existing curb height. Sidewalk specification CP351.02 describes 125 mm normal slabs, with thicker driveway slabs. The model does not yet classify driveway slab thickness.
- City of Peterborough, [Basedata layer 8](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/8), accessed 2026-09-10: distinguishes raised curb from uncurbed pavement and level sidewalk edges in its description. Crucially, neither the current exposed fields nor packaged features contain CURBTYPE. Unknown classifications retain the previous curb interpretation; no missing value is treated as evidence to remove a curb. Source geometry is 2D, source CRS 2958 (legacy 2150), packaged WGS84; no source vertical elevations. Existing repository municipal attribution/licence continues to apply; reference specification is linked, not redistributed.
- Epic Games, [Landscape Splines](https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-splines-in-unreal-engine), accessed 2026-09-10: smooth connected road geometry and terrain transitions inform the approach. No engine migration or copied code/assets.

## Implementation

- Road-adjacent curbs and sidewalks sample the final rendered pavement faces, using a bounded nearest-first search outside the road polygon. Typical curb reveal is 0.15 m; fallback is retained where there is no nearby pavement. These inferred dimensions are not survey measurements.
- Local sidewalks use continuous two-metre ribbon segments with shared miter joins, rather than overlapping tilted boxes. Ordinary slab depth is 0.125 m. Widths and centerlines retain existing source-derived/inferred values.
- Both curb faces render in full and lite profiles; they no longer depend on arbitrary source-line direction to choose the visible face.
- Local municipal pavement uses at most eight-metre edges instead of 36–48 m default faces, bounded by a recursion limit. This improves mesh resolution; it does **not** constitute a surveyed road vertical profile or guarantee all seams below a specified height.
- The existing rendered-triangle index continues to own driving heights. Bridges and citywide terrain are not rescaled or flattened.

## Verification

Passed syntax check and targeted tests: `test_station_road_detail.mjs`, `test_rendered_pavement.mjs`, `test_gameplay_systems.mjs`, `test_station_one_accuracy.mjs`. Synthetic planar 2%/1% grades remain unchanged across 256 subdivided triangles; segment endpoints match and missing curb types remain unknown.

Matched views in `artifacts/visual-qa/road-final/` show the Station 1 sidewalk no longer buried beneath the road. Camera 05 full: 59.17 median FPS, 17.9 ms P99; lite: 59.17 FPS, 17.4 ms P99, over 31-second samples at 1280×900/DPR 1. Optional remote-service requests returned HTTP 403; no page exceptions occurred.

Scripted apron drive: 13.37 m, 30 km/h peak, 89 samples; maximum sampled ground-height change 0.01134 m, contact offset 0.03507 m (normal controller offset). This tests the apron exit, **not every road in the block**.

Rejected experiment: adaptive one-metre refinement reduced sampled drive steps to 0.00547 m, but the wider render exposed jagged parking edges from discontinuities in the existing height field. Removed after visual QA. `road-adaptive/` is rejected evidence, not the retained result. Retained source hash: `fa784b1fecfee3681103f53f453557350aa44cd50ea4f9f91cfb3ebca7d783b2` (capture tool's top-level city-source + manifest hash).

## Remaining work / acceptance limits

Visible pavement/material overlaps, driveway lowering and intersection/corner transitions still need location-specific inspection and correction. Longitudinal profiles still originate in the existing terrain-envelope system; this pass improves mesh fit and cross-sections, not the source vertical accuracy. Lite/full terrain resolution differences remain. No blanket claim of smooth citywide roads, exact curb classes, or AAA quality.

Next priority: trace Sherbrooke and the adjoining block at road level, identify each overlapping surface owner, and reconcile pavement/apron/sidewalk transitions before adding decoration. Do not hide geometry defects with material masks or arbitrary global offsets.

## Continuity follow-up: localized rebuilding and direct driving verification

- Restricted replacement of GPU geometry to road tiles intersecting the 240 m pilot bounds. The current dataset rebuilds 21 meshes and reuses 203, including unchanged bridge geometry. Source XY and the shared height-field algorithm are unchanged by this follow-up.
- Fixed polygon selection to include large source outlines that cross or contain the pilot without having a vertex inside it. Boolean clipping now considers only mask components whose bounds intersect the candidate triangle.
- Added `node tools/test_station_pavement_layer.mjs`: verifies enclosing polygons, road ownership over parking, shared field heights, unchanged distant geometry and bridge deck preservation with actual Three.js geometry and the rendered pavement index.
- Changed `tools/check-station-driving.cjs` to operate the game directly with keyboard input instead of relying on the stalled iframe harness. Latest check: 13.539 m travel, 30 km/h peak, 88 samples, maximum sampled ground step 0.003371 m, contact offset 0.035093 m, no page exceptions. This is a short apron route, not a complete block test. The existing 3000 rendered-centroid probes had zero missing queries.
- Matched full-profile view 04 before/after: `artifacts/visual-qa/station-finish-before/full/04.png` and `station-finish-after/full/04.png`. Camera and triangle/draw counts match; inspected images show no obvious regression. Ready time was 40.45 s before and 36.78 s after, but these are single runs with uncontrolled cache/load conditions, not proof of a stable speedup. Short samples were approximately 60 FPS. Optional external requests remained network-blocked.
- Passed the station pavement integration, pavement field, station road detail, rendered pavement, station accuracy, gameplay systems and continuity fixture tests; changed JS syntax checks pass.

Important retained limitation: the earlier shared-field reconstruction reports a maximum 2.735 m adjustment from its original generated pavement vertices somewhere in the pilot. Those are model-to-model heights, not a surveyed correction; this needs location-specific investigation before asserting vertical accuracy across the district. Façades and vegetation remain largely procedural. No new photographic assets, splat prototypes, publishing or citywide fidelity claims are included in this follow-up.

## Ground-level open-edge correction

The user supplied a near-ground view exposing open space beneath raised sidewalks. Sidewalk top heights followed the rendered road, but side faces extended only 125 mm downward, independent of the lower terrain. Existing sidewalk side faces now reach at least 30 mm below sampled terrain while preserving minimum slab thickness. Disconnected ribbon ends are capped. Local curb side faces likewise reach terrain on both sides. These are inferred solid foundations, not extra overlapping horizontal surfaces or surveyed construction depths. Top geometry, source XY and driving heights are unchanged.

Added a repeatable view `?capture=08`, facing west beside the Station 1 planting bed. It uses a separate capture camera to avoid the fly controller's five-metre minimum altitude. The retained render `artifacts/visual-qa/gap-after/full/08.png` is approximately 0.949 m AGL and was visually inspected. The initial `gap-before` attempt was clamped to 5 m and is not a matched before/after comparison.

Regression checks for support depth, negative local heights and invalid input pass with station road detail, station pavement integration and rendered pavement tests. App/capture syntax and diff whitespace checks pass. Direct keyboard drive: 13.562 m, 30 km/h peak, 88 samples, 0.003426 m maximum sampled ground change, 0.035040 m controller contact offset, zero page exceptions. Optional external services remain blocked by the test environment. This corrects open sidewalk/curb undersides; it does not certify all horizontal layer boundaries or resolve the previously recorded district-wide vertical uncertainty.
