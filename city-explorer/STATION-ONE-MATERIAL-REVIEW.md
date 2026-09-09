# Station 1 material review — 2026-09-09

## Evidence and limits

- Packaged Ontario 2023 orthophotography and the existing semantic survey remain the horizontal/site reference. No coordinates, footprints, road triangles, terrain samples or datums were changed.
- Exterior reference: Evan Holt / PTBOCanada, published 2011-03-16, https://www.ptbocanada.com/journal/2011/3/16/ptbocanada-takes-you-on-a-tour-of-peterborough-fire-services.html (FireServices21.jpg). Accessed 2026-09-09. Copyright retained by its owner; visual reference only, no imagery copied into assets. CRS/vertical datum: not applicable to this uncalibrated photograph.
- The winter oblique exterior is USABLE WITH CAUTION for buff masonry and red bay-door character; POOR for exact dimensions, current signage or planting. Camera calibration is unavailable and snow/trees obscure the site. Do not claim a matched-camera reconstruction from it.

## Implemented

- Corrected procedural brick courses from 0.72 m to a conservative 0.075 m module, with 0.225 m horizontal module and derivative-filtered mortar. These are inferred material dimensions, not a measured masonry schedule.
- Applied the same material to the surveyed facade panels and Station 1's source-ID-selected building mass. Buff colour replaces unsupported dark brown; colour is approximate, not photometrically calibrated.
- Replaced the surveyed bed's oversized red spheres with deterministic instanced neutral foliage. Only the bed location is surveyed; species and individual leaves remain inferred. One instanced draw replaces per-plant mesh draws.
- Ground-level shadow coverage is 200 m rather than 2,900 m across the existing shadow texture: 14.5x finer nominal linear sampling. Fly/map retain city-scale coverage. This is a sampling metric, not a measured visual accuracy claim.

## Validation

Passed: test_vertical_slice_quality.mjs, test_semantic_survey.mjs, test_rendered_pavement.mjs, test_gameplay_systems.mjs, test_station_one_accuracy.mjs; syntax checks of app.js and semantic-survey.js. Station facade remains 23.92 m, footprint attachment tolerance 0.08 m, planting/road conflicts zero.

Browser review confirmed loading, visible brick pattern, foliage and local contact shadows. The initial screenshot and reload differ in viewport/camera framing, so they are not a calibrated before/after pair. No new geographic accuracy claim is made.

Updated browser driving smoke test: 13.388 m travelled, peak 31 km/h, 90 samples, stopped successfully; maximum sampled ground step 0.0183 m and intended vehicle-root clearance 0.0350 m. All contact samples used rendered pavement triangles. HUD displayed 60 FPS in the inspected view (not a citywide performance benchmark).

## Remaining P1 visual limitations

The truck and firefighter remain simplified; facade heights, upper-window arrangement, entrance structure, current signage and detailed neighbouring architecture still need calibrated modern ground-level evidence. This increment is not AAA quality. Aerial imagery cannot supply hidden facade dimensions. Next priority is multi-view Station 1 facade calibration, not decorative clutter.
