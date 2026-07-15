# Peterborough 3D City Explorer

Browser-based, low-poly 3D recreation of Peterborough, Ontario, built from open geospatial data.

## Current geospatial pipeline

- **OpenStreetMap / Overpass:** roads, railways, buildings, building parts, water, parks, land use, and mapped trees
- **osmtogeojson:** converts OSM ways and relations into GeoJSON with proper polygon and multipolygon support
- **Mapzen/Tilezen Terrarium:** decodes raster elevation tiles and displaces the city terrain
- **Three.js:** renders the terrain, merged building meshes, instanced roads, trees, landmarks, and flight controls
- **Nominatim:** bounded Peterborough address and place search

## Improvements in the geospatial-data upgrade

- Real elevation replaces the original flat ground plane when terrain tiles are available
- Buildings, roads, parks, water, railways, and landmark beacons follow the landscape
- OSM multipolygon relations support courtyards, holes, complex water bodies, and complex building outlines
- Building heights use `height`, `building:levels`, `min_height`, `building:min_level`, and `roof:height` tags when present
- Stable procedural height estimates replace random building heights when source data is incomplete
- Building geometry is merged into material batches to reduce draw calls
- Road, path, and railway segments are instanced and slope with the terrain
- Mapped trees and procedurally scattered park/woodland trees use instanced geometry
- Expanded land-cover styling for residential, commercial, retail, industrial, meadow, forest, and park areas
- Three Overpass endpoints and graceful terrain/OSM fallbacks improve reliability
- Visible data attribution and third-party notices are included

## Controls

- `W A S D`: move
- `Q / E`: descend / ascend
- `Shift`: fly faster
- Mouse: look around after clicking the city
- `M`: toggle map mode
- `F`: return to fly mode
- `/`: open search

## Architecture decisions

The live browser remains the fastest way to iterate, but the project is now structured around a future two-stage pipeline:

1. **Preprocess authoritative data** into optimized Peterborough tiles or glTF/3D Tiles.
2. **Stream those assets in the browser** instead of asking public APIs to generate the entire city on every visit.

This is the path used by mature projects such as OSM2World, OSMBuildings, MapLibre-based city viewers, and voxel-city research tools. See [`GEOSPATIAL-RESEARCH.md`](GEOSPATIAL-RESEARCH.md) for the source audit and roadmap.

## Next development milestones

1. Download and cache Peterborough-specific OSM and elevation data during deployment instead of at runtime.
2. Compare OSM footprints against Microsoft GlobalML and Overture building coverage for missing structures and height attributes.
3. Replace landmark beacons with custom models for the Lift Lock, Hunter Street Bridge, Quaker Oats, Memorial Centre, and PRHC.
4. Add facade windows, roof forms, streetlights, utility poles, traffic signals, and street furniture.
5. Add streamed geographic chunks and level-of-detail switching.
6. Add street-level driving physics, road-following traffic, and dispatch integration.

## Attribution

Map data © OpenStreetMap contributors. Elevation is loaded from Mapzen/Tilezen Terrarium tiles derived from open elevation datasets. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for software and data notices.

This is an unofficial fan-made project and is not affiliated with the City of Peterborough or Peterborough Fire Services.
