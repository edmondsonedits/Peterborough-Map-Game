# City call expansion implementation plan

> Execute the user-approved `Astra-Six-Hour-City-Calls-Prompt.txt`; no new design approval is required. Use scoped workers, one shared integration owner, and independent final review.

**Goal:** Expand verified civic and priority destinations across all configured cities, retaining local Fire/EMS routing and separate recognition/route difficulty.

**Architecture:** Existing city seed catalogs remain authoritative for their IDs. Add reviewed canonical supplementary records to each city's training descriptor as `sharedLocations`; merge those into the shared store before care-home enrichment. Station exercises reference canonical IDs and retain their own service/base IDs. Existing intersections are retained; new first-due and explicitly modelled support assignments are road-validated. Do not turn on unsupported dispatch runtimes.

**Tech stack:** Existing static JavaScript/JSON, Node production routing/VM tools, offline licensed geographic inputs, existing browser harnesses.

## Global constraints

- Start 2026-10-29T03:26:53Z, deadline 2026-10-29T09:26:53Z (Toronto: Oct28 23:26 to Oct29 05:26).
- Initial branch `codex/city-calls-20261029`, base `384d0973dbaff384709ac0e34f542c8dda84f574`.
- Full target: 200 unique recognition locations per city (100/50/50), richer pools for all eligible bases. Never fabricate coverage or force difficulty labels to meet quotas.
- Published polygons govern first-due Fire where provided; other assignments explicitly modelled. Support training assignments never pretend to be official run cards.
- Stable IDs and user edits survive. No unrelated UI work, paid services, main merge or live publication in this session without applicable authorization.
- Raw evidence caches remain scratch; compact provenance, repeatable acquisition/build tools and accepted datasets are committed with the code.
- Release patch increments once at final integration; inspect latest upstream before assigning the number.

## Tasks

- [ ] 1. Baseline: inventory production bases/catalogues/modes, source quality, existing tests, road audit failures. Owner baseline worker; writes scratch report only.
- [ ] 2. Acquire official licensed bulk priority locations and OSM civic points/boundaries. Two disjoint source workers; no production edits.
- [ ] 3. Shared store: test-first optional `sharedLocations` normalization/merge, city isolation, duplicate/collision rejection, new seed visibility with old saved edits/deletions. Integration worker owns store and new focused tests.
- [ ] 4. Offline canonical catalogue builder: select geographically validated candidates, preserve source identity and genuine difficulty reasons, derive cross streets only from source road topology, retain rejected/uncertain records in audit. Root owns tools/data integration.
- [ ] 5. Route augmentation: append sourced civic exercises and documented neighbouring-hall support relationships; use production graph for ownership, route difficulty, arrival and onward reachability. Keep current intersection pools and IDs, recompute changed metrics. Root owns route builder/audit integration unless explicitly reassigned.
- [ ] 6. Independent evidence/code review; complete automated all-record/all-base checks and browser matrix; repair task-caused defects, record pre-existing failures.
- [ ] 7. Version, commit/push isolated branch, draft PR/review link, exact coverage/provenance and remaining gaps.

## Pre-flight interfaces and rulings

- Runtime currently loads training care homes in every city; optional sharedLocations reuses that fetch and does not need a new runtime API.
- Route app uses `routeBaseId` and single-item `trainingServices`; canonical identity belongs in `canonicalCallId`, not a replacement exercise ID.
- Existing six-call pools are a baseline, not enough by themselves for new quality target.
- README is stale about Toronto Island; current datasets have genuine documented emergency-road supplement and three local calls for both Island stations. Preserve this.
- All-city test baseline: 783 tests, 764 pass, 19 fail on unmodified main. Failures include release cache mismatches and missing JS DOM harness dependency. They are not introduced by this task; report them and avoid unrelated behavior changes.
- Peterborough exhaustive route audit already fails stored distance consistency after current graph/base changes. Diagnose before regenerating; do not hide the failure.
