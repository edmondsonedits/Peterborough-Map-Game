> **Superseded municipal-composition evidence:** these original combined geometry and CPU fixtures appended OSM ribbons after municipal reconciliation. Production clips/replaces those ribbons during Station and Hospital reconciliation. Their source ranges were therefore stale in production, a condition these fixtures omitted. Use `../reconciled-road-provenance.md` and the later actual-app-order orchestration evidence for final composition/CPU claims. The old numbers remain as diagnostic history, not proof of the published scene. Default-lite without municipal reconciliation is a separate path.

> Verification correction: the earlier municipal-plus-OSM contact and cost fixtures assembled OSM buffers after pavement reconciliation. Their composed-surface results and plots are retained as diagnostic history, not final production-order acceptance. See [final reconciled source provenance](../reconciled-road-provenance.md) and the actual production-order regression for superseding evidence. Source trace topology and municipal-absent default-lite tests are separate.

# Municipal eligibility and final visible paint height

## Reproduced defect

The previous paint used final municipal triangles but did not account for still-rendered OSM ribbons above them. The combined actual-buffer Hospital low-power regression reproduces 4,758 hidden probes on way 1414147320. This is distinct from the earlier broken strict-municipal-only default-lite intermediate path that emitted zero arrows; neither ablation is the original PR54 baseline.

## Narrow correction

The paint-only support helper requires an eligible actual municipal triangle first wherever municipal data is present. Municipal holes never acquire fallback eligibility. That triangle anchors the local deck; final Y can follow the highest compatible actual rendered municipal/ribbon/cap face. Source bridge/tunnel/layer and per-way provenance are retained. Higher forbidden municipal parking polygons or conflicting source decks fail closed. Historical paint continues to require municipal ROAD at every probe, while mapped service turn-lane paint retains only its previously approved parking eligibility.

An actual mapped service=parking_aisle ribbon can supply Y-only contact inside a municipal ROAD footprint. A parking material label is not a parking-area polygon. The synthetic regression verifies a 300 mm higher such ribbon, and separately verifies whole-stroke omission when any requested portion extends beyond municipal ROAD. Geometry, road widths, physics and geographic source files do not change.

The app shares one bounded paint-only support index between historical and mapped paint builders. The municipal and gameplay indices remain unchanged. Historical source fingerprints, source-station exclusions and stroke widths are unchanged.

## Bounds and tests

The existing local deck heuristic separates consecutive surface-height gaps greater than 1 m; it is not a surveyed clearance guarantee. Actual triangle vertices, edge midpoints and centroids are tested after Float32 upload. Finite probes cannot prove absence of microscopic gaps. Source tests include packaged lidar but omit water recess and browser rasterization.

- `node --test tools/test_fallback_arrow_support.mjs tools/test_historical_paint_runtime.mjs tools/test_mapped_arrow_paint.mjs tools/test_road_startup_phases.mjs`
- `node tools/test_municipal_arrow_visible_top.mjs` and `--desktop`, each also with `--south`.
- Add `--municipal-only-ablation` to reproduce the hidden-paint assertion on Hospital low-power mode.

Both mapped compound sites retain two lane arrows in both profiles; independent raw combined-top checks report zero hidden or unsupported probes. Recorded JSON timing runs executed concurrently, so they are not isolated performance comparisons. A separate serial Hospital low-power run measured 504 ms for the failing municipal-only ablation versus 958 ms corrected before optimization. Consolidating the exact municipal eligibility/top queries into one cell scan reduced the corrected run to 508 ms (60 ms bounded index creation), with identical emitted geometry. These are Node fixture timings, not browser startup/frame-rate measurements.

## Approximate full-source cost (independent review)

`node tools/benchmark_visible_paint_full_source.mjs` reproduces the benchmark after the companion historical contact helper is integrated; add `--desktop` for desktop. `VISIBLE_HISTORICAL_HELPER_PATH` can point to an extracted historical helper from commit 4f2d44a, together with `--municipal-only-ablation`, to reproduce the old-contact comparison. This ablation is the previous rebuilt contact policy, not original PR54.

Independent low-power measurements: 3,308 bounded fallback faces, 54 ms index construction, 2.58 s historical/support plus stubbed-generic work, and 1.13 s arrows; combined 3.71 s versus old-contact 2.94 s, approximately +0.77 s. Desktop: 3,970 support faces/67 ms, historical/support 2.99 s and arrows 1.52 s. Both emit 173 municipal-mode mapped arrows. Combined paint buffers are 7.36 MB low-power / 7.49 MB desktop. Saved JSON has exact counts.

This full-source fixture contains 5,953 OSM ways and 477,776 low-power municipal triangles. It omits global bridge/water effects in municipal heights, while actual OSM bridge lifts and ribbons are built. Generic paint draping is stubbed, so totals exclude ordinary paint and complete startup. Peak RSS is the entire fixture process, not incremental paint/browser memory. These limitations prevent a claim of browser equivalence.

Historical output initially lost entire strokes at actual Y steps. This shared-support commit must be used with the companion historical adaptive-contact correction and its retained-interval/omitted-area evidence; reduced historical output is not an accepted endpoint. Final browser pixel confirmation is an integration check.
