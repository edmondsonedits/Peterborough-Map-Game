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
