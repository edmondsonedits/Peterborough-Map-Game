# City packages

This folder is the geographic data boundary for the emergency-response games.

## Architecture

The simulator and Geo Guesser code stay shared. Each city supplies only the information that changes by place: map bounds, road configuration/data references, Fire/EMS bases, hospitals, dispatch data, and city-specific labels.

Only the selected city should load its heavy geographic assets. Adding more city folders therefore does **not** make a Peterborough player download Toronto, Oshawa, or any other city's road network.

## Package status

- `playable` — Peterborough's full production package.
- `base-training` — an existing shared free-driving preview, with dispatch calls unavailable. Oshawa, Pickering, Markham and Toronto also have Geo demos; Belleville and Scarborough do not.
- `geo-demo` — a researched Geo Guesser demo with twenty calls and Fire/EMS bases. This status does not supply driving roads or dispatch simulation.

Launchers must use `city.modes` from `city-registry.js` for each mode: `geo`, `route`, `dispatch` and `explorer`. All 33 cities now support Route Mapping. Peterborough supports all four modes. The six existing previews retain `dispatch: true` to access their existing free-driving simulator. Other cities support Geo and Route Mapping. A common `dispatch.desktop` or `dispatch.mobile` URL is not evidence of dispatch capability.

## Route Mapping and EMS care homes

Each city's `training-data.json` identifies the selected road asset and Ontario MOHSERLO long-term-care homes. The shared dispatch store loads only that city's descriptor, retains canonical coordinates/IDs, and marks matching civic addresses within 100 metres as care homes. Additional homes are EMS-only. Saved edits remain city scoped. The shared EMS priority policy favors care homes in eligible pools while retaining general practice and avoiding immediate repeats where possible.

Peterborough keeps its existing public-road asset and its independently refreshed geospatial source manifest. The other 32 cities have independent `roads.geojson.gz` extracts from the recorded Geofabrik Ontario snapshot, retaining OSM way identity, access and direction tags. Visual tiles remain separate. Extracts include a buffer around the existing training bounds; they are not authoritative municipal boundary polygons. Each descriptor records source checksums/date or the maintained source manifest, and licenses. Only the selected road network is downloaded. Fire routes in the two legacy cities without a general-call catalog (Belleville and Scarborough) use verified fire-station destinations.

Route exercises honor mapped one-way streets; the current graph does not include OSM turn-restriction relations, temporary closures or live emergency routing. A base needs a directed connection to an eligible training destination within the mapped network. Toronto's two Island bases have no reachable destination in the current catalog; users can choose another base without an invented mainland connection.

Build with `scripts/build-city-training.py` and PyOsmium 4.3.1 using the reviewed city descriptors, regional PBF and official MOHSERLO GeoJSON. It rejects missing care-home coverage, filters by community and training bounds, and records source checksums. Care-home catalogs are a training snapshot, not a complete or real-time facility inventory. Copyright: OpenStreetMap contributors (ODbL 1.0); Ontario health-provider data under the Open Government Licence – Ontario.

## Standard package layout

```text
cities/<city-id>/
  city.json          # lightweight manifest used by tools/people
  geo-data.json      # compact Geo runtime data, where available
  package.js         # existing driving configuration, where available
  dispatch-data.js   # existing driving dispatch descriptor, where available
  boundaries.geojson # optional city boundary asset
  roads.geojson      # optional city-owned/simplified road asset
```

Large geographic assets may be physically shared with another game when the exact same authoritative file is reused. In that case `city.json` and `package.js` still own the reference, so the simulator never hard-codes another feature's data path.

## Peterborough

Peterborough is the first fully integrated city package as of **v1.6.5**.

`cities/peterborough/package.js` is now the source of truth for:

- map centre, zoom limits and city bounds
- Fire stations
- EMS bases
- base-yard defaults
- Peterborough Regional Health Centre transport target
- EMS alarm-filter defaults
- road-network URL and collision projection origin
- dispatch control label
- dispatch dataset version/descriptor

Shared stores are city-aware. Base, hospital and dispatch edits are saved under city-specific browser-storage keys. Existing Peterborough edits are read from the older keys and carried forward automatically.

The current Peterborough collision-road GeoJSON and compressed dispatch payload remain physically reused from their existing production asset locations to avoid duplicating megabytes of identical data. They are now referenced through the Peterborough package rather than being the architectural source of truth.

`cities/city-registry.js` remains the lightweight launcher index. Peterborough keeps its existing call database, runtime and saved-edit migration; it does not use a new `geo-data.json`.

## Ontario Geo demos

Thirty researched municipalities have `geoDataUrl: cities/<id>/geo-data.json` in the registry and `features.geoGuesser: true` plus `data.geoGuesser: geo-data.json` in their manifests. There are 600 calls in total, with 10 Easy, 5 Medium and 5 Hard per city. Each city's single `locations` array is shared across both services and all starting bases. Difficulty describes address recognition, not distance from a base.

The compact schema is version 1:

- `id`, `name`, and the sourced `population` estimate.
- `map`: municipality bounds, a default center at the first selectable base, default zoom 18 and limits 7–19. Gameplay can center on the chosen base.
- `bases`: stable IDs/numbers, official numbers, service, name/short name, address, coordinates, status, selection eligibility, facility role, source URL and notes. Where researched, optional `constructionStage`, `expectedOpening` and `constructionProjectIds` preserve the facility's project context, including unknown (`null`) opening dates.
- `locations`: stable ID, name, `addr`, coordinates, radius, `recognitionDifficulty`, optional `crossStreets`, `custom: false`, source URLs and difficulty reason. Evidence-backed indirect streets retain their `(via …)` display text.
- `constructionProjects`: compact project history and future-facility metadata, including linked/replaced base IDs, stage, opening estimate and source. Project entries are not additional selectable bases.

All 686 researched base records remain available for inspection. A base is selectable **only** when `status === 'active' && selectionEligible === true`; this yields 582 bases. Planned, disputed and active-but-ineligible records remain in `bases`. Unknown coordinates remain `null`. Runtime consumers must check that both coordinates are finite numbers before using a point; they must not convert `null` to zero.

Optional `bases[].legacyIds` links 45 original preview IDs to their canonical research IDs: Oshawa 8, Pickering 6, Markham 15 and Toronto 16. The builder reads the actual preview factory and packaged fallback data offline, then matches the same service and normalized civic address; two Markham Main Street variants also require the same civic number/street anchor and coordinates within 30 metres. Pickering's `ems-seaton-rdps-2` remains unmatched because its old address lacks a civic number. Canonical IDs and original saved deltas stay unchanged; consumers can resolve these aliases when reading saved edits.

The full research package remains the authority for boundary, coordinate and cross-street evidence. Compact runtime files omit the large research audit and road-graph payloads. They do not call per-city services or introduce map-provider tokens.

Rebuild from the reviewed research package's `cities` directory:

```sh
node scripts/build-ontario-geo-data.cjs /path/to/package/cities
node --test tests/ontario-city-data.test.cjs
```

The Geo builder checks source IDs and coordinate bounds, writes the thirty compact datasets, and adds Geo manifest fields while preserving existing driving configuration. It does not generate driving runtimes or roads; Route Mapping's separate training-data builder supplies its own road extracts. `package.js` and `dispatch-data.js` are never generated or changed by this command. When changing availability, also update the registry's explicit mode flags.
