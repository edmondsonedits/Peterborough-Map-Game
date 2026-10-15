# Ontario Route Mapping maintenance

One shared game supports all 33 city selector entries. Launch with `route-mapping/?city=ottawa`, for example. The runtime resolves the city's canonical calls, active bases and route manifest, then loads that city's compressed road network before starting the game. Unknown or mismatched cities stop with an error. No routing API, Cloudflare setup, provider token or additional backend is required.

| Data | Location |
| --- | --- |
| Mode flags, catalog counts and selected-city asset URLs | `cities/city-registry.js` |
| Canonical city bases and addresses | `cities/<id>/geo-data.json` |
| Peterborough readable source / compiled shared calls | `cities/peterborough/locations.json` / `shared/dispatch-data-1.4.4.js` |
| Access anchors and three call associations per active base | `cities/<id>/route-data.json` |
| OSM roads, node identities, controls and turn restrictions | `cities/<id>/route-network.js` |
| Common response model and route search | `route-mapping/cost-core.js` |

`routeChallenges` belongs to a base-to-location pair and records difficulty, preferred roads, meaningful alternatives, reason and graph/profile versions. `routeAccess` records source coordinates and a map-derived road projection. Both services share the same addresses. New sourced intersections enter the existing canonical database with no Geo recognition tier; no civic number is invented. Existing Geo assignments remain Peterborough 100/50/50 and 30 municipal demos 10/5/5. Belleville/Scarborough remain unavailable in Geo.

The response model combines modeled travel, turn/control delays and road suitability. It honors mapped directions/access and restrictions, with conditional turn restrictions conservatively treated as active in this untimed demo. Physical apparatus limits apply when actual dimensions are supplied. Live traffic, signal preemption, station exits and vehicle dimensions are not independently measured. Map-derived exercise records do not assert individual operational/facility review. Planned/construction bases remain informational.

Rebuild roads using the documented source snapshot and commands in [road network source and rebuild](research/route-network-source-and-rebuild.md). Keep the source PBF, expanded networks and route evidence out of git. The shared curation tool uses the actual game graph and cost router:

```sh
node --expose-gc tools/build-city-route-challenges.cjs --city oshawa --write
node scripts/update-route-catalog-counts.cjs
```

Run curation for all cities, with at most two memory-bounded processes and Toronto alone. Inspect and resolve every coverage exception. Do not fabricate road links or permit all pedestrian paths to fill a quota. Evidence records include full reference/alternative edges and geometry for legality/cost review. Rebuild associations after graph/profile changes.

The Dispatch Editor provides city and base filters, coverage and collapsed read-only route details. Ordinary name edits preserve route information; spatial/radius/base edits mark dependent routes stale. A one-time migration adds new source metadata/destinations while preserving saved edits and deletions. Legacy Belleville/Scarborough custom calls survive their change from empty to canonical catalogs.

```sh
python -m unittest discover -s tests -p 'test_ontario_route_builder.py'
node --test tests/*.test.cjs tests/*.test.mjs
PTBO_CHROMIUM_PATH=/path/to/chromium node tools/check-all-city-routes.cjs
PTBO_CHROMIUM_EXECUTABLE=/path/to/chromium node tests/editor-city-ui-browser.cjs
```

Browser checks use isolated local sessions, labeled fixture map tiles and blocked external writes. Verify real map tiles and selected-city links separately on the published site. Keep review status honest after automated tests: passing playtests does not turn `map-derived` into a facility review.

Increment `shared/build-version.js`, normalize with `node scripts/normalize-release.cjs`, complete branch review and required checks, then publish the exact reviewed tree and verify deployment CI/live assets. Route capability remains independent of simulator driving, base-yard and 3D availability.
