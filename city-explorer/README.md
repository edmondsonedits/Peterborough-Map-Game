# Peterborough 3D City Explorer

Browser-based, low-poly 3D recreation of Peterborough, Ontario, built from open geospatial data.

## Current geospatial pipeline

- **Cached OpenStreetMap extract:** roads, railways, buildings, building parts, water, parks, land use and mapped trees
- **Ontario Road Network:** independent public-road centreline and official street-name validation
- **osmtogeojson:** Polygon and MultiPolygon conversion with courtyards and holes
- **Mapzen/Tilezen Terrarium:** cached elevation tiles used to displace the landscape
- **Three.js:** terrain, merged buildings, instanced roads, trees, landmarks and flight controls
- **Nominatim:** bounded Peterborough address and place search

The browser prefers versioned deployment assets in `city-explorer/data/`. Live Overpass and Terrarium requests remain fallbacks when a cache is absent or fails to load.

## Geographic accuracy measures

- OSM street coordinates are used directly rather than being redrawn by hand.
- A deployment job downloads the complete ORN result through object-ID pagination, preventing ArcGIS transfer limits from silently dropping streets.
- Public drivable OSM streets are compared with ORN in NAD83 / UTM zone 17N, with centreline samples approximately every 15 metres in both directions.
- ORN Official Street Name records are joined to road elements and compared with normalized OSM names.
- Service roads, parking aisles, driveways, tracks and explicitly private roads remain visible, but are kept outside the authoritative public-road pass criteria because ORN does not consistently represent them.
- Current results and any streets needing manual review are published in [`ROAD-VALIDATION.md`](ROAD-VALIDATION.md).

## Rendering improvements

- Real elevation replaces the original flat ground plane
- Buildings, roads, parks, water, railways and landmark beacons follow terrain
- OSM multipolygons support courtyards, holes, complex water and building outlines
- Building heights use `height`, `building:levels`, `min_height`, `building:min_level` and `roof:height`
- Stable procedural estimates replace random heights where source data is incomplete
- Building geometry is merged by material to reduce draw calls
- Roads, paths, railways and trees use instanced rendering
- Residential, commercial, retail, industrial, meadow, forest and park land cover have separate styling
- Live-data fallbacks and visible source attribution remain available

## Controls

- `W A S D`: move
- `Q / E`: descend / ascend
- `Shift`: fly faster
- Mouse: look around after clicking the city
- `M`: toggle map mode
- `F`: return to fly mode
- `/`: open search

## Asset build architecture

The project now uses a two-stage workflow:

1. **Deployment preprocessing:** download bounded OSM, terrain and authoritative comparison data; validate streets; publish immutable browser assets.
2. **Browser rendering:** load the cached city model and only fall back to public APIs when required.

The pipeline is rebuilt when geospatial code changes, can be run manually and refreshes monthly. Alignment thresholds are enforced in CI. See [`../tools/geospatial/README.md`](../tools/geospatial/README.md) and [`GEOSPATIAL-RESEARCH.md`](GEOSPATIAL-RESEARCH.md).

## Next development milestones

1. Compare OSM footprints with Microsoft GlobalML and Overture for missing buildings and height attributes.
2. Replace landmark beacons with custom Lift Lock, Hunter Street Bridge, Quaker Oats, Memorial Centre and PRHC models.
3. Add facade windows, roof forms, streetlights, utility poles, signals and street furniture.
4. Split the city into streamed geographic chunks with distance-based levels of detail.
5. Generate collision meshes and a routable street graph for driving, traffic and dispatch integration.

## Attribution

Map data © OpenStreetMap contributors. Road validation uses Ontario Road Network open data. Elevation is from Mapzen/Tilezen Terrarium tiles derived from open elevation datasets. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

This is an unofficial fan-made project and is not affiliated with the City of Peterborough or Peterborough Fire Services.
