# Peterborough 3D Simulator

Browser-based, low-poly 3D recreation of Peterborough, Ontario, built from open geospatial data.

## Current geospatial pipeline

- **Cached OpenStreetMap extract:** roads, railways, buildings, building parts, water, parks, land use, parking, mapped trees, street lights and traffic signals
- **City of Peterborough eMaps:** official park polygons, major trails, sidewalks/pathways, transit stops and shelters, recreation facilities, civic points of interest, names and addresses
- **City of Peterborough Basedata:** official road-surface polygons, curb/edge lines, parking surfaces and bridge footprints
- **Ontario Road Network:** independent public-road centreline validation
- **Ontario 2025 lidar DTM:** primary bare-earth terrain in CGVD2013, packaged at approximately 8.30 m local-ground spacing with source and integrity metadata
- **Ontario lidar + Ontario Hydro Network:** official PolygonZ shorelines/water stages, waterbodies and creek centrelines
- **osmtogeojson:** Polygon and MultiPolygon conversion with courtyards and holes
- **Mapzen/Tilezen Terrarium:** packaged compatibility terrain used only if the official Ontario heightmap is unavailable
- **Vendored Three.js 0.180.0:** terrain, merged buildings, continuous road ribbons, trees, landmarks and flight controls without a CDN requirement
- **Vendored Spark 2.1.0:** optional proximity-streamed, LOD-controlled landmark captures without replacing or blocking the GIS city
- **Vendored osmtogeojson 3.0.0-beta.5:** reliable multipolygon and courtyard conversion without a CDN requirement
- **Nominatim:** bounded Peterborough address and place search

The browser prefers deployment assets in `city-explorer/data/`. The manifest's generated-at value version-stamps the OSM request, so a new city extract cannot silently reuse an older same-named payload. The authoritative terrain, water, roads and municipal layers are all packaged for offline use; live Overpass remains a last-resort map fallback.

## Geographic accuracy measures

- OSM street coordinates are used directly rather than being redrawn by hand.
- A deployment job downloads the complete ORN result through object-ID pagination, preventing ArcGIS transfer limits from silently dropping streets.
- Public drivable OSM streets are compared with ORN in NAD83 / UTM zone 17N, with centreline samples approximately every 15 metres in both directions.
- Service roads, parking aisles, driveways, tracks and explicitly private roads remain visible, but are kept outside the authoritative public-road pass criteria because ORN does not consistently represent them.
- The build detects ArcGIS partial pages and keeps requesting ORN records until an empty or repeated page, preventing silent reference-network truncation.
- Municipal eMaps layers are clipped to the same city bounds, page-complete, and published only as a complete set; a failed refresh reuses the last complete cache instead of mixing partial layers.
- Surveyed City pavement boundaries replace inferred centreline junction caps wherever available. OSM centrelines remain underneath as the editable semantic, elevation, navigation, and future collision layer.
- Current results and any streets needing manual review are published in [`ROAD-VALIDATION.md`](ROAD-VALIDATION.md). Some ORN deliveries do not expose a usable official-name field; the report marks that comparison unavailable rather than reporting a misleading score.

## Rendering improvements

- Ontario's 2025 lidar-derived bare-earth DTM replaces the former coarse global terrain as the primary landscape source, without vertical exaggeration
- Terrain queries use the same two-triangle interpolation that Three.js actually renders; roads and placed assets no longer use a conflicting bilinear surface that can pass above or below visible ground
- The full prepared map extent drives terrain, flight boundaries and map framing, including Trent and Fleming rather than a smaller downtown square
- Buildings, roads, parks and railways follow one shared rendered-terrain heightfield; official water surfaces preserve CGVD2013 stages and recess the underlying terrain to prevent buried shorelines
- OSM multipolygons support courtyards, holes, complex water and building outlines
- Building heights use `height`, `building:levels`, `min_height`, `building:min_level` and `roof:height`
- Stable procedural estimates replace random heights where source data is incomplete
- Every prepared building footprint is rendered through spatially tiled material buffers; the former traversal-order cap that hid most of the city has been removed, while street-level frustum culling can now reject distant tiles
- OSM roof-height values now produce real roof volume rather than being discarded
- Roads are continuous, coarse-tile-batched ribbon meshes. Exact OSM vertices are retained while long spans receive elevation-only samples no more than 16 m apart on the desktop profile (25 m on low-power devices)
- Official road, parking, curb and bridge geometry is triangulated and terrain-fitted over those ribbons, preserving real intersection throats, tapers, parking entrances, cul-de-sacs and pavement widths instead of generating circular junction fills
- Every road station and the interpolated pavement between stations samples the complete ribbon/foundation width at two-metre intervals; conservative cut/fill lifts keep both edges above cross-slopes, and true mapped tunnels retain their separate datum
- Lane-aware widths prevent divided Highway 115 carriageways and one-way downtown streets from becoming unrealistically wide; parking aisles, ramps, local roads and tracks use distinct generalized profiles
- Paved, service, tunnel and unpaved surfaces have distinct materials, with a slightly wider lower foundation that keeps road edges visible and seated against terrain
- Proposed, construction and indoor-corridor ways are excluded from the driveable renderer instead of appearing as completed asphalt
- Yellow two-way centrelines, white same-direction dividers and highway edge lines follow the exact sloped road surface and remain spatially culled without source-order truncation
- One unified junction pass removes the former overlapping major/minor caps, while bridge decks receive distance-based profiles, clearance, smooth network approaches, side skirts and matching rails
- `road-network.js` exposes the same road profiles, resampling rules and spatial surface-height query used by the renderer; queries accept vehicle height and can return every stacked deck so overpasses do not snap vehicles to the road below
- CI reconstructs the deployed Ontario lidar mesh and checks nearly three million pavement points across all 5,947 non-tunnel rendered roads; the current asset retains at least 0.104 m of visible terrain clearance
- Large terrain-following land and parking polygons are tessellated before elevation sampling, preventing a single coarse triangle from bridging hills as a floating slab
- Land cover is spatially batched; paths, railways, crossings, bridges, trees, transit furniture, street lights and traffic signals use instanced rendering
- Official City sidewalks, pathways and major trails follow their published lines; exact bus-stop points produce poles, signs and mapped shelters
- OSM pedestrian crossings use their mapped `crossing:markings` style (`zebra`, `ladder`, `lines`, or `dots`); explicitly unmarked and unspecified crossings do not receive invented paint
- Map mode adds a north-up, minimum-pixel road overlay and a map-appropriate near plane so every street remains legible at full-city altitude
- Traffic signals have visible lenses and street lights become emissive at dusk/night
- Terrain-following concrete curbs use the City's surveyed edge lines; the earlier inferred OSM curb/junction pass remains only as a complete fallback when municipal pavement data is unavailable
- Explicitly mapped cycle lanes and tracks receive continuous boundary paint, while sharrows remain unpainted rather than being misrepresented as protected lanes
- Up to 150 important named intersections receive compact, atlas-batched street-name signs on desktop (55 on the low-power profile)
- A city-wide, deterministic façade budget distributes windows across residential blocks and gives mapped retail/commercial footprints transparent storefront rhythms; façade panels remain batched by tile and material
- The Memorial Centre's oval roof is now a shallow upper shell seated on the three-level OSM arena footprint instead of a detached full ellipsoid
- Map mode is north-up, starts on the actual geographic centre, clamps panning to the city, and includes a dynamic scale and north arrow
- In addition to the original core landmarks, v1.5.5 adds the Canadian Canoe Museum, Showplace, Peterborough Museum & Archives, Art Gallery of Peterborough, Cathedral of Saint Peter-in-Chains and Healthy Planet Arena, plus navigation anchors for Riverview Zoo, Beavermead, the waterfront hotel/marina, Centennial Fountain, Jackson Park Pagoda Bridge and the Chemong retail gateway
- Residential, commercial, retail, industrial, meadow, forest and park land cover have separate styling
- Multi-stage Otonabee/Lift Lock water polygons split kilometre-scale triangulation chords and sample local breakline stages, preventing artificial diagonal water ramps
- Simple residential footprints receive deterministic gabled or hipped roof planes; complex and explicitly flat roofs keep conservative tagged geometry
- Up to 4,200 desktop trees (1,400 on the low-power profile) use mixed deciduous and conifer forms while staying instanced
- Five data-driven captured-detail pilots are georeferenced and ready for licensed SPZ or Spark RAD assets; missing, disabled, failed and unsupported captures always reveal the complete mesh fallback
- Live-data fallbacks and visible source attribution remain available

## Hybrid captured-detail layer

`data/splats/manifest.json` defines the Lift Lock, Downtown George Street, Del Crary Park/Little Lake, Trent University and Canadian Canoe Museum pilots. It records each anchor, Ontario vertical offset, orientation, scale, bounds, fade and unload distances, priority, LOD, attribution, licence and capture provenance. `city-splat-layer.js` owns Spark streaming behind one isolated interface and uses the Explorer's existing scene, renderer, camera and render loop.

The current repository contains **zero licensed production splat assets**. All five entries therefore remain honest mesh fallbacks and Spark stays lazily unloaded during normal exploration. Add an asset only after its licence status is `approved` and its required metadata is complete. See [`HYBRID-CITY-LAYER.md`](HYBRID-CITY-LAYER.md) for the coordinate contract, capture rules and calibration procedure.

## Controls

- `W A S D` or arrow keys: fly forward/back and strafe
- Mouse: click the city for continuous pointer-lock steering; hold and drag as a fallback; `Esc` releases the mouse
- Forward flight follows the complete view direction, including climbs and descents
- `Q / E`, `Page Down / Page Up`, or `Space`: descend / ascend
- `Shift`: temporary boost
- `Alt`: precision flight
- Mouse wheel: adjust persistent cruise speed
- `M`: toggle map mode
- `F`: return to fly mode
- `/`: open search
- `Ctrl + Alt + G`: developer-only landmark anchor, bounds, LOD and memory calibration overlay
- `Ctrl + Alt + R`: developer-only lawful aerial/street-imagery reference links centred on the camera (also available with `?referenceMode=1`)

Desktop motion uses analytic, frame-rate-independent velocity damping. Combined inputs are normalized, terrain/world-boundary collisions cancel outward velocity, pointer-lock loss and dialogs clear held inputs, and the testable control math lives in `fly-controls.js`.

## Asset build architecture

The project now uses a two-stage workflow:

1. **Deployment preprocessing:** download bounded OSM, terrain and authoritative comparison data; validate streets; publish the cached city assets and manifest.
2. **Browser rendering:** load the cached city model and only fall back to public APIs when required.

Use `python tools/geospatial/build_peterborough_assets.py --strict` for a fresh build, or `--reuse-osm --strict` to rebuild derived assets/validation during a temporary Overpass outage. See [`../tools/geospatial/README.md`](../tools/geospatial/README.md) and [`GEOSPATIAL-RESEARCH.md`](GEOSPATIAL-RESEARCH.md).

For the block-by-block visual-audit method and the exact licence boundaries for Ontario orthophotos, Mapillary, Panoramax, City open data, and visual-comparison-only services, see [`LAWFUL-CITY-REFERENCES.md`](LAWFUL-CITY-REFERENCES.md).

## Next development milestones

1. Commission and calibrate lawful, rights-cleared pilot captures, beginning with the Lift Lock and Canoe Museum.
2. Compare OSM footprints with Microsoft GlobalML and Overture for missing buildings and height attributes.
3. Add audited facade/roof references for more heritage, residential and retail sites without altering source footprints.
4. Add audited turn arrows, curb islands and roundabout interiors where source lane geometry supports them.
5. Add distance-based macro LODs and worker-based OSM conversion for lower-memory mobile hardware.

## Attribution

Map data © OpenStreetMap contributors. Municipal detail is from City of Peterborough eMaps/open data. Road validation uses Ontario Road Network open data. Terrain uses Ontario's 2025 lidar-derived DTM, and water geometry/stages use Ontario's Peterborough lidar hydro breaklines and Ontario Hydro Network, under the Open Government Licence – Ontario. Packaged Mapzen/Tilezen Terrarium tiles remain a terrain fallback. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

This is an unofficial fan-made project and is not affiliated with the City of Peterborough or Peterborough Fire Services.
