# City packages

This folder supplies geographic data to the shared emergency-response games. Only the selected city loads its heavy road assets; adding another city does not make a Peterborough player download that city's network.

## Modes and package status

Use each registry row's explicit `city.modes` flags for `geo`, `route`, `dispatch` and `explorer`. Historical labels such as `geo-demo` and `base-training` describe package lineage, not current catalogue size or the complete mode contract.

All 33 cities expose Geo Guesser and Route Mapping. Seven cities also declare mission Dispatch: Peterborough retains its hospital-transport workflow and Explorer, while Oshawa, Belleville, Scarborough, Pickering, Markham and Toronto now offer Fire/EMS scene-response drills. The six scene-response cities finish both services on-scene and explicitly set `hospitalTransport: false`. The other 26 cities remain Geo/Route-only. The reporter reads registry modes, manifest features and local package configuration; a shared desktop/mobile URL alone is not evidence that a mode is implemented, and capability metadata is not a final mission/browser pass.

Belleville and Scarborough now have general recognition catalogues through their shared training descriptors. The earlier statements that they have no Geo calls, and that thirty twenty-call demos describe all non-Peterborough coverage, are obsolete. The rerunnable [coverage ledger](../docs/city-call-coverage-2026-10-29.md) reports the actual current counts and outstanding targets; its status distinguishes interim runs from the intended final inventory snapshot. Inventory coverage is separate from route/browser verification.

## Location data flow

`city-registry.js` selects a package. `shared/city-location-runtime.js` loads the selected Geo/package seed, and `shared/dispatch-locations.js` merges that city's `training-data.json` shared locations and care homes while preserving city-scoped saved edits.

- General canonical recognition locations are the unique-ID union of raw `geo-data.json.locations` and `training-data.json.sharedLocations`. Peterborough's readable authority is `locations.json`, compiled to the shared compressed dispatch payload. Original raw records remain authoritative when a matching ID is repeated in the descriptor.
- General locations are shared between Fire and EMS and across starting bases. Recognition difficulty is explicit address-recognition metadata; it is not route length or station ownership. Expanded cities retain stable IDs and published easy/medium/hard tiers. Some larger cities legitimately contain more than the minimum 200 locations.
- `careHomes` contains the Ontario MOHSERLO long-term-care snapshot. Matching civic records within the runtime's 100-metre check are marked as care homes; unmatched homes are EMS-only additions. The EMS policy can keep care homes eligible outside the selected recognition tier, so raw tier counts and actual EMS priority pools must be reported separately.
- `routeCalls` are distinct station/service exercise records. `routeResponses.bases[].callIds` assigns them to canonical base IDs. An exercise can reference a shared `canonicalCallId`; repeated first-due/support assignments do not create additional city locations. Helper-only station-familiarization destinations are also distinct from the general catalogue.

`call-provenance.json` retains source-point, licence, retrieval, cross-street and modeled approach evidence for supplemental locations. `call-catalogue-review.json` records selection/rejection and review decisions. Compact runtime records point back to that evidence instead of implying that a building/parcel point is a surveyed vehicle entrance. Fictional incident profiles are training scenarios, not real incident history or hazard assessments.

## Bases, ownership and route limits

Selectable bases must be active, explicitly eligible and have finite coordinates. Planned, disputed and active-but-ineligible records remain inspectable in the Geo source data; unknown coordinates must remain `null`, never coerced to zero. `shared/base-locations.js` supplies canonical runtime identities, and `legacyIds` preserves links to older preview/saved records. The [coverage JSON](../docs/city-call-coverage-2026-10-29.json) lists both selectable base ledgers and nonselectable source records without hard-coding a stale base total here.

Some Fire profiles use published official run-area polygons. Others, including EMS profiles, use declared same-service directed road-cost estimates. Explicit `responseAssignment.role` distinguishes new first-due and support exercises; older unlabelled exercises are not retrospectively claimed to have official first-due ownership. Modeled sharing/support is not an official run card or mutual-aid agreement.

Each selected descriptor identifies its road asset and source snapshot. Peterborough retains its existing public-road asset; other cities use compressed OSM extracts. Extracts preserve way identity and mapped access/direction tags and include a game-bound buffer; these rectangles are not authoritative municipal boundaries. Visual tiles remain separate. Route Mapping's planner honors mapped one-way directions but does not implement the full OSM turn-restriction relation model, live closures, emergency exemptions or real dispatch routing. Dispatch driving has a different enforcement model: **Road boundaries apply; one-way and turn rules are not enforced. Access points are modeled.**

Toronto's Island bases have local assigned exercises and a narrowly reviewed emergency-access supplement. The old assertion that they have no reachable destination is obsolete. Island exercises remain constrained by local topology, and individual coverage targets can remain unmet. The supplement does not create a mainland/ferry connection or grant general access to private roads; consult its exact approved-way evidence and current per-base ledger.

Route quality stores measured distance, meaningful decisions and alternative-route penalties. New published numeric route scores can be summarized in 0–33, 34–66 and 67–100 bins, while legacy decision counts remain separate. These reporting bins are not a claim about fixed UI tier selectors. A successful data inventory does not replace directed graph/finish checks and browser interaction tests against the exact shipped inputs.

## Standard package layout

```text
cities/<city-id>/
  city.json                  # lightweight manifest
  geo-data.json              # compact Geo seed and researched base records
  package.js                 # driving configuration, where supported
  dispatch-data.js           # existing driving descriptor, where supported
  training-data.json         # shared recognition additions, care homes, route assignments
  call-provenance.json        # supplemental source/coordinate/access evidence
  call-catalogue-review.json # source selection/rejection audit
  roads.geojson.gz            # selected-city road extract, where used
  response-areas.geojson      # optional official Fire run-area subset
  emergency-access-roads.geojson # optional narrowly approved supplement
```

An asset may physically remain in an existing game directory when the exact file is intentionally reused. The city manifest/package owns the reference; consumers should not hard-code another feature's data path.

## Peterborough and saved edits

Peterborough's `package.js` owns map bounds, service/base configuration, yards, hospital transport target, EMS alarm defaults, road reference and dispatch descriptor. Its readable 200-location catalogue lives in `locations.json`; regenerate the shared payload with `scripts/build-dispatch-catalog.cjs`. The saved-data version is independent of the release build version and must not be reset merely to refresh labels.

Shared stores use city-specific browser-storage keys. Existing Peterborough edits migrate from older keys, and the immutable published seed remains separate from user deltas. The scene-response integration bridges the Geo/Dispatch dataset version and migrates old preview edits while preserving user changes; a capability update must not reset those saved identities. Label/source review must preserve IDs, civic points, tiers, radii, incident profiles and source-call links. See the [source review](../docs/city-call-source-review-2026-10-29.md) for the dated 31-label benchmark review and its limits.

## Reproduction and reporting

The [official and OSM source pipelines](../docs/city-call-source-review-2026-10-29.md) document pinned inputs, hashes, licences, currentness flags and reusable cache commands. OSM attribution is © OpenStreetMap contributors under ODbL 1.0; the selected Ontario and federal open datasets retain their respective open-government licence conditions. Operator/institution name/address corroboration is separate from bulk geometry licensing.

`scripts/build-city-training.py` constructs the underlying road/care-home descriptors from reviewed inputs. `scripts/build-ontario-geo-data.cjs` reconstructs supplied compact raw Geo seeds from an external reviewed research package; it is not a standalone rebuild of the expanded shared catalogue and its provenance. Review the source-selection and route-generation tools before regeneration, preserving current shared locations, evidence and saved identities.

The coverage reporter does not build graphs or modify production data:

```sh
# First run: capture the approved before-state inventory.
node tools/report-city-call-coverage.cjs --baseline /path/to/baseline.json
# Later runs reuse the baseline embedded in the generated JSON.
node tools/report-city-call-coverage.cjs
```

It reports before/after city/service recognition pools, EMS-only enrichment, route score/decision metadata, city-scoped unique sites versus assignments, and per-base sources/methods, distances and deficits to 12 distinct local destinations (including civic sites and mapped intersection drills), six new first-due destinations and the three-destination floor. Peterborough remains the unchanged six/base reference benchmark: its 12/new-six figures are stretch comparisons and are separated from expansion failures. `--status final` labels an intended final inventory snapshot; it does not run or certify route/browser tests.

The frozen-data inventory of 2026-10-29 records **7,882 city-scoped canonical IDs**, **8,118 station/service assignments** and **622 selectable bases**. All 33 cities meet the canonical recognition minimums and every selectable base retains the three-destination floor. All 615 non-Peterborough mainland training bases have at least 12 local destinations and six new first-due destinations. Only the two Toronto Island bases remain below those expansion targets, each with four total destinations and one new first-due destination; the published local-topology limits remain visible. Peterborough's five unchanged six/base pools remain the reference benchmark, with stretch targets reported separately. These are inventory findings, not route/browser execution results.

Inventory verification is scoped explicitly as `executionVerifiedByThisInventory: false`: the reporter does not execute missions or browser interactions and makes no pass/fail assessment of them. Release test results belong in the [separate final validation report](../docs/city-call-validation-2026-10-29.md), published after the final suites.
