# Hunter Street Bridge verification - 2026-10-25

Implemented locally in `H:/ChatGPT/Peterborough-Map-Game-Sherbrooke`. No push, deployment or publication. Concurrent facade, editor, business-directory and other work was preserved.

[Open the matched before/after comparison](../test-artifacts/hunter-bridge-20261025/comparison.html) | [Machine-readable measurements](../test-artifacts/hunter-bridge-20261025/summary.json) | [Reference images and observations](hunter-bridge-references-2026-10-25.md)

## Retained improvements

- Joined the two Hunter bridge ways into one bank-anchored deck instead of two independent profiles dipping into river terrain. Both road ribbons and overlapping municipal pavement now use that bounded profile. Immediate approach transitions preserve adjoining street-junction heights; the outer approach roads retain their original elevations. The vertical profile is inferred from existing terrain and connectivity, not surveyed structural heights.
- Kept the exact BR60 municipal outline available in lite mode as a small existing-data snapshot. The same visible faces supply tire contacts. A scoped nearest-ribbon query prevents nearby endpoints from replacing the surface directly beneath a tire; unrelated roads and lower-road height hints retain their existing behavior.
- Replaced plain bridge rails with capped concrete panels/posts, pale-ringed green centers, lamp piers and sloped raised sidewalks. Both sides have outward face orientation. Details use seven shared geometry/material batches and no new textures. Photographs were used as references, not pasted over the bridge.
- Removed the old misplaced generic cylindrical supports. Full arch reconstruction remains deferred, so this is a road and bridge-top improvement rather than a complete bridge model.

Source positions, traffic width, road identities, municipal footprint and gameplay tuning remain unchanged. The surface helper is gated by the two source bridge IDs and named approach IDs; it fails closed when expected topology is absent. This treatment is Hunter-specific, not a citywide bridge replacement.

## Camera and test conditions

Windows desktop, automated headless Chromium with D3D11 requested; desktop 1500 x 950 and narrow lite 430 x 900, daylight. Six viewpoints in each mode cover both entries, eastbound deck, balustrade, river overview and overhead. There is no physical-phone result.

Original pre-edit evidence remains in `test-artifacts/hunter-bridge-20261025/baseline`. Correcting the sag moved the road above some original cameras. The final comparison uses saved corrected-deck cameras in `matched-views-full.json` and `matched-views-lite.json` for **both** `matched-baseline` and `final`; their view definitions were asserted identical. Street views are approximately 2.6 m above the corrected deck. Consequently the legacy view is higher above its sagging road. The earlier `after` folder is intermediate diagnostic evidence and is not the final comparison.

The road audit samples a 471.6 m route, including both approaches, at intervals no greater than one metre. Both travel directions use their right lane and all four real truck tire positions. Pitch/roll below are raw surface-contact measurements, before vehicle visual clamps.

| Mode | Max adjacent ~1 m height change | Max tire pitch | Max tire roll | Final samples with fewer than four tires on-road |
|---|---:|---:|---:|---:|
| full | 0.316 -> 0.053 m | 10.55 -> 2.54 deg | 28.89 -> 1.45 deg | 0 |
| lite | 5.798 -> 0.071 m | 46.33 -> 1.65 deg | 68.96 -> 1.05 deg | 0 |

Final samples never fall through to terrain. These differences include road grade; they are not all instantaneous steps.

The browser-only path follower called the actual `updateFireTruck` at 60 Hz, using the game's input, kinematics, vehicle actor and tire-contact functions. It traversed approximately 445 m at about 29 km/h in each direction and each quality mode. All four crossings completed in about 57 seconds of simulated time with **zero off-road tire frames**. This is a deterministic scripted smoke test, not a human road test or a GPU benchmark. Full-mode maximum per-tick sampled surface change was about 6 mm; lite retained a roughly 4.2 cm maximum at a surface transition. The final raw driving pitch stayed below 2.54 degrees/full and 1.68 degrees/lite; driving roll stayed below 1.06 degrees.

## Performance and resources

Sequential GPU captures prevented worker competition. Same cameras, resolution, quality and daylight were used. Per-view details, including draw calls and frame percentiles, are in `summary.json`.

| Mode | Worst paired draw-call increase | Renderer texture count | Renderer geometry count at first view | Ready observation before -> after |
|---|---:|---:|---:|---:|
| full | 2.80% | 15 -> 15 | 966 -> 966 | 56.23 -> 51.43 s |
| lite | 4.28% | 4 -> 4 | 378 -> 357 | 10.54 -> 10.76 s |

The worst draw-call increase is within the 10% pilot budget. Median animation-frame intervals remained approximately 16.7 ms, within the 20% comparison budget, but these are display-capped timings and do **not** prove unchanged GPU execution cost. Loading numbers are individual local observations and vary with compilation/cache state; do not present them as a measured loading speedup. Texture counts did not increase, and the new bridge code creates no image textures, so its additional texture payload and estimated new texture memory are zero. Total GPU memory bytes were not measured. Renderer geometry counts are object/upload counts, not byte estimates.

All captured runs reported zero console/page/HTTP errors.

## Verification performed

- 14 focused tests: source/topology guards, full/lite recorded terrain fixtures, terrain clearance, preserved adjoining/outer joins, exact BR60 snapshot, scoped gameplay selection/underpass preservation, deterministic geometry, traffic clearance, sloped sidewalks, continuous lamp spacing, ornament placement, and real Three.js raycasts of both parapet and walkway faces.
- Existing road network, terrain-clearance, official-road-data, vehicular-bridge-use, official surface index, citywide road-quality and gameplay-system suites passed.
- JavaScript syntax checks and `git diff --check` passed. Existing unrelated line-ending warnings were not modified.
- Full/lite browser captures and both-direction scripted crossings passed. Actual source and result pixels were inspected; broken intermediate ornament placement and reflected face winding were corrected before final capture.

## Independent review

One GPT-6 Sol Medium deep reviewer read the focused app changes and new helpers/tests, compared actual matched before/after images, and checked the road/performance evidence. Its final verdict was:

> No blocking driving or code issue found. Paired captures show a smooth deck and improved parapets; full and lite crossings completed in both directions with zero off-road frames. The east approach still has an abrupt sidewalk end, and the central arch remains unmodeled.

## Remaining limitations and fallback

The east approach's pale sidewalk still ends as an abrupt overhanging slab over the embankment outside the driving lane. The main open-spandrel arch, ten approach arches and accurate springer locations need more grounded structure/placement evidence. Nearby Quaker massing, some riverside paths and terrain remain simplified. These are explicitly unfinished visual details; the game is not a surveyed bridge reconstruction.

Use `?hunterBridge=legacy` to restore the prior bridge surfaces and appearance for comparison. The [authoring guide](city-visual-authoring.md#hunter--ashburnham-bridge) records the source files and recipe. The helper's dimension estimates can be tuned in one file; do not transplant Hunter dimensions onto other bridges without their own source IDs, footprint and reference evidence.
