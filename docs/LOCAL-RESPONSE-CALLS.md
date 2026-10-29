# Local response calls

Route Mapping has its own hall-specific exercises in each city's `training-data.json`. New civic exercises refer to stable records in that file's `sharedLocations` catalogue, also consumed by Geo Guesser and supported Dispatch cities. Per-record source and geographic evidence lives in `call-provenance.json`. Incidents are simulated; addresses and junctions come from the linked source records.

Each selectable Fire and EMS hall has at least three distinct destinations. The expansion targets six new civic first-due exercises and twelve total distinct local destinations per base, with documented geography exceptions; Peterborough retains its reference catalogue. The current coverage ledger records actual results. Runtime filters by hall and service **before** difficulty, decision challenges, recent history, and EMS care-home priority. Exhausting history recycles the local set. It never falls back to citywide calls.

Route Mapping opens a Fire/EMS station picker before loading the map. Each station displays the number of unique calls assigned to that hall and service. Choosing a station keeps it as the starting point throughout the session, including after 20 completed calls. The map's back arrow and Change station link return to the picker; changing service in settings also asks for a new station. Existing learning and completed-call history are retained. Missing or invalid gameplay station links return to the picker.

## Response geography

The packaged Fire station areas for Toronto, Scarborough, Oshawa, Cambridge, Burlington, and Thunder Bay come from municipal open data. Their source and licence links are included in `response-areas.geojson`. First-due destinations must lie inside the matching station polygon. A legal road route may cross an area boundary. Explicitly labelled support exercises can serve a different primary hall's area.

Other Fire halls and all EMS bases use an **estimated** first-due catchment: directed road-network travel cost compared with every same-service hall, with a 15-second cost tie for overlapping nearby halls. The road-class cost uses the game's existing travel model. These estimates are training geography, not certified operational dispatch boundaries, traffic-aware routing, or apparatus availability.

Candidates are existing sourced civic/care addresses and actual shared road vertices with at least two distinct street names and three arms. Bridges, raised crossings, unnamed roads, and motorway ramps do not become invented intersections. Selection spreads calls across local directions and distances, favoring routes with meaningful departure, turn, or crossing choices. Equal-length alternatives are not labeled mistakes. Where topology offers fewer choices, locality takes priority and the profile records the limitation.

Toronto Island includes a documented emergency-training access exception for 33 mapped asphalt Cibola/Lakeshore service-road ways. Original `motor_vehicle=private` tags and OSM node geometry are retained. City policy permits emergency vehicles on asphalt roads. The wooden Lakeshore segment is excluded. No ferry, boardwalk, bridge, or mainland connection was added. Source evidence is packaged in `cities/toronto/emergency-access-roads.geojson`.

The civic allocator first reserves distinct local addresses across eligible halls, then fills remaining capacity. Candidates must retain their exact source point and a supported approach within 80 metres; new civic routes are bounded to 180–6,500 metres and verified with the production directed graph. A canonical structure-fire location can have a primary exercise and at most two nearby same-city support exercises. A hall receives at most two support exercises. These are estimated training assignments, not departmental run cards or documented apparatus complements. The UI identifies the primary hall on support calls.

Recognition difficulty describes the destination's street or landmark context. Route difficulty is recomputed from the selected hall's actual route and decision choices. Neither is a medical severity or response-priority rating.

## Regeneration and checks

Run from the repository root with Node 22:

```sh
node --max-old-space-size=8192 tools/build-local-response-calls.cjs
node --test tests/route-local-data.test.cjs tests/route-local-calls.test.cjs tests/route-search-workspace.test.cjs
node --max-old-space-size=8192 tools/check-local-response-calls.cjs
```

The original builder above regenerates the underlying local intersection/address exercises. For an existing reviewed catalogue, `tools/build-civic-response-calls.cjs` preserves that baseline and derives the additional canonical civic exercises. The original builder writes city training data directly; the civic builder uses `PTBO_RESPONSE_OUTPUT` for a separate output directory. Use a different directory for audit reports. Review the generated descriptor and full source evidence before replacing production files. See the [source review](city-call-source-review-2026-10-29.md), [coverage ledger](city-call-coverage-2026-10-29.md), and [final validation record](city-call-validation-2026-10-29.md).

```sh
PTBO_RESPONSE_CITY=ajax PTBO_RESPONSE_OUTPUT=/path/to/scratch-build node tools/build-civic-response-calls.cjs
```

The eight EMS exercises that fill the remaining mainland twelve-call shortfalls use the explicit, append-only `tools/response-floor-topups.json` plan. Run the top-up after installing the reviewed canonical catalogue and the existing civic exercises. The tool verifies same-service ownership, production routing, completion, onward access, distinct addresses, and the existing six-first-due minimum; it does not rebuild or rebalance existing assignments. It writes scratch output only:

```sh
for city in toronto ottawa; do
  PTBO_RESPONSE_CITY="$city" PTBO_RESPONSE_OUTPUT=/tmp/floor-topup-build \
    node tools/topup-response-calls.cjs
done
```

The current packages already contain the two additional Toronto canonical records and their `call-provenance.json` evidence. When rebuilding from a catalogue that predates those records, first reproduce their reviewed canonical records and provenance using the [source review](city-call-source-review-2026-10-29.md) and source pipeline, then pass an add-only JSON bundle with `sharedLocations` and `provenance.records` as `PTBO_TOPUP_SOURCE`. Preserve the first run's Toronto promotion delta; a repeat run is descriptor-idempotent but its delta is empty because the records are already present. Audit scratch descriptors into a **different** directory before any integration:

```sh
mkdir -p /tmp/floor-topup-audit
for city in toronto ottawa; do
  PTBO_RESPONSE_CITY="$city" PTBO_RESPONSE_OUTPUT=/tmp/floor-topup-audit node -e '
    const d=require("./tools/route-response-data.cjs"), a=require("./tools/check-local-response-calls.cjs");
    const city=d.registry.find(c=>c.id===process.env.PTBO_RESPONSE_CITY);
    a.auditCity(city,{training:require("/tmp/floor-topup-build/"+city.id+".json")}).catch(e=>{console.error(e);process.exitCode=1});'
done
```

`PTBO_RESPONSE_CITY=toronto,peterborough` limits the original builder or audit to named cities. The civic and top-up builders each require one city per run. The audit writes detailed reports to `/tmp/local-response-audit` (override with `PTBO_RESPONSE_OUTPUT`). It checks **every** assigned call with production directed routing and completion, source intersection identity, official polygon membership or modeled ownership, reproducible decision penalties, history exhaustion, and a reachable different next call from every previous-call origin.

The builder executes the production base store and preview-city factory to use the exact runtime hall IDs. Road, base, polygon, or source-address updates require regenerating and auditing the affected cities. Local custom bases need their own reviewed response profile; they cannot silently inherit distant city calls.

Route Mapping checks packaged road directions and connectivity but does not model OSM turn-restriction relations, live traffic or current closures. The six scene-response Dispatch cities use collision road boundaries; their driving engine does not enforce one-way or turn rules. Their EMS missions finish at the scene. Peterborough retains its existing hospital-transport workflow. Mode-specific limits are listed in the coverage and validation records.
