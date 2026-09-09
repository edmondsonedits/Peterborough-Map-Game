# Pavement contact increment — 2026-09-09

## Implemented

Municipal road, bridge and parking meshes register their actual Float32 triangles in a 60 m spatial hash. Height queries use barycentric interpolation on these faces. The truck, firefighter and public municipal surface sampling API now use that height, including at wide aprons beyond a centreline's width. Height hints distinguish stacked faces. A mapped bridge above an OSM underpass permits the lower road when the actor's prior elevation clearly identifies that deck; this exception does not apply to ordinary sloped pavement. Missing municipal faces retain the existing road/terrain fallback.

The change does not modify municipal footprints, OSM centrelines, terrain pixels, water geometry, projections, datum, or materials. The height index follows the renderer's existing geometry; it does not certify that geometry as surveyed 3D road elevation.

## Evidence

Packaged `data/manifest.json` generated 2026-08-12 identifies City of Peterborough Basedata layers 10 (parking), 11 (road surface), 12 (bridge), source coordinates EPSG:4326, Ontario DTM 2025 and CGVD2013 height. Terrain is packaged at about 8.30 m ground spacing. Existing local-metre world projection and terrain exaggeration 1 are unchanged.

Source owner: City of Peterborough. Recorded service: https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer . The live road/bridge service pages could not be fetched through the browsing tool during this review; no new layer export or current source date is claimed. On 2026-09-09, the [City open-data page](https://www.peterborough.ca/council-city-hall/open-data/) was retrieved through search and confirms free reuse/redistribution while requiring users to validate downloaded data. Existing attribution and dataset terms remain in `THIRD_PARTY_NOTICES.md`. No new imagery or third-party asset was imported.

## Measured validation

Desktop local browser, packaged city, `?pavementQA=1`:

- 308,015 indexed pavement triangles.
- 2,725 deterministic sampled face centroids; zero missing hits.
- Legacy terrain/centreline query compared with these faces: mean absolute difference 0.047402 m; maximum 1.425476 m.
- New rendered-face query: mean absolute difference 2.04e-14 m; maximum 3.85e-12 m (numerical precision).
- These are internal mesh consistency measurements, not real-world survey errors, citywide accuracy bounds or a full collision guarantee.

The repeatable browser harness `../tools/pavement-browser-check.html` entered Engine 1, applied throttle for 2.2 seconds, braked for 1.05 seconds and allowed settling:

- 13.1977 m net movement from the Station 1 apron onto the road; peak 30 km/h, final 0 km/h.
- 90 contact samples; all used `rendered-pavement-triangle`.
- Maximum sampled ground change: 0.017407 m per approximately 50 ms interval.
- Maximum actor-origin clearance: 0.035004 m, consistent with the existing 0.035 m truck-origin offset. This is not per-wheel suspension measurement.
- The displayed frame rate was 60 FPS before and after the route; no hardware-independent performance claim is made.
- Screenshots inspected at the initial station view and the stopped road position. No reference-camera likeness score assigned: this change concerns mesh/contact consistency and no matched ground-level real photo was supplied.

Passed: module syntax checks; `tools/test_rendered_pavement.mjs` (including 201 seam samples and actual gameplay-function integration); `tools/test_official_road_surface_index.mjs`; `tools/test_gameplay_systems.mjs`; `tools/geospatial/test_road_network.mjs` (5,956 drivable ways, original vertices preserved, stacked surfaces and terrain clearance checks).

A browser log reported a source-unattributed MutationObserver error while the iframe test page was being inspected. Startup, the full drive and measurement collection completed. It is not evidence of a resolved issue or of an error-free console.

## Remaining fidelity limits and next increment

The city remains a procedural reconstruction. Ground resolution does not establish curb-height precision, and many building heights, roofs and facades remain inferred. This increment neither removes all overlapping visual meshes nor reconstructs unknown bridge grades. It also does not add building collision or a full swept-vehicle physics system.

Next: audit one grade-separated crossing against the packaged official bridge footprint, terrain and lawful aerial evidence, then correct any duplicate ground-level pavement or unsupported vertical profile. Prefer explicit source geometry over cosmetic lifts or hidden overlaps; record missing deck-height evidence rather than inventing exact values.
