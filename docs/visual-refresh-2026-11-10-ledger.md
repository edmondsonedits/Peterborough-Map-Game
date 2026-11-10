# Visual refresh ledger — 2026-11-10

Plan: docs/superpowers/plans/2026-11-10-visual-refresh.md
Work branch: codex/visual-refresh-20261110
Window: 2026-11-10 02:37–10:37 UTC (21:37–05:37 America/Toronto)
Status: resumed four-hour pass active; see latest checkpoint below. Earlier window superseded.

## Resumed run — 2026-11-10 14:57 UTC

Danny renewed the task for four hours, through 18:57 UTC (13:57 America/Toronto). Earlier scheduled runs have no verifiable code output. Workspace maintenance removed uncommitted edits; only the plan commit `4da1b86` survived remotely. This run recovered the current branch, all 300 handoff photos, the two registers, the embedded 21-file patch and both licensed resource ZIPs.

Current ownership: one route implementer owns app.js and the Chemong facade/appearance path; a separate material implementer owns station2-neighborhood-facades.mjs and shared wall assets; QA owns the capture harness and browser workflow; a read-only reference agent checks matching/direction. Root integrates, reviews, versions and checkpoints. Do not start another overlapping writer while this run is active.

First route batch: Walmart/Chemong through Mason Avenue; Reid is next. The old patch is not applied wholesale: current app.js and release normalization contain newer gameplay/world fixes. The old route data is absent and will be merged in bounded reviewed subsets. Ultramar open canopy requires a later visual/collision access review. Cricket 22/24 photo captions conflict and remain unresolved.

Local Chromium still aborts on ProcessSingleton socket EPERM before rendering. Use GitHub PR CI for matched baseline/current Balanced/Lite captures, including actual current cab views. No new visual quality or deployment has been approved.

Research: official Three.js color-management, textures and Optimize Lots of Objects manuals checked again. Preserve sRGB color inputs, bounded texture dimensions and existing material/geometry batching. Bricks101 is a better neutral candidate than dark/weathered Bricks003 based on measured source pixels and the licensed Kenneth Avenue reference; physical repeat calibration will be recorded as an estimate.

## Baseline

## Candidate v1.6.202 — 2026-11-10 15:17 UTC

First code candidate: 16 Walmart/Chemong/Mason records (15 newly active profiles), optional façade renderer details, Walmart replacement decoration, deduplicated verified shop names, two CC0 wall color sources and matched baseline/current capture tooling. Root owns integration; first-batch writers have released their files. Reid reference review is preparing the next bounded batch. Production is still v1.6.201 until review and deployment succeed.

Independent review corrected unsupported pale-wall recipes, uninitialized appearance-only roof materials, random tint overriding reviewed walls, roof/HVAC classification leaking from appearance keys, gable-wall color assignment, unnecessary Lite source downloads and Walmart screenshot readiness. Geometry/collision paths remain unchanged except for moving existing reviewed gable triangles into the correct wall material batch. No new road-side obstruction is placed.

Checks: full suite passed 1,581 tests before the final gable/helper integration; 52 focused integration/appearance tests passed afterward. New integration tests execute the actual app assembly with source and annotated profiles to compare roof/HVAC geometry and verify material/UV resolution. Final whole-suite and CI browser captures are pending. No visual approval yet.

The source texture opt-out is `?wallMaterials=procedural`. Lite uses the procedural mode without downloading unused wall sources. Source mode retains four shared 256-square GPU maps. The new `?qa` API can place the actual active vehicle for cab review; it is guarded against multiplayer, editor and station transitions.

## Original baseline notes

- Production v1.6.201; dedicated fresh clone, clean before work.
- Existing ordinary buildings use four shared 256-square canvas wall textures, meter-scale UVs, deterministic tinting and spatial/material batches.
- Reviewed/user-photo facades and custom facilities have existing precedence and suppression paths; preserve these.
- Original user footage on H:/ChatGPT is absent here. Packaged user crops under city-explorer/assets/sherbrooke-frontages and recording-frontages are available for inspection.
- Initial broad Node invocation finds missing fresh-checkout packages; targeted facade baseline passed 52 tests in the audit agent.
- Local Chromium Playwright startup currently fails due to sandbox socket/ProcessSingleton restrictions. QA agent is checking the available browser and CI fallback. Do not claim visual approval until images are captured.
- CLI GitHub push has no credentials; authenticated GitHub connector has push/admin permissions and is the supported checkpoint route.

## Initial priorities

1. Shared CC0 brick/render surfaces and respect for known building material tags without altering roof decisions.
2. Source-supported appearance corrections using accessible owner photos.
3. Better street-facing storefront glazing through the existing bounded facade system.

## Decisions

- Continue autonomously under Danny's explicit instruction; routine design/reversible edits do not need repeated confirmation.
- Maintain original source image files; use the existing canvas/material mechanism to bound GPU map resolution.
- Full validation and independent review precede quality approval; passing unit tests alone is insufficient for a visual upgrade.


## Candidate v1.6.203 — 2026-11-10 15:32 UTC

Adds six independently matched Reid profiles (Jiffy Lube, two Parkhill houses, Edinburgh NW/SE and the duplex north of Dublin). The full suite passed 1,590 tests. The first browser run reached Chromium rendering but its harness waited on the wrong Walmart runtime key; the catalog-key mistake is corrected and checked by the new `--validate-config` command. It was a capture failure, not visual approval or a confirmed scene failure. New capture plan covers 26 sites, all 22 active route IDs, unchanged controls, both graphics qualities and actual cab views.

Later work remains separate: the old Walmart island/row coordinates are being corrected against owner photos and provincial aerial imagery; the two distinctive Chemong roof proposals are under implementation. The Ontario mosaic acquisition date is unknown and the 2026 owner photos take precedence where the visible scene changed. No production release yet.

## Candidate v1.6.204 — 2026-11-10, active primary pass

The route now contains 37 reviewed source IDs through Water/Hunter: the original 16 Walmart/Chemong/Mason sources, six Reid additions, eight Sherbrooke records and seven Water records. Water includes four adjacent verified Nordia faces and the two enclosed cream bay façades. Other changes are the audited Walmart parking rows/H1 tree, two bounded Chemong roof refinements, source-height fascia fixes and removal of unsupported stone lamp pedestals from Hunter bridge. Implementation and reference documents distinguish observed features from estimates and remaining massing discrepancies.

Actual v203 Lite screenshots exposed a P1 regression: disabled footage fronts still suppressed directory names. That candidate failed review. v204 retains the finite reviewed route frontages in Lite while omitting photo downloads and gardens, and directory deduplication now requires actual attached signage metadata. Walmart's verified replacement decoration is available in both profiles. Shared source-wall JPG downloads remain disabled in Lite. A narrowly verified LCBO photo-lettering annotation is included only after its actual crop loads successfully.

The old `eye` capture request was measured at 5 m AGL because fly controls clamp altitude; it is now called a raised-fly view. Separate current cab images use the real vehicle camera. v203 has 52 matched Lite raised/oblique pairs and 26 current cab images; Balanced was cancelled after 49 baseline images when an automated asset/docs checkpoint advanced the branch. There are no v203 current Balanced images and no claim of matched before/after cab images.

The new capture plan has 48 sites, 37 route sources, current cab images, >5 m ordinary-input driving, ground unload/reload checks, actual-sign consistency checks and unchanged controls. Independent per-cohort jobs preserve evidence; workflow concurrency uses exact head identity so a later documentation commit cannot cancel a running capture. No visual quality approval or production release has occurred. The current primary writer remains active until 18:57 UTC; scheduled follow-ups must remain read-only while that ownership is active.

Independent code review passed 45 targeted checks for ground lifecycle, roofs/material resolution, source-height bounds, Lite signage, enclosed bays and bridge lamps without a new blocking defect. Final normalized whole-suite results and exact-head screenshot review will be recorded after the checkpoint. East City/Cricket changes are a separate next batch and excluded from this candidate.

v204 checkpoint: `f7d96109db18058c425a767976899a5f34a5f55c`, immutable tree `50e633bac7dd9505838eb3b7d1967ca5460d278e`. The full isolated suite passed **1,656/1,656** after adopting the newest coherent generated map/world identity. The regenerated OSM elements and road tile geometry were unchanged; metadata identities were refreshed by the existing asset workflow. Browser run `42855146899` started on this exact head. Its captures remain in progress, not approved.

## Candidate v1.6.205 — next route and visibility batch

Adds 12 independently matched East City buildings (14 faces), corrects the existing Cricket 22/24 photo associations, and fixes the pre-existing Lite floating-roof defect. The two Cricket addresses retain their original source IDs; the conflicting earlier photo identification is preserved in the evidence record. The current route registries cover 49 source IDs plus the two separately composed Cricket records.

Actual v203 cab evidence showed a target only17 m from the camera losing its walls because the center of its1,800 m render cell was1,167.75 m away, beyond Lite's1,050 m wall radius. The correction uses distance to cell bounds and refreshes nearby visibility per120 m camera cell. Tests first reproduced both visibility failures, then passed with the fix. Independent code review found no blocker but requires empirical draw/triangle/frame checks because this shared helper also influences roadside detail eligibility.

The v205 capture plan compares against the immutable v204 head, using25 poses in both qualities:16 changed East City/Cricket faces and9 regression views. Both revisions support the real cab hook, so this pass includes matched before/after cab views. Shared material sources/shaders are unchanged; their v204 evidence is reused with that attribution rather than claimed as a new material comparison. No new visual approval or production release yet.

Ultramar's closed canopy, erroneous pavement cutout and conflicting Husky name have been audited. Separate implementation modules and tests are being prepared, but they are excluded from v205 until the normal full road/world rebuild and contact checks can verify the correction. Do not activate an open canopy over the existing unpaved source hole.


## Candidate v1.6.206 — corrections from actual driver-seat review

v205 checkpoint is `1311f758366b1031b10a287cdf473a27b8bfd678`, tree `ade380eaee2f996e34d85f239a314bb646262963`, with **1,673/1,673** tests passing in an isolated checkout. Its exact-head capture run is `42859272929`. v204 actual Balanced captures exposed undersized storefront lettering, a lost photo-asset policy in Balanced, the tall R077 bungalow and elevated R078 porch, and weak reviewed masonry contrast. The independent pixel review remains a rejection pending corrections and fresh images.

This candidate fits native canvas glyph bounds into the existing sign panels, separates optional photo assets from lightweight geometry budgets, excludes only inferred windows overlapping an existing implicit door, and opts reviewed brick into a filtered mortar cue while leaving all generic shader variants unchanged. The two Reid display envelopes retain their exact source footprints and explicit source-tag precedence. R077 uses a documented low hip estimate; R078 uses its verified frontage terrain datum. Source dimensions, terrain, station heights, vehicle behavior and collision rules are not rewritten by those visual estimates.

The audited Ultramar pavement cutout is corrected only in full source generation, before semantic indexing and tessellation. Compiler proof requires all 25 source-footprint/support samples to belong to parking feature10/99 and final rendered contact; final optimized/paint-finished packets are decoded and independently rechecked. The open-canopy module is present for geometry/probe validation but is **not activated** yet. Old packs lack the required receipt. A full CI road/world rebuild remains necessary; no flat decorative cover or `--finish-existing` substitute is used. The conflicting business identity and actual canopy activation stay in the next candidate.

The fast visual loop uses12 poses, three cohorts, exact v205 before/current in both Balanced and Lite, with matched oblique and real cab images. It checks native sign readability, loaded S10 photo in Balanced, procedural S10 fallback in Lite, source-faithful brick contrast and both Reid silhouettes. This loop does not claim a continuous route drive or repeat the v204 Walmart unload/reload test. Final isolated test count, rebuilt-ground receipt and fresh pixel conclusions will be recorded after verification.


## v1.6.207 — preserve current main and resume CI

The separate main update `060b4a5b` (v1.6.202 lifecycle ownership and stable world identity) landed while this visual branch was active. Its release-token conflicts made the PR unmergeable, so GitHub did not create pull-request workflow runs for v206. This is distinct from the v205 asset compiler, which completed but could not push after a later documentation commit advanced the branch.

v207 merges current main into the exact v206 visual candidate. The 46 conflicts were resolved by normalizing only the differing release tokens in all three merge inputs, then performing an ordinary three-way merge. No semantic conflicts remained. Main's lifecycle, feedback, inventory, normalizer and world-identity changes are retained. No pending canopy activation, Water marker, new Sherbrooke or new East envelope work is included. The review-206 capture plan stays in place.

Validation in the isolated merge checkout: **1,753/1,753** main tests, **71/71** editor checks, valid state inventory (152 workflows), clean syntax/whitespace, and an actual multiplayer-world export with **no world-data diff**. The existing road/world identity remains unchanged by this reconciliation. Visual source/cab approval remains pending; current main's independently published lifecycle release is separate from this draft visual work.

## Candidate v1.6.208 — geometry corrections and ground ownership

The separate publication task merged the frozen v205 checkpoint and lifecycle fixes into main `3431d076` through PR82. This does not establish live deployment. An isolated merge with the visual branch was checked: after resolving only release-token conflicts and retaining the newer sign-fitting import, its tree is byte-identical to v207 (`edf948d36c16cc92995a593db08f7ceea16450eb`). v208 records main as a second parent, preserving that work without rolling back this branch's corrections.

Actual v207 source compilation rejected the canopy-ground report before export. Investigation found that municipal `appendOfficialRoadPolygon` emitted final triangles without retaining a source range; `finishRoadSurfaces` consequently assigned an empty source ID. The new range is restricted to the exact corrected parking feature10/99. Assigning ranges to every municipal surface would disable the existing optimizer's source-unaware simplification, so unrelated surfaces retain their prior policy. The strict source/packed ownership, grade, tile-hash and build-identity checks remain in place. Compiler reports now retain bounded contact diagnostics for a failed build.

The canopy renderer is receipt-gated. A valid final packed receipt or finished source proof permits the open slab, four estimated posts and one photographed southwest Ultramar wordmark; old/unverified packs keep the source shell. The source path queues the canopy until final pavement exists and drains it once. Actual commit tests cover both quality profiles and one attached identity. There is no claimed ground-contact or canopy visual approval before a complete rebuild and fresh cab/underpass capture.

The five Sherbrooke display envelopes, Circle K flat cap, two shallow Cricket hips and Driscoll split eaves now use narrowly reviewed visual geometry while retaining mapped footprints, source dimensions and explicit-tag precedence. Driscoll's low wing and higher north section exactly partition its eight-vertex footprint; no full-height internal divider or generic whole-height openings are added. Documented estimates remain separate from photo observations. Thrive's directly observed three-part lettering publishes one business identity only after complete attachment. Water Street directory markers are placed below the actual enclosed bays only for the two exact audited rows; these are identified as estimated educational markers, not observed sign locations. Malformed marker bands reject atomically.

New v207 Balanced pixels confirm legible KFC/Little Caesars lettering and the stated R077 low-bungalow/R078 porch-datum corrections. The independent Reid reviewer approved only those two bounded corrections in those four views; full likeness and Lite approval remain separate. Exact v205 Lite regression pixels confirm the nearby-wall visibility repair, with unchanged camera transform, draws371→384 and triangles1,232,564→1,336,012. That wall is still plain in Lite. SwiftShader frame times are not a phone/device benchmark.

The v208 review plan uses18 mapped poses in four cohorts, exact v207 before/current, cab and oblique views in both qualities. It adds canopy contact/underpass checks, corrected Sherbrooke and Water faces, Circle K, Cricket, Driscoll and an east-looking bridge cab. Failed viewpoints retain their image/receipt and do not count as successful coverage; later independent views continue. This is a targeted correction review, not a claim that every photo or route detail has been perfected.
