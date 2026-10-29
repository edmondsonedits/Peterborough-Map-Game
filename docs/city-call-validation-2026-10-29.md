# City-call validation — 2026-10-29

Release **1.6.151**. Authorized session window: **2026-10-29 03:26:53–09:26:53 UTC**. Validation acceptance checkpoint: **2026-10-29 06:54:33 UTC**, **3 h 27 min** after the recorded start. The draft PR identifies the publication commit. This report records saved validation results; it does not claim a six-hour runtime or a merge/live deployment.

The recorded suites passed with the distinct scopes below. Structural route proofs, injected UI/state fixtures, real map rendering and complete native-control drives are separate evidence; their case counts must not be combined into a claim that every mission was fully driven.

The subsequent publication checks and the corrected City Explorer smoke-test timeout are recorded in the [CI follow-up](validation/city-calls-2026-10-29/ci-followup.md). The later [diagnostic-popup correction and final reruns](validation/city-calls-2026-10-29/popup-followup/README.md) change only two popup-rendering expressions in the simulator HTML; call data, mission behavior and collision-core hashes remain unchanged.

## Recorded results

| Check | Recorded result | Evidence and scope |
|---|---|---|
| Repository Node tests | **977 passed, 0 failed** | [Full log](validation/city-calls-2026-10-29/popup-followup/node-tests.txt), rerun after the final diagnostic-popup correction. Unit, schema, source-contract, migration and runtime regression checks. |
| Exhaustive directed route audit | **33 cities, 622 bases, 8,118 routes; 0 failures** | [Summary](validation/city-calls-2026-10-29/route-audit/summary.json), with one JSON report per city in the same directory. Every assignment had a production directed route and successful finish check; all 8,118 previous-call endpoints had at least one different reachable local next call. |
| Full Geo/Route browser matrix | **144/144 passed** | [Report](validation/city-calls-2026-10-29/geo-route-browser/report.json) and [input hashes](validation/city-calls-2026-10-29/geo-route-browser/input-hashes.json). All 33 cities, desktop Fire and emulated-mobile EMS, all Geo recognition tiers, station/profile inventories and selected gameplay flows. This matrix predates the final eight EMS append-only additions, final collision-core correction and diagnostic-popup correction; use the follow-up rows below for the affected final inputs. |
| Final affected-city browser follow-up | **22/22 passed** | [Report](validation/city-calls-2026-10-29/geo-route-followup/report.json), [input hashes](validation/city-calls-2026-10-29/geo-route-followup/input-hashes.json) and [unchanged-input receipt](validation/city-calls-2026-10-29/geo-route-followup/hash-verification.json). Final Toronto/Ottawa Geo/Route selection and all eight appended EMS exercises. Its Peterborough transport fixtures were rerun again after the popup correction, as recorded below. |
| Final scene-response browser suite | **33/33 passed** | [Post-popup report](validation/city-calls-2026-10-29/popup-followup/scene-browser/report.json) and [input hashes](validation/city-calls-2026-10-29/popup-followup/scene-browser/input-hashes-after.txt). Six scene-response cities, Fire/EMS, desktop/emulated mobile, all 199 eligible base origins, Island civic/fallback behavior, saved-edit migration, city isolation and modeled support labels. Inputs were stable before/after. |
| Final popup regression | **2 paths, three consecutive passing runs** | [Receipt and scope](validation/city-calls-2026-10-29/popup-followup/README.md). Real Leaflet show-all and native custom-add paths preserve literal fields and reject injected elements/events. |
| Post-popup Peterborough transport | **2/2 passed** | [Report](validation/city-calls-2026-10-29/popup-followup/peterborough-transport/report.json). Desktop/emulated-mobile scene and hospital state fixtures; no full trip driving claim. |
| Complete native-control samples on final core | **2 completed** | [Drive receipts](validation/city-calls-2026-10-29/native-driving/report.json): Belleville Fire Station 3 and EMS Base 01. Native keyboard throttle/steering from normal call selection through scene completion; no position, target, physics or simulation-time injection. These are two sampled journeys, not exhaustive mission driving. |
| Representative real basemap checks | **3 selected decoded-map captures inspected** | [Rendering receipt](validation/city-calls-2026-10-29/real-map/report.json): Belleville desktop Geo had 24 loaded visible tiles; mobile Geo had 12; mobile Route had 10 with a visible route overlay. The release owner visually inspected these selected captures. |

The directed audit additionally verifies local service/base identity, canonical source equality, official-area or modeled-cost ownership, one-way edge legality, route continuity, reproducible stored distances/decision counts/new scores, bounded support assignments and history-exhaustion selection. Its maximum recorded route was **6,491 m**. It does not establish a surveyed vehicle entrance, current real-world traffic restrictions or apparatus availability.

The browser matrix mostly submits deterministic reference-trace fixtures; deeper samples use native mouse/touch route input. Simulator arrival and Peterborough scene/hospital transport checks set the simulated GPS position at the published targets. The scene suite moves from bases with native controls and separately injects scene arrival; connector-gap checks use production collision-API fixture points. Those checks establish state/control transitions and exactly-once completion behavior, not complete driven journeys. Stubbed/blocked external tiles in those suites do not validate a live basemap.

## Complete driving samples and fixed integration issues

Both final-core native drives used normal selection/station resets and the normal speed slider. The controller read position/heading and pressed throttle/steering keys to follow packaged-road waypoints. Arrival means entry into the game's arrival circle, not a field-surveyed entrance.

| Sample | Final-core outcome | Screenshot |
|---|---|---|
| Belleville Fire Station 3 → 4800 Old Highway 2 | Completed; recorded response 21.3 s | [Completion](validation/city-calls-2026-10-29/native-driving/station3-completion.png) |
| Belleville EMS Base 01 — Farley → 584 Dundas Street East | Completed on-scene; recorded response 26.9 s | [Completion](validation/city-calls-2026-10-29/native-driving/ems-completion.png) |

The same receipt retains a Fire Station 1 sample on the earlier collision core. It is explicitly **pre-fix historical evidence**, not a final-core driving pass. The final-core SHA-256 is `1320ec0ceda0103d652754ea854cd27c07dffe4f5983a1cf9dd0f1f77143f4a1` for `response-simulator/road-collision-core.js`. The directed Route Mapping audit uses `route-mapping/app.js` SHA-256 `b18d3f88b8965d2059d2f42048dad85bce1a705c76c69dc6bb4687c821ef6823`.

Two material integration defects were corrected and re-reviewed:

- The Dispatch public-approach filter omitted the reviewed Island civic exercise. The corrected predicate admits only the exact approved 355 Lakeshore Avenue source/access/base contract while retaining its private designation; unrelated private ways are not promoted. Final browser cases exercise the real civic row before an in-memory suppression fixture tests the existing intersection fallback.
- The station connector could be cleared while the vehicle was still inside its origin yard. The final collision code retains the connector through legitimate same-yard movement until mapped-road entry, with the same-origin-yard guard and existing corridor limits preserved. The [independent review](validation/city-calls-2026-10-29/independent-review.md), regression tests, all-base scene checks and the two final-core native journeys cover the correction.

## Real tiles and visual evidence

The initial real-tile run passed **12/12 UI cases**, but nine active captures had unavailable external basemaps during a reported connection interruption. Those nine are **not** successful map-rendering checks. A bounded Belleville EMS retry passed **2/2** and loaded every visible Geo/Route tile in its two active captures. Request-failure counters remain in the receipt; loaded visible pixels, not request attempts alone, support the rendering claim.

Selected inspected evidence:

- [Belleville desktop Geo: 24 loaded tiles](validation/city-calls-2026-10-29/real-map/geo-belleville-fire-geo-active-easy.png).
- [Belleville mobile Geo: 12 loaded tiles](validation/city-calls-2026-10-29/real-map/geo-belleville-ems-geo-active-easy.png).
- [Belleville mobile Route: 10 loaded tiles and route overlay](validation/city-calls-2026-10-29/real-map/route-belleville-ems-route-review.png).

These are representative desktop/emulated-mobile observations. They do not establish every provider tile, physical mobile device, source fact or complete driven route.

## Coverage and retained limits

The [coverage inventory](city-call-coverage-2026-10-29.md) and [detailed ledger](city-call-coverage-2026-10-29.json) record **7,882 city-scoped canonical IDs**, **8,118 station/service assignments**, **6,111 city-scoped route source groups** and **622 selectable bases**. The 329 unmatched EMS-only care-home additions are separate from canonical recognition counts. All 33 cities meet the 100/50/50 minimum recognition tiers. All 615 non-Peterborough mainland training bases have at least 12 local destinations and six new first-due destinations.

| Retained expansion exception | Total local destinations | New first-due destinations | Context |
|---|---:|---:|---|
| Toronto Fire 335 (`fire-toronto-fire-335`) | 4 | 1 | Island-local topology; one meaningful route-choice challenge. |
| Toronto EMS 59 (`ems-toronto-ems-4173463`) | 4 | 1 | Same Island-local topology constraint. |

Every selectable base retains at least three local destinations. Peterborough's five unchanged six/base pools are the reference benchmark; its 12/new-six stretch deficits are not expansion failures.

- **Modes:** all 33 cities have Geo and Route Mapping. Six cities—Oshawa, Belleville, Scarborough, Pickering, Markham and Toronto—have on-scene Fire/EMS response drills with no EMS hospital transport. Peterborough retains hospital transport. The other 26 cities remain Geo/Route-only.
- **Driving rules:** Road boundaries apply; one-way and turn rules are not enforced. Access points are modeled. Route Mapping's separate planner follows mapped directed edges but does not implement the full turn-restriction relation model or live emergency dispatch rules.
- **Assignments/access:** published Fire run areas apply where provided; other Fire and all EMS catchments are declared road-cost models. Support sharing is a simulation assumption, not an official run card or mutual-aid protocol. Neither source points nor modeled approaches are surveyed vehicle entrances. The specialized Marine Unit's source-confidence limits are explicit in the base ledger.
- **Island and city scope:** the narrow approved Island emergency-access supplement creates no mainland/ferry connection or general private-road permission. Toronto and former-municipality Scarborough intentionally overlap as game scopes; summed city-scoped counts are not province-wide unique physical sites.
- **Sources/currentness:** [source audit receipts](validation/city-calls-2026-10-29/source-validation/source-summary.json) cover 32 initial city pools plus targeted add-only stages. Pools overlap and must not be summed as accepted gameplay sites. The [source review](city-call-source-review-2026-10-29.md) retains licences, geometry/currentness flags, exclusions and 70 purposeful independent name/address reviews; it is not a random sample or a claim that every facility is currently open. Planned/disputed source records and source-point/entrance distinctions remain visible.

The coverage ledger's `executionVerifiedByThisInventory: false` describes the scope of its counting tool. It is not a failed runtime result; the saved execution results are reported above with their actual fixtures and limits.

## Reproduce

Run from the repository root. Node.js and Python 3 are required; browser suites additionally require Playwright and Chromium. If Playwright/browser binaries are installed separately, set `NODE_PATH` and `PTBO_CHROMIUM_EXECUTABLE` for that environment. Browser harnesses start/stop their own local server, use sequential contexts, and write new receipts under the selected output directory.

```sh
# Install the repository-pinned test dependency on a fresh checkout.
npm ci --prefix tools/location-report-tests

# Unit/schema/runtime regression suite, including ES-module tests.
node --test tests/*.test.cjs tests/*.test.mjs

# Exhaustive production directed-route/source/finish/onward audit, all 33 cities.
PTBO_RESPONSE_OUTPUT=test-artifacts/city-calls-validation/route-audit \
  node tools/check-local-response-calls.cjs

# Read-only coverage inventory; reuses the embedded baseline.
node tools/report-city-call-coverage.cjs --status final

# Full Geo/Route browser matrix, with fixture tiles by default.
PTBO_EXPECTED_VERSION=1.6.151 \
PTBO_QA_OUTPUT=test-artifacts/city-calls-validation/geo-route-browser \
  node tests/city-call-expansion-browser.cjs

# All six scene-response cities; native departures plus disclosed arrival fixtures.
PTBO_QA_OUTPUT=test-artifacts/city-calls-validation/scene-browser \
  node tests/scene-response-browser.cjs
```

To replay the exact affected-city selection set from the packaged 22-case receipt:

```sh
PTBO_QA_ROUTE_CALL_IDS="$(node -p "require('./docs/validation/city-calls-2026-10-29/geo-route-followup/report.json').requestedRouteIds.join(',')")" \
PTBO_QA_CITIES=peterborough,toronto,ottawa \
PTBO_QA_MODES=geo,route,transport \
PTBO_EXPECTED_VERSION=1.6.151 \
PTBO_QA_OUTPUT=test-artifacts/city-calls-validation/geo-route-followup \
  node tests/city-call-expansion-browser.cjs
```

For a bounded live-tile retry matching the two Belleville EMS capture modes:

```sh
PTBO_QA_CITIES=belleville PTBO_QA_SERVICES=ems PTBO_QA_MODES=geo,route \
PTBO_QA_STUB_TILES=0 PTBO_QA_REAL_TILES=1 PTBO_EXPECTED_VERSION=1.6.151 \
PTBO_QA_OUTPUT=test-artifacts/city-calls-validation/real-map-retry \
  node tests/city-call-expansion-browser.cjs
```

The two complete native-control drives are retained as sampled controller receipts and screenshots. They are not a shipped general-purpose driver CLI; the scene-browser command above reproduces the broader control/state fixtures, not those full journeys. See the [scene harness guide](scene-response-browser-qa.md) and [local response audit/rebuild guide](LOCAL-RESPONSE-CALLS.md) for detailed inputs and fixture boundaries. New external-tile availability can differ from the saved captures.
