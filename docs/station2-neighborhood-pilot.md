# Station 2 neighborhood facade pilot

Implemented locally on 2026-11-01. Publication is a separate step.

## Scope and rendering

A 320 metre radius around Station 2's reviewed world anchor (278.09, -2942.46) contains 165 buildings considered by the active renderer. All 164 ordinary buildings receive textured walls. The reviewed Station 2 replacement is the sole explicit exclusion. There are no uncovered runtime buildings. The offline source inventory contains 167 candidates, including three municipal candidates not selected by the actual renderer; candidate totals must not be presented as rendered coverage.

GIS footprints, positions, heights, collision, navigation, dispatch identity and editor ownership remain authoritative. Generated window/door layouts and inferred roofs are illustrative architecture, not surveyed evidence of individual properties.

Four original, shared 256x256 CanvasTextures provide brick, render, siding and stone patterns. Four shared 128x256 opening textures provide framed windows, curtains, panel doors and sectional garage doors. Wall UVs repeat at metre scale; stable building-ID tints add variation. There are no unique images per house and no separate window meshes: geometry is appended to the existing spatial/material batches, including their editor ranges. Maximum uncompressed texture storage including mipmaps is approximately 2 MiB.

Front facades follow the nearest suitable parallel street, falling back to an inferred long edge. Rear and side faces use quieter layouts. Ancillary buildings receive suitable small doors or garage openings. Optional opening details follow the existing distance culling. Both normal and low-power profiles retain wall coverage.

Inferred irregular pitched roofs inside the pilot use clipped gable planes within the existing footprint and vertical envelope. Explicit roof-shape tags and reviewed roof geometry retain their existing paths. Concave boundary walls close the roof edges, and triangle limits fail back to the existing roof renderer.

## Critique and improvements

1. The first draft only increased plain window panels. Rejected it as insufficient: added actual repeating material textures, opaque detailed opening textures and coordinated color variation.
2. Street-level screenshots exposed raised doors on sloped terrain. Shifted door assemblies to ground level and removed duplicate base wall surfaces under pilot textures.
3. Frontage review exposed an edge-index bug when short edges were discarded. Corrected the mapping and added a regression test.
4. Northern houses retained tall, dark roof boxes. Replaced eligible inferred boxes with clipped gables; checked fresh north, street and overview screenshots. Added concave-edge closure and upward-normal tests.
5. Renderer review checked batching, UVs, editor lifecycle and distance culling. Added the new opening materials to the existing far-detail set.

## Verification

The user requested an alternative to unavailable in-app browser control. Used a standalone headless Playwright Chromium instance against the real game at http://127.0.0.1:4183/city-explorer/?station=2, with 1440x900 screenshots and the project's QA hooks.

- 24 focused tests pass across neighborhood facades, roofs, building appearance and emergency facilities. App syntax passes.
- Existing city editor override and integration checks pass.
- Runtime coverage: 164 treated buildings, one reviewed-station exclusion, zero uncovered buildings in normal and low-power modes.
- Station 2 gameplay: clicked the bay-door button, waited for the door to open, entered the truck and drove more than 40 metres out of the station.
- Baseline overview: 287 draw calls, 1,217,665 triangles, 35 uploaded textures. Final pilot overview: 294 calls, 1,232,233 triangles, 42 uploaded textures. This is seven additional draw calls and about 1.2% more visible triangles in that view.
- Sampled median frame intervals were 16.7 ms, with p95 about 16.7-16.8 ms across the three views. The vsync-limited headless sample does not establish GPU headroom or physical-phone performance.
- No new game JavaScript errors were observed. A pre-existing Firestore siteAnalytics 403 appears in both baseline and pilot runs.

QA screenshots and full receipts are in H:/ChatGPT/Peterborough-Facilities-20261027/qa/station2-neighborhood/. The compact checked-in QA receipt records final counts. Use ?station2Facades=0 for the original rendering comparison.

## Components

- city-explorer/station2-neighborhood-facades.mjs: bounded selection, stable facade roles, wall patterns and representative layout data.
- city-explorer/station2-neighborhood-openings.mjs: shared original opening textures.
- city-explorer/station2-neighborhood-roofs.mjs: clipped, bounded roof geometry.
- city-explorer/app.js: active batched renderer integration, editor attributes and diagnostics.
- tools/export-station2-neighborhood-facades.mjs: offline source inventory and representative geometry export; its counts are candidates, not runtime proof.