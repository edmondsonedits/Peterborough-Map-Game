# City Detail System pilot — v1.6.56

## Scope and provenance

Production baseline: `54c904e511c200eb5d5b9943b1af6253d3eb49ce`, normalized production v1.6.55. Older capture-only instructions in this directory are superseded by the user's 2026-09-09 city-detail implementation goal. The next production release is exactly v1.6.56; dispatch/gameplay modules remain on their tested compatibility implementations.

The 190 m radius pilot around 44.3010, -78.32212 introduces six deterministic building archetypes, framed windows, thin trim and inferred road-facing entrances. Footprints, resolved building heights, terrain, roads and navigation geometry are unchanged. An initialization-order check ensures road context exists before choosing an entrance side. The reviewed Station 1 custom facade remains excluded from generic grammar.

The authoritative reference remains packaged [Ontario SCOOP 2023](https://data.ontario.ca/dataset/open-ontario-imagery/resource/7a637818-08d9-4951-936e-c1adb0d858e1), Open Government Licence Ontario, capture 2023, checked 2026-09-09. `data/survey/station-one-survey.geojson` records WGS84 reference calibration/provenance. This imagery supports broad roof/pavement zones and site relationships, not measured facade patterns or tree species. The light apparatus apron begins at the existing surveyed facade line; its other boundary and rear-paving boundary are approximate visual interpretations. They change ground-material appearance, not elevations or collision. No external photo textures were embedded.

Station 1 roof albedo is now pale rather than dark, based on the overhead reference. Roof subdivisions/equipment remain outstanding. Twelve surveyed tree roots now use an original Blender broadleaf family, 816/184/36 triangles at three LODs. All instances share the family resources; forced-lite skips the highest LOD. Original fallback trees remain available on loading/parse failure. Asset source, hashes, authoring instructions and provenance are in `tools/blender/README.md` and `city-explorer/assets/vegetation/manifest.json`. No claim of surveyed species, season or dimensions is made.

## Independent critique and correction loop

A fresh-context reviewer froze its criteria from reference pixels before building. Neutral A renders established the baseline. B improved surface contrast but exposed a gap between apron material and apparatus doors. C closed that gap; a remaining rear-yard material strip prompted another boundary correction. The reviewer, not the builder, supplied these work orders. Full geographic/architectural acceptance remains unproven; the prototype is an incremental improvement, not a completed digital twin.

## Reproducibility

`tools/capture-city-quality.cjs` captures unchanged views 01 aerial-perspective, 02 apparatus, 03 public entry, 04 yard context, 05 player spawn. New 06/07 provide identical orthographic geometry/reference-overlay views. Camera XYZ, rotation, FOV or orthographic extent, AGL, viewport, DPR, profile, timing and renderer.info are recorded. Final source-hashed captures are in ignored `artifacts/visual-qa/e/`; the capture receipt hashes top-level simulator JS/HTML/CSS and the data manifest, and records the base commit. This is a defined code-snapshot identity, not a hash of all source datasets.

Performance is measured at default player spawn for 30 seconds after warmup, full and forced-lite separately. Other views are short visual checks, not performance benchmarks. Headless Chromium uses D3D11 at 1280×900/DPR1. API/analytics HTTP403 messages occurred during baseline and modified loads; no shader or page exceptions were observed in those completed captures. These environment-dependent fetch failures are not silently counted as visual test passes.

## Remaining work

- Independent verification of final reference-overlay pair and site-boundary correction.
- Roof zones/equipment, seasonal tree treatment, neighbouring parcel surface artifacts and actual facade evidence.
- Native-resolution road-height audit: reconstructed Sherbrooke ribbons differ from packaged 8.3 m DTM by up to about 0.99 m near Station 1. That is not a surveyed pavement error, nor an assessment of final polygon triangles. The coarse 33.98 m terrain grid and upward clearance fitting warrant investigation before changing real road grades.
- Broader asset families, finer spatial facade budgets, district expansion only after pilot review. No citywide rollout of this grammar yet.

## Validation

Final E player-spawn measurements: full 59.17 median FPS /17.9 ms P99 frame, 464 draw calls, 3,397,791 triangles, 9.11 s ready; forced-lite 59.17 FPS /17.4 ms P99, 428 calls, 2,206,568 triangles, 5.44 s ready. Both samples span about31 seconds at1280×900/DPR1. Final facade counts are6731 full/3755 lite. View06/07 orthographic pair completed. Source snapshot hash: `c893a968a38508c834d6fc09cf79ff589cb7179b8f76b659ccb1640147ddc594`.

The independent critic confirmed the corrected apron continuity in C but its final E review was interrupted by account usage limits. Final whole-pilot acceptance is therefore not claimed. User redirected priority to smooth roads/curbs/sidewalks on2026-09-10; further decorative expansion is paused.

The production regression gate passed 100 tests plus 16 base-training tests. Targeted archetype, site-material, city-detail, semantic-survey, Station 1 accuracy, rendered-pavement and gameplay checks passed. The site's version normalizer preserves the current dispatch-editor module while advancing release identity to 1.6.56. Runtime binaries, incidental debug logs and intermediate render artifacts must not be committed or deployed.
