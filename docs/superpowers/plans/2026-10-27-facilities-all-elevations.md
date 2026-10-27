# Peterborough emergency facilities exterior completion

> For agentic workers: bounded subagent execution with separate source, asset, and integration ownership.

**Goal:** Finish all sides of the three city fire stations, then the two city EMS bases already mapped in the game.
**Architecture:** Original Blender assets use the existing GIS footprints/transforms. Stations 1 and 2 retain gameplay adapters. New exterior landmarks replace only exactly matched source buildings after successful load. Roads, terrain, navigation and existing spawns remain authoritative.
**Tech stack:** Blender/Python, glTF, Three.js, Node tests and browser QA.
**Spec:** User requested recognizable real-life buildings from every direction; approved judgment for estimated details. Stations 1/2 existing research docs plus per-facility source ledgers govern appearance.

## Constraints
- Sites: 210 Sherbrooke St, 100 Marina Blvd, 839 Clonsilla Ave, 310 Armour Rd and 1003 Clonsilla Ave.
- Work on fire stations first, then EMS. Preserve Station 1 second-from-right truck spawn and front controls.
- Owner confirms five Station 1 rear bay doors, plus one side bay door on the rear shed. Rear style, dimensions and precise shed placement remain photo-scaled estimates. Keep these rear scenery doors closed for this appearance revision.
- Inspect sources, record dates/attribution/confidence, and distinguish user confirmation from photographs and estimated details. Do not label hidden room plans or unviewed elevations as verified.
- Original materials only; do not ship reference-photo pixels. All H: access stays under H:/ChatGPT.
- Local integration and QA; publishing is not part of this request.

## Tasks and checks
- [x] Station 1: replace solid rear appearance with five closed sectional doors; finish observed side/roof/tower detail and shed side door. Export/reimport, validate, inspect all elevations and retest front spawning/door route.
- [x] Station 2: compare existing front/rear/side model with project imagery/plans; correct supported differences and keep front/rear gameplay intact. Validate changed assets and appropriate station tests.
- [x] Station 3: gather current exterior views, reconcile exact GIS footprint, author reproducible Blender asset and integrate fallback-safe exterior. Verify streetside view, rear/sides, source suppression and preserved spawn.
- [x] EMS Armour then Clonsilla: inspect references, author exterior assets, integrate at exact source footprints, and inspect all model elevations in Blender and in game. Preserve shared city/service data and roads.
- [x] Final integration: targeted regression tests, GLB validation, browser load/movement, duplicate-source/editor-restore and failure fallback checks; record asset counts/hashes, evidence gaps and deliver current local preview.

## Review focus
Missing/corrupt assets must retain scenery; nearby buildings must remain; model floors must not distort roads; editing/restoring cannot recreate duplicate source meshes; unchecked rear/side evidence must not become an exactness claim.

## Outcome

Local integration is complete and retained in the feature checkout. All 894 Node/editor tests passed. All five final GLBs have zero validator errors/warnings; browser checks cover Station 1/2 front drive-outs, Station 3 movement, all-five loading, missing-model fallback and all exterior viewpoints. The independent overlap review was resolved and re-reviewed. Public imagery does not verify every rear/side detail, especially Station 3 and the EMS bases; those limits and estimated geometry are documented in docs/facilities. This acceptance does not claim a surveyed digital twin or new interactive EMS/Station 3 interiors.