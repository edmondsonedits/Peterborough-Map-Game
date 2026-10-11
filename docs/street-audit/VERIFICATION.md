# Street paint release verification

## What was actually verified

GitHub Actions run **38103366373** completed successfully:
https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/38103366373

The run merged current main **2101b80835acfee40e3cb8edb8c1d449c77ecff0** into the isolated feature checkout before testing. Import/cache conflicts were resolved without dropping main's independent search, route-mapping, release-loader and other changes. The original audit starting-point label is 3a9f333; the regenerated inventory's file SHA-256 hashes identify the actual merged source data used.

Passed: 15 street-marking regression cases, 2 real-parser/junction-contact cases, all 67 selected existing gameplay/gearbox/camera/EMS/search/route tests, existing road/pavement/terrain tests, browser startup, actual Station 1 acceleration/steering/braking/reverse, and emulated mobile controls/layout. The full-network terrain check inspected 5,953 non-tunnel roads / 2,965,162 sampled surface points and reported minimum terrain clearance of 0.104 m. That checks internal mesh clearance, not real-world survey accuracy.

## Actual final screenshots, not just synthetic fixtures

The comparison explicitly loaded municipal pavement with `?municipalRoads=1`. Both baseline and updated views reported `citywide-municipal-mobile` (the headless runner selects the low-power quality profile). Updated views reported `street-evidence-2` and **four** reviewed source-way IDs. Both browser runs recorded no uncaught page errors.

The matched Sherbrooke/Station 1 screenshots were inspected: the previous extra white through-lane dashes are absent, and the yellow centre line is continuous across the captured road instead of disappearing below the pavement. The Lansdowne West capture shows yellow borders on both sides of its tagged shared centre-turn lane, rather than treating one border as a same-direction white divider. This validates that the corrected rules are active; it does NOT independently certify Lansdowne's complete lane allocation or every driveway/turn pocket against current field conditions.

Two extra bugs were found by visual/runtime checking and fixed:
- The primary GeoJSON parser appends `:0` / `:1` to source-way IDs. The reviewed-way matcher now recognizes those exact forms while rejecting unrelated IDs.
- Legacy fallback junction caps have a visible top approximately 18 mm above their road ribbon. Their actual transformed Float32 top triangles are now included in the driving/paint surface index; no arbitrary whole-city paint lift was added.

## Measured comparison, narrowly scoped

Same software-rendered Chromium, 1280×720 viewport, camera poses and packaged assets; 19 usable frame intervals per view. These are NOT real Android GPU benchmarks or a general FPS guarantee.

| View | Baseline rendered triangles | Updated rendered triangles | Baseline median frame ms | Updated median frame ms |
|---|---:|---:|---:|---:|
| Sherbrooke/Station 1 | 2,489,218 | 2,423,918 | 966.7 | 899.9 |
| Lansdowne West | 1,901,230 | 1,806,746 | 783.2 | 666.6 |

Full municipal startup measured 77.393 s before / 77.766 s after on this software-rendered runner. Do not claim faster startup. Geometries increased in these views while rendered triangles decreased. The existing lighter default mobile mode remains available; full municipal loading remains opt-in on the low-power profile.

Evidence artifact **11688094586**, `street-paint-integration`, includes four comparison PNGs, raw comparison metrics, driving/mobile reports and the complete regenerated audit. Artifact SHA-256: `662c6c3bc1e5f0873c8fcaa2c3c327faa5f9156e5f33d2865aa5e8eea1fa0703`. GitHub artifact retention is seven days; the run/log links remain the audit trail.

## Coverage and limits

The regenerated inventory contains 5,961 renderable OSM ways: 2,081 lane-count agreements, 232 conflicts, 64 missing OSM counts with usable ORN evidence, 195 partial/varying matches and 3,389 without a reliable ORN match. Many unmatched ways are service/unnamed roads. These are segment counts, not complete-street photographic reviews.

General rule changes affect 20 tagged shared-centre-turn-lane ways and 28 cycle-separator interpretations; the sets overlap other paint corrections and must not be summed into a unique-road count. The bounded Sherbrooke correction applies to four explicitly reviewed ways only. A separate baseline/current profile comparison on the packaged 5,961 ways found **zero computed road-width or lane-profile changes**: the Sherbrooke override changes paint interpretation without rewriting OSM tags, road footprints, routing or parking widths.

The 232 lane-count conflicts remain review candidates, not automatic corrections. Exact curb heights, dropped curbs, parking/bike-lane widths, stop bars, intersection arrows, and current acquisition dates are not established for the whole city. Unreviewed streets remain flagged in `network-audit.json`. This release is an evidence-based rendering correction, not certification that every Peterborough street is visually accurate.
