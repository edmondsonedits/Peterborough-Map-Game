# Local response calls

Route Mapping has its own hall-specific call catalog in each city's `training-data.json`. Shared Geo Guesser and driving catalogs are unchanged. Incidents are simulated; addresses and junctions come from the linked source records.

Each selectable Fire and EMS hall has at least three distinct destinations, targeting six. Runtime filters by hall and service **before** difficulty, decision challenges, recent history, and EMS care-home priority. Exhausting history recycles the local set. It never falls back to citywide calls. Previous-call practice retains the originating hall's catalog.

## Response geography

The packaged Fire station areas for Toronto, Scarborough, Oshawa, Cambridge, Burlington, and Thunder Bay come from municipal open data. Their source and licence links are included in `response-areas.geojson`. Every assigned destination must lie inside the matching station polygon. A legal road route may cross an area boundary.

Other Fire halls and all EMS bases use an **estimated** first-due catchment: directed road-network travel cost compared with every same-service hall, with a 15-second cost tie for overlapping nearby halls. The road-class cost uses the game's existing travel model. These estimates are training geography, not certified operational dispatch boundaries, traffic-aware routing, or apparatus availability.

Candidates are existing sourced civic/care addresses and actual shared road vertices with at least two distinct street names and three arms. Bridges, raised crossings, unnamed roads, and motorway ramps do not become invented intersections. Selection spreads calls across local directions and distances, favoring routes with meaningful departure, turn, or crossing choices. Equal-length alternatives are not labeled mistakes. Where topology offers fewer choices, locality takes priority and the profile records the limitation.

Toronto Island includes a documented emergency-training access exception for 33 mapped asphalt Cibola/Lakeshore service-road ways. Original `motor_vehicle=private` tags and OSM node geometry are retained. City policy permits emergency vehicles on asphalt roads. The wooden Lakeshore segment is excluded. No ferry, boardwalk, bridge, or mainland connection was added. Source evidence is packaged in `cities/toronto/emergency-access-roads.geojson`.

## Regeneration and checks

Run from the repository root with Node 22:

```sh
node --max-old-space-size=8192 tools/build-local-response-calls.cjs
node --test tests/route-local-data.test.cjs tests/route-local-calls.test.cjs tests/route-search-workspace.test.cjs
node --max-old-space-size=8192 tools/check-local-response-calls.cjs
```

`PTBO_RESPONSE_CITY=toronto,peterborough` limits either tool to named cities. The audit writes detailed reports to `/tmp/local-response-audit` (override with `PTBO_RESPONSE_OUTPUT`). It checks **every** assigned call with production directed routing and completion, source intersection identity, official polygon membership or modeled ownership, reproducible decision penalties, history exhaustion, and a reachable different next call from every previous-call origin.

The builder executes the production base store and preview-city factory to use the exact runtime hall IDs. Road, base, polygon, or source-address updates require regenerating and auditing the affected cities. Local custom bases need their own reviewed response profile; they cannot silently inherit distant city calls.
