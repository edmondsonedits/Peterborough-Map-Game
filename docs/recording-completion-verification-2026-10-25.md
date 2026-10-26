# Recording collection completion review — 2026-10-25

Five further building corrections and shared surface colours are implemented locally. **The full request is not complete:** the Cricket Place houses still need exact footprint matches, the separate October 19 residential collection lacks a location, and some catalogue elevations are hidden or absent. This report does not equate an inventory entry or an existing profile with a completed reconstruction.

[Open the matched before/after comparison](../test-artifacts/recording-complete-20261025/comparison.html). [Earlier eight-site photo/garden pass](recording-visual-verification-2026-10-25.md).

## Retained changes

| Target | Implemented change | Remaining limitation |
|---|---|---|
| R02, way/1009651246 | Pale 0.8 m stone-base band below the windows | Existing opening layout remains simplified |
| R06, way/1009651260 | Entrance aligned with the existing canopy | Projecting glazed corner not reconstructed |
| R08, way/1009651262, Showplace east wing | One central upper arch; neighbouring windows remain rectangular | Tall arch is an approximation of the photographed opening/transom |
| R10, way/995887447, Robinson Place | Taller separate ground panes, retaining masonry between them | Canopy and complex upper massing remain simplified |
| R18, way/1006243553 | Arched top-floor openings from the tall brick section | Existing cornice and lower-floor approximation retained |

Shared `recording-surface-appearance.js` settings make eligible parking asphalt more neutral, reduce the green cast of paths, and mute grass, park and residential-ground defaults. They do not add or relocate parking, kerbs, paths, vegetation or scenery objects. Custom colours remain authoritative. This applies through existing shared materials across the city; visual verification was limited to the captured areas.

The new reusable opening geometry uses instanced trim/glass batches, with per-floor or per-slot profile selection. No additional photograph, texture map, reflection system or building massing change ships in this continuation. The first pass's two small photo crops and garden settings remain intact.

## Coverage and unresolved work

The corridor audit covers all 51 catalogue entries: 35 broadly represented, 8 represented with limitations and 8 without a usable separable recorded frontage. Five of the represented entries receive the corrections above. These are review dispositions, not 51 completed accurate buildings. The 55 frontage baseline captures were examined in contact sheets; some are foliage-obscured.

The main local collection contains 2,838 dense flattened views (473 times, two lenses, three directions), plus 330 detailed corridor exports, 64 priority exports and 128 overview exports. These overlap in time and content. Contact-sheet coverage and selected source pixels were inspected; **not every exported frame was individually inspected or mapped to every visible object**. The 51-entry corridor audit records 39 individually reviewed source views. The outer audit records selected early/late frames and three full-resolution samples from the separate collection.

| Unresolved group | What is established | What is needed |
|---|---|---|
| Late October 18 houses | Repeated landmarks, readable Cricket Pl sign and local road topology establish a Cricket Place outbound/return trip and the western Driscoll junction | Exact house number or reliable image-to-footprint tie; candidate ways 1015118664/8665 remain unconfirmed |
| Separate 104-image collection | Comes from October 19 footage, two short passes; useful flattened residential references | Street/location or georeferenced pose; its reconstruction coordinates do not locate it in the city |
| Rear/obscured catalogue targets | ways 1009651245, 1009651258 and Galaxy Cinemas 458496270 lack an independently resolved elevation | A clearer view of the actual target |
| Unrecorded/behind-corner targets | ways 945902906, 1005977949 and 1005977950 are outside the recorded elevation | A view of the missing frontage |
| Roof-only targets | ways 930494669 and 945902121 are a shelter/outbuilding, not a recorded solid facade | No facade photograph is applied |
| Walmart/Chemong sites | Walmart pylon, parking and nearby Shoppers match; asphalt/curb/planting observations retained | Clean individual facade evidence before a custom Walmart frontage; site boundaries remain authoritative |

No hidden architectural detail, individual tree location or parking layout was inferred from these gaps. Original source images remain outside shipped assets. The separate collection and the route are not described as unusable; they are awaiting matching.

## Verification and performance

Checkout: `H:/ChatGPT/Peterborough-Map-Game-Sherbrooke`, branch `codex/sherbrooke-existing-city`. Concurrent work was preserved. No commit, push, deployment or publishing was performed.

Before runtime edits, 70 views were captured in full and lite; two additional site views were captured separately before the ground changes. Final capture repeats those 72 cameras at 1500 × 950 full and 430 × 900 lite. Street cameras use 2.6 m altitude, the same day lighting and the same quality flags. Views cover Station 1/Sherbrooke, Water/Hunter commercial frontages, existing house/porch and storefront oblique controls, residential surfaces and selected Chemong/Walmart surfaces. A separate night check and brief truck movement check passed in each mode. This is a brief smoke test, not a complete driving route or physical-phone test.

| Measurement | Full before → after | Narrow lite before → after |
|---|---:|---:|
| Maximum draw calls across original matched traversal | 1596 → 1597 | 1333 → 1334 |
| Worst matched-view draw-call growth | 0.72% | 1.82% |
| Median frame interval | 16.7 → 16.7 ms | 16.7 → 16.7 ms |
| Texture objects, first view | 15 → 15 | 5 → 5 |
| Texture objects, last of original 70 views | 38 → 38 | 35 → 35 |
| Added resident geometry objects after traversal | +2 | +2 |
| Shader programs after original traversal | 88 → 88 | 53 → 53 |
| Observed ready time | 51.369 → 51.432 s | 10.771 → 10.629 s |

The <=10% draw-call and <=20% median frame-interval budgets pass for every matched view. New image download and estimated texture storage are both zero. Existing total VRAM and GPU execution time were not measured. RequestAnimationFrame is display-capped near 16.7 ms here and does not prove spare GPU capacity. Loading figures are single local observations, not a statistical speed claim. The two extra site baselines had different resource-warming histories; they are not used for traversal allocation comparisons.

Both browser reports contain no page, console or HTTP errors, and driving mode/movement checks passed. Twenty-seven focused tests passed, covering source/audit consistency, profile precedence and immutability, massing/roof/frontage preservation, arch geometry and slot replacement, legacy/failure fallbacks, photo hashes and existing frontage behaviour. JavaScript syntax and `git diff --check` passed. Existing shader, business-sign and unrelated gameplay changes were not rewritten.

Evidence: [performance comparison](../test-artifacts/recording-complete-20261025/performance-comparison.json), [full report](../test-artifacts/recording-complete-20261025/final/full-report.json), [lite report](../test-artifacts/recording-complete-20261025/final/lite-report.json). Capture script: `test-artifacts/recording-complete-20261025/capture.cjs`; fixed cameras: `views.json`; summary/comparison: `summarize.mjs`. Run captures sequentially. Preserve `baseline/` and `baseline-sites/` when making further edits.

## Independent review

One GPT-6 Sol Medium `deep_reviewer` examined the focused implementation, original images, actual full/lite before/after captures and performance evidence. It blocked the pilot for R16/R19 arches copied from neighbouring elevations and the R02 plinth overlapping windows. Those proposals were removed or corrected; R10's continuous glazing was also replaced by separated bays. The corrected views were recaptured. Final scoped verdict: **no remaining blocking defect in the affected full/lite views**. This is not approval of the entire city, a precise reconstruction or the unresolved house matches. R08 and R10 simplifications remain explicit.

## Reuse and fallback

See [the authoring guide](city-visual-authoring.md#completing-the-recording-reference-collection). Edit a compact reviewed appearance entry, preserve explicit profile values and add its source path/hash/observation to the audit. Per-slot overrides avoid transferring one distinctive opening onto every bay. Shared ground colours only replace known defaults.

`?recordingExpansion=off` restores the pre-continuation appearance while retaining the earlier eight-site pass. `?recordingReferences=off` disables both recording passes; `?visuals=legacy` retains the broad legacy path. Missing photographs retain procedural details. The comparison page was browser-checked with both images loaded, and a separate narrow-lite browser check confirmed `recordingExpansion=false`, `recordingReferences=true`, no palette changes and no errors. Its three fallback images and report are under `test-artifacts/recording-complete-20261025/expansion-fallback/`.


## Subsequent route/address confirmation

The user subsequently confirmed the Hunter Street East bridge → north Driscoll Terrace → east Cricket Place route and identified the recorded porch house as 22 Cricket Place. Official parcel geometry has now anchored that house and its immediate neighbour at 24 Cricket Place to their OSM footprints. Two bounded facade appearances were implemented locally; see [the Cricket continuation verification](cricket-visual-verification-2026-10-25.md). Other provisional houses and the separate October 19 collection remain unresolved. This update does not relabel the earlier complete collection as finished.
