# Citywide road appearance and contact verification - 2026-10-25

Implemented locally in `H:/ChatGPT/Peterborough-Map-Game-Sherbrooke`; no commit, push, publish or deployment. Existing concurrent visuals, business data and editor changes were preserved.

[Before/after comparison](../test-artifacts/city-roads-20261025/comparison.html) | [Measurements](../test-artifacts/city-roads-20261025/summary.json) | [Capture source](../test-artifacts/city-roads-20261025/capture.cjs)

## Changes retained

- Shared asphalt uses one neutral base across road classes and flat road-edge foundations. This reduces artificial colour boundaries; actual concrete curbs retain their material. Restrained world-space variation uses filtered 8 cm grain and broad irregular patches, with fine detail fading at distance. No textures or geometry were added by the material change.
- Source-connected intersection mouths clear longitudinal centre, cycle and highway-edge paint across the complete approach, including subdivided short segments. Existing lane colours, counts, arrows, source corrections and dash phase remain. A name change alone does not create an intersection. A service driveway does not erase public-road paint.
- Lite/fallback generated curbs stop on the side facing a connected street or driveway. The far side of a T stays continuous. Four-way mouths clear both sides. Exact municipal curb/sidewalk data in full mode is preserved; no surveyed corner radius is invented.
- The road-contact sampler prefers pavement containing the tire and follows the closest same-grade ribbon instead of selecting an off-road narrow edge or a previous endpoint merely because its height matches the previous frame. Explicit stacked bridge/tunnel/layer separation retains height-aware selection. Road source XY, widths, lane data, traffic rules, controls and Hunter bridge profiles are unchanged.

The general yellow/opposing and white/same-direction marking convention was checked against the [Ontario MTO pavement-marking guidance](https://www.ontario.ca/document/official-mto-drivers-handbook/pavement-markings). That supports the existing colour policy; it does not verify a particular Peterborough intersection. No new stop lines, crossings, turn arrows or traffic rules were inferred from general knowledge.

## Citywide integration versus inspected coverage

The shared renderer processes **5,962 source road ways**, 77,928 desktop / 55,939 lite sampled segments. Eligible paved roads and parking asphalt inherit material changes automatically. Junction rules apply to source-connected arms, not hand-coded locations. Unpaved roads retain their own surface; service/unknown lane evidence does not acquire invented stripes. This is not an exhaustive survey of every road or another game mode.

Nine paired views per quality mode: George/Hunter (overhead and street), Lansdowne/Monaghan, Chemong/Parkhill, Ashburnham/Maria, Stewart/Dublin, Water/Dublin, Sherbrooke/George and Hunter bridge. Baseline and final view definitions match exactly. Street views use approximately 2.6 m eye height; overhead views assess junction layout. Daylight, Windows headless Chromium, 1500x950 desktop and 430x900 narrow lite. No physical-phone test.

## Measurements

| Mode | Local ready observation before -> after | Worst draw-call growth | Texture object counts | Off-road tire frames across five valid drives before -> after |
|---|---:|---:|---|---:|
| full | 51.45 -> 52.04 s | 0.00% | Unchanged | 1105 -> 0 |
| lite | 10.59 -> 10.96 s | 0.00% | Unchanged | 4061 -> 0 |

All 18 paired viewpoints had unchanged draw-call and texture counts. Median animation-frame intervals remain approximately 16.7 ms; these are display-capped browser intervals, not GPU-time proof. Single loading observations vary with caching and compilation; do not claim a loading speedup. New texture payload/estimated additional texture memory: zero. Total GPU memory bytes were not measured. All final browser reports have zero console/page/HTTP errors.

Browser-only path following calls actual `updateFireTruck` at 60 Hz, about 29 km/h. Five routes per mode are valid: George Street North, Lansdowne Street West, Stewart Street, Ashburnham Drive and Sherbrooke Street. They have under 0.69 m maximum tracking error and zero off-road tire frames after the contact fix. Desktop sampled routes total 1746 m; lite routes total 2498 m (slightly different paths due to sampling density). The follower trims approximately 12 m at each end. Bidirectional static four-tire probes also ran.

Examples: desktop Lansdowne maximum per-tick surface change fell from 0.659 m to 0.042 m; lite George from 0.452 m to 0.073 m; lite Ashburnham from 1.218 m to 0.025 m. These are route-specific measured contact changes, not a claim that every grade is smooth.

**Excluded result:** the Parkhill follower strays approximately 148 m from its intended path in both baseline and final. Its `completed:true` was misleading; `validTracking:false` now makes exclusion explicit. It is not a passing driving test. Static bidirectional probes still find one non-four-tire sample on Ashburnham and two on Parkhill; these boundary/geometry cases remain unresolved. Lite Sherbrooke retains a roughly 0.199 m maximum transition in this probe.

The first integrated contact run and images are preserved under `review-checkpoint/`. Final images/performance were refreshed after paint/curb review fixes; final reports explicitly reuse the checkpoint driving results because those fixes do not change road geometry or contact code. `after/` is earlier diagnostic evidence. `pre-edit/` preserves the prior relevant sources, and `source-hashes.json` identifies the final runtime.

## Checks and independent review

- New helper tests cover subdivision-independent clipping, same-name T/4-way/acute junctions, continuation, source layers, service driveways and per-side curb openings.
- Actual renderer tests check centre/cycle clipping, source overrides, editor bindings, far-side T curb continuity and lite/full generated geometry. Material tests check shader filtering, fallback and clone behavior.
- Road selection tests cover off-road masking, stale-height slopes, bridge/tunnel/layer separation and tolerance-only fallback; existing road network, terrain clearance, official surfaces/index/bridge policy, rendered pavement, fallback-junction, station detail and gameplay suites pass. Hunter bridge's 14 tests pass. Three older isolated VM harnesses were given the existing Hunter dependency; no runtime behavior was changed to satisfy them.
- JavaScript syntax and whitespace checks pass. Existing unrelated line-ending warnings remain.

Two Luna High workers handled separate materials and road-rule/contact work. One Sol Medium deep reviewer found two blockers: removing the far curb at a T, and clearing public paint at service driveways. Both were fixed with targeted tests. Its final verdict: **No further blocker found within this bounded review.** It inspected actual refreshed junction images and performance reports, and explicitly excluded Parkhill from pass claims.

## Limits and fallback

Complex lite junctions still use approximate OSM ribbons/caps rather than the full municipal pavement footprint. Some rectangular corner gaps, height seams, sidewalk transitions and sparse source markings remain; this pass does not reconstruct every intersection. The existing polygon-junction prototype remains opt-in. No road is shifted or widened to conceal uncertain map evidence. Night lighting was unchanged; this pass was checked in daylight.

Use `?roadAppearance=legacy` to restore previous asphalt, paint trimming and generated-curb appearance. The independently tested contact-selection correction remains active. Removing the flag restores the new default. See [authoring guide](city-visual-authoring.md#shared-road-appearance) for settings and reproduction.
