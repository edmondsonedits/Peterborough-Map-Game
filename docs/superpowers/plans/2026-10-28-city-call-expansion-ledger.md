# Execution ledger — city-call-expansion

Approved spec: Astra-Six-Hour-City-Calls-Prompt.txt. Plan: 2026-10-28-city-call-expansion.md.

Start: 2026-10-29T03:26:53Z. Deadline: 2026-10-29T09:26:53Z. Base revision: 384d0973dbaff384709ac0e34f542c8dda84f574. Isolated clone/branch: codex/city-calls-20261029.

## Ownership

- root: shared integration decisions, canonical catalogue builder/data, route augmentation, release and delivery.
- baseline_inventory: read-only counts and data-flow/baseline audit; scratch call-session/baseline.
- bulk_location_sources: official licensed datasets; scratch call-session/official-sources.
- osm_location_sources: OSM PBF/address/boundary extraction; scratch call-session/osm-sources.

## Progress

- Repository cloned; no pre-existing tracked edits. One untracked terrain transfer temporary file from clone is unrelated and will be left alone.
- Baseline Node test run completed: 783 tests, 764 passed, 19 failed. Full log: call-session outside repository (baseline-tests.log).
- Preliminary production inventory: 33 cities, 606 eligible production bases (400 Fire / 206 EMS), 800 canonical Geo points, 3630 station route assignments. 3082 mapped intersections and 548 sourced-address exercises. Full ledger pending independent inventory report.
- Official worker investigating Statistics Canada licensed open facility inventories. OSM worker acquiring one cached Ontario PBF rather than repeated city requests.

## Decisions

- Preserve current route and Geo IDs; add canonical supplementary locations to existing training descriptors to avoid fragile duplicate catalogues or live API dependencies.
- Baseline suite failures do not block independent research/data work under the authorized prompt; all task-affected tests must pass and unrelated failures must be disclosed.
- No claim of six-hour persistence beyond actual session execution. Checkpoints are resumable records, not a background scheduler.

## Integration checkpoint — 2026-10-29

- Official and OSM acquisition pipelines are copied to `tools/call-sources/official` and `tools/call-sources/osm`; raw provincial extracts remain outside the repository. The OSM snapshot is 2026-10-28T21:21:02Z. Both source bundles passed structural validation; that is not a claim that every named institution is currently operating.
- Shared supplemental-catalogue runtime and saved-edit migration are implemented. Independent review caught missing recognition-tier validation; the correction passed focused tests.
- Canonical city selection is being regenerated after review caught directional continuations used as cross streets. Additional corrections separate outdoor call types, ordinary house categories, and per-service recognition coverage. `canonical-catalogues-final` is superseded; only the forthcoming reviewed outputs may be integrated.
- New Belleville and Scarborough Geo packs preserve all 19 legacy base IDs and numeric selectors. Scarborough adds 17 active bases, reaching 17 Fire / 12 EMS. Registry Geo capability is enabled on this isolated branch; new call data and route profiles are still pending. Full Scarborough Fire run areas have been installed. Belleville display/training northern bound expands to include the existing Hoskin hall.
- Belleville Farley EMS source point was approximately 917 metres from the prior point. All seven Belleville bases now have sourced footprint points in the new pack; preview alignment and route recalculation are pending.
- Ajax pilot generated 24 first-due and six support exercises; all 54 combined routes and onward origins passed. A Toronto pilot exposed excessive retained build-time memory; the worker is reducing retained routes/index arrays before another guarded run.
- Browser capability is available through a temporary Chromium test binary. A local server and browser must run in the same execution namespace. A successful local launcher navigation was observed; all-city gameplay QA is pending data integration.
- Independent current-roster and priority-site audits cover two disjoint sets of 16 cities. Potential stale named facilities are being quarantined or corrected only with source evidence. Unsupported Dispatch capability remains unchanged.

## 04:22 UTC checkpoint

- The shared release marker is now **1.6.151** (one patch above initial 1.6.150), normalized using the existing release script. Thirty release checks pass. Upstream `main` remains `384d0973dbaff384709ac0e34f542c8dda84f574` as last fetched. CLI push has no credential helper; the connected GitHub repository reports push access and will be used for final branch publication.
- Belleville retained 41 original exercises and retired/replaced one outside the revised first-due catchment. Scarborough retained 67 original exercises and retired/replaced five after its roster expansion; 102 further exercises cover the 17 added bases. All 216 resulting routes and onward origins passed exhaustive audits. Reconciliation preserves valid IDs and uses new IDs for changed destinations. A dedicated scratch-only reconciliation tool and two focused tests are included.
- Guelph EMS 12 at 34 Gordon Street is retained as a record but withheld from selection: a September 14 attributed temporary-relocation report conflicts with the undated official roster. This is a disputed current operating location, not a permanent-closure claim. Six associated exercises were retired with an explicit reason. There are now **622 selectable bases**. Other two Guelph EMS bases remain available.
- Refreshed all 65 Ottawa base evidence URLs after the official GIS renumbered its object IDs; canonical IDs and coordinates were preserved. The old/new mapping is retained in `cities/ottawa/base-source-review.json`.
- Current roster and selected priority-site evidence is in the scratch audit ledgers; the stable 68-record review sidecar is integrated into both portable source pipelines. Confirmed moved/closed/misclassified selected sites are quarantined or corrected without inventing replacement coordinates. The currentness sample is purposeful and does not establish a statistical error rate or prove all facilities open.
- Canonical builder now fills the shared Fire/EMS tier targets without counting EMS-only homes. All 32 candidate city outputs reached the target before independent auditing. The audit found numeric road references treated as street names in 40 accepted records across eight cities; those cities plus Guelph are being regenerated. Only individually audited outputs are eligible for final integration.
- Static geometry audit: all 623 then-active bases were inside game rectangles; 618 bases in the 32 supplied municipal polygons passed polygon membership. Peterborough's five have no polygon in that source bundle. Belleville alone materially clips its municipality (about 44.83 km² north and 1.72 km² east). Its roads stop before the northern township. A bounded extract refresh from the cached PBF is underway before expanding bounds to north 44.35 / east -77.23.
- Civic route generation now ranks using compact directed-cost/distance matrices, then validates provisional selections with actual trace/finish/onward checks and reselects failures. Ajax remains byte-identical and builds in about 3.4 seconds instead of about 29 seconds. The optimized Toronto benchmark is still pending a coordinated memory window. A sub-centimetre support-cap edge case is under review.
- Actual browser smoke at v1.6.151 passed six Peterborough cases: Geo Fire/EMS, Route Fire/EMS, and desktop/mobile EMS pickup/transport/handover. Map tiles and route/GPS fixtures are explicitly disclosed; this is UI/state-machine evidence, not a field drive. Full all-city/browser and independent route audits remain pending expanded data.

## 05:07 UTC checkpoint

- All 32 non-Peterborough supplements have passed source-point, source-road, municipality and clue checks. The initial 6,364 additions are integrated; a subsequent independently reviewed 337 priority facilities are also integrated in 31 cities. The priority additions retain their accepted source records and full provenance. Route regeneration for that second pass remains pending.
- The shared-store and station-roster compatibility review found and fixed a saved-number collision: new official stations no longer discard an entire valid saved custom-base delta. Stable custom IDs, unrelated edits and deletions survive; conflicting presentation numbers receive deterministic reassignment with conflict metadata. Independent bounded rereview passed 72 focused tests.
- Eligible bases now total 622 (411 Fire / 211 EMS): Scarborough adds 17 active researched stations; disputed Guelph EMS 12 is retained for inspection but withheld from selection pending an authoritative resolution. No replacement annex coordinates were invented.
- Exhaustive directed-route audits have passed the initial expanded output for every city. Toronto has 1,679 exercises across 133 bases and Ottawa 790 across 65. Six Toronto, five Ottawa and one Kingston legacy assignments were retired after measured ownership violations; valid old destinations retain their IDs. Belleville retains all 42 post-roster-correction IDs through its road refresh, with current junction-way evidence.
- A support-selection regression admitting Fire Investigation incidents was caught by the independent auditor and fixed; only Structure Fire incidents can receive support assignments. A retry runner initially overwrote four scratch descriptors with audit reports; the integration guard rejected them, and separate output directories plus before/after hashes now protect the recovered outputs. No production descriptor was overwritten by a report.
- Node regression run `node --test tests/*.test.cjs tests/*.test.mjs`: 941 tests passed, zero failed, before the final priority route pass and any Dispatch prototype integration. The updated Geo integration tests cover 132 desktop/mobile sessions and 1,866 base/tier starts.
- Twelve representative real-browser Geo/Route cases passed. Additional active-game captures verified loaded real map tiles and call cards on Belleville desktop Fire and mobile EMS; Route captures include the production reference overlay. The full final browser matrix remains pending.
- Toronto targeted sources are under bounded review. Station 51 has independently validated candidate options; Island source points that snap to unapproved roads remain rejected. Any isolated-road clue exception must be explicit and must preserve the approved road-access constraints.
- A separate scratch-only Dispatch prototype is exploring reuse of the existing engine for Belleville scene-response missions. It is not yet enabled or an accepted production capability. Peterborough remains the sole full mission/transport city until end-to-end checks and independent review approve a bounded change.
- Version remains 1.6.151, one patch above the actual baseline. Branch remains isolated. Connected GitHub write access has been verified with unattached blobs; no remote branch, commit, PR, merge or live publication exists yet.
- Read-only Dispatch feasibility confirms that the other cities require real loader, roster, arrival, service, history and EMS scene-only work. Merely changing flags would be incorrect. Current six preview cities remain free-driving and Peterborough retains actual transport Dispatch.

## Final acceptance checkpoint

- Final release: **1.6.151**, one patch above the unchanged upstream baseline 1.6.150. Current acceptance time: 2026-10-29T06:49:17Z; authorized deadline remains 09:26:53Z. The six-hour period is a maximum work budget, not a claim that six hours elapsed.
- All 33 city recognition catalogues meet 100 easy / 50 medium / 50 hard. There are 7,882 city-scoped canonical locations and 8,118 station exercises across 622 selectable city/base entries (411 Fire / 211 EMS). Toronto/Scarborough overlap intentionally; these are not unique physical-station counts.
- All 615 non-Peterborough mainland bases meet 12 distinct local destinations and six new civic first-due exercises. Each of the two Toronto Island bases has its three existing intersection drills and one approved reachable civic drill. Peterborough retains its five-base reference catalogue and existing hospital workflow.
- Six former Dispatch previews now support station-local Fire/EMS scene missions without hospital transport. The other 26 cities remain Geo/Route-only. Modeled access, estimated catchments, the Island emergency-road exception and unenforced simulator one-way/turn rules remain explicit.
- Final Node suite: 977 passed, 0 failed. Final directed audit: 33 cities, 622 profiles, 8,118 routes and 8,118onward origins, 0 failures. The all-city Geo/Route browser matrix passed 144 cases; 22 affected-city/final-core cases additionally cover all eight EMS top-ups and Peterborough transport. Final six-city scene browser suite passed 33 cases and 199 base checks.
- Independent review caught and resolved the Island civic filtering omission and premature station-exit connector cancellation. Native keyboard-driven Fire Station 3 and EMS Base 01 Belleville journeys completed on the final collision core without injected positions. Broader mission arrival tests remain explicitly position-injection fixtures.
- Source archives, exact checksums, per-record provenance, coverage ledgers and compact validation artifacts are included. See [final validation](../../city-call-validation-2026-10-29.md) and [coverage](../../city-call-coverage-2026-10-29.md).
- The unrelated terrain transfer temporary file remains untracked and excluded. Draft-PR publication is the authorized next step; main merge/live deployment is not part of this checkpoint.
