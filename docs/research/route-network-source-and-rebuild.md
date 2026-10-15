# Ontario route network source and rebuild

All 33 registered city packs use the dated [Geofabrik Ontario OSM extract](https://download.geofabrik.de/north-america/canada/ontario-261014.osm.pbf). The exact source is 1,032,610,327 bytes, SHA-256 `0d678aa80c806b7637cee747e40c9dbaa800847a8c021397740813a8dcb0f333`, with OSM replication cutoff `2026-10-14T20:21:12Z`. Attribution is © OpenStreetMap contributors, under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Every pack records this provenance and graph version `ontario-osm-2026-10-14-v2`.

## Rebuild

From the repository root with Python 3.12 and pyosmium 4.3.1:

```bash
python -m pip install osmium==4.3.1
python tools/geospatial/build_ontario_route_networks.py --download
python -m unittest discover -s tests -p test_ontario_route_builder.py -v
```

The default source/cache directory is `outputs/ontario-route-source/`, outside committed source. It contains the downloaded PBF, native sparse node index, SQLite raw way cache, extraction metadata, readable `networks/<city>.json` FeatureCollections, and `build-report.json`. Generated browser assets are `cities/<city>/route-network.js`; the committed readable count table is `docs/research/route-network-build-report.md`.

After a completed extraction, `python tools/geospatial/build_ontario_route_networks.py --resume` regenerates packs from that verified cache. Resume rejects changed city bounds or base seeds. `--cities peterborough,oshawa` limits a fresh rebuild. `--bases-json path.json` supplies explicit city-ID keyed active base coordinate lists. A canonical base change requires a fresh extraction so driveway admission is re-evaluated.

## Extraction and topology

Configured city bounds come from canonical `geo-data.json` when available, with a metric 8 km buffer. Peterborough uses its own package bounds and five active fire/EMS bases. Belleville has seven active seeds; Scarborough has 29 active seeds and excludes its two planned facilities. Other cities use their canonical active, selection-eligible facility records.

The PBF passes through libosmium's native `NodeLocationsForWays` with `sparse_file_array`; untagged nodes do not cross the Python boundary. A native key filter selects road/control/restriction objects. Whole OSM ways intersecting the buffered bounds are retained; they are never clipped into fabricated intersection vertices. An additional ways-only pass completes from/via/to restriction members using the existing native node index. Restriction-member-only ways are explicitly marked when they fail route admission.

Each LineString has the original numeric `osm_id` and `nodeIds` exactly parallel to its longitude/latitude coordinates. All original OSM way tags are retained. Controls keep every original tag, including stand-alone access/vehicle/emergency/conditional and physical-dimension controls. Via-node and ordered via-way restrictions preserve original relation tags, conditions and exceptions.

Ramer–Douglas–Peucker simplification uses a 1.9 m tolerance only between protected anchors. Every shared OSM node, tagged control, restriction via, via-way vertex and way endpoint is protected. Geometry crossings do not create junctions. Bridges, tunnels and grade-separated crossings retain their OSM identities and tags.

Parking aisles and drive-through service tokens, including semicolon composites, are excluded unless explicitly emergency-permitted. Driveways are included only when their mapped geometry is within 300 m of an active base, and receive `routeAccess: 'base-only'`. Complete restriction member metadata is retained even where a member itself remains ineligible for routing.

## Browser contract

Assets contain deterministic gzip compressed JSON encoded as base64 and use the browser's built-in `DecompressionStream('gzip')`. Loading creates `window.PTBO_ROUTE_NETWORK_READY`, a promise resolving to the FeatureCollection, sets `window.PTBO_ROUTE_NETWORK`, then emits `ptbo-route-network-ready` with city and graph version. The loader is self-contained and requires no additional network fetch.

## Toronto Island policy scope

The [City of Toronto commercial and emergency vehicle policy](https://www.toronto.ca/explore-enjoy/toronto-island-ferries/commercial-emergency-vehicles/) permits emergency vehicles on island asphalt roads, excludes the south boardwalk, and sets 30 km/h generally and 15 km/h in school areas. Its bridge limits are Manitou 18 tonnes, Algonquin 12 tonnes, and Olympic 10 tonnes. These are physical limits, not a blanket access exemption.

An `emergencyAccess` annotation is confined to mapped asphalt `highway=service` ways on the island named Cibola Avenue, Lakeshore Avenue, The Mall, Lagoon Road, Beach Road, Terry Kimball Lane, Withrow Street or Pontiac Avenue. The annotation records its source and speed limits. Original private access and physical tags remain unchanged. Footpaths, boardwalks, unknown bridges, ferries, and water crossings receive no such override. Apparatus dimensions and actual station exits remain unverified; the road policy alone does not establish either.

## Verification

The builder unit suite covers protected-node RDP, retention of real curves, distinct IDs at geometry-only crossings, native osmium node identity and standalone conditional control tags, complete service token filtering, segment-to-base driveway distance, whole-way bounds crossings, conditional/except restriction preservation, ordered via-way members, canonical active seed counts, narrow island access, and gzip loader round trip. The generated build report provides per-city way, node, control, restriction and byte counts. Asset QA additionally checks all 33 source/version identities, parallel coordinate/node-ID arrays and complete restriction member references.
