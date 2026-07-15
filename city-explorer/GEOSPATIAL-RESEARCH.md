# Peterborough Geospatial and 3D-Code Research

Research date: July 2026

## Main finding

A search across GitHub, general web results, public 3D-model sites, and municipal/open-data references did **not** reveal a clearly downloadable, georeferenced, license-compatible, citywide 3D model of Peterborough, Ontario that could simply be inserted into this project.

There may be isolated landmark models or private planning/CAD datasets, but none found in this review combined all of the following:

- Peterborough, Ontario rather than Peterborough, England
- useful city-scale coverage
- downloadable source geometry
- clear reuse rights
- geographic coordinates suitable for direct placement
- browser-ready performance

The strongest approach is therefore to assemble Peterborough from open geographic layers, then replace important procedural buildings with custom landmark models.

## Peterborough geography that the renderer must preserve

Peterborough is not flat. Downtown and the south end occupy lower terrain around the Otonabee River and Little Lake, while land rises toward the west, north, and east. The Peterborough drumlin field and Armour Hill are important to the city's recognizable shape. The Lift Lock exists because the Trent-Severn Waterway climbs this elevation change.

Practical consequences for the project:

- a flat city plane is visually inaccurate
- the Otonabee River, Little Lake, canal, Jackson Creek, and related water geometry must be coherent
- roads and structures need elevation-aware placement
- terrain should remain relatively subtle downtown but become more visible toward the edges and Armour Hill
- custom Lift Lock geometry must be terrain- and water-level-aware

## Projects and codebases reviewed

### osmtogeojson

Repository: <https://github.com/tyrasd/osmtogeojson>

Useful idea: convert raw Overpass JSON to GeoJSON instead of maintaining a partial OSM relation parser. It supports OSM polygon detection, multipolygons, and Overpass geometry modes.

Applied now:

- browser-loaded MIT-licensed converter
- Polygon and MultiPolygon rendering
- courtyard and hole support
- relation-based parks, water, and buildings
- internal simple-way parser retained as a fallback

### OSMBuildings

Repository: <https://github.com/OSMBuildings/OSMBuildings>

Useful ideas:

- tile-oriented 3D building delivery
- GeoJSON building extrusion
- scalable separation between map data and rendering
- roof/building-part processing concepts

Applied now:

- data/rendering separation
- batched building geometry
- OSM building-part and height-tag awareness

Not copied:

- GPL-licensed fragments identified in its third-party notices
- its full rendering engine

### OSM2World

Repository: <https://github.com/tordanik/OSM2World>

Useful idea: preprocess OSM into richer 3D assets rather than recreating every object in the browser. OSM2World can export 3D world models and is a strong candidate for a future Peterborough asset-generation workflow.

Applied now:

- architecture roadmap for offline conversion and browser streaming
- OSM semantic tags treated as model-generation inputs rather than merely map styling

Potential next use:

- export selected districts or landmarks to glTF/OBJ
- study roof, barrier, bridge, vegetation, and street-furniture rules

### Mapzen/Tilezen Joerd and Terrarium

Repository: <https://github.com/tilezen/joerd>

Useful idea: encode elevation in RGB raster tiles that can be decoded directly in a browser.

Applied now:

- 3×3 Terrarium tile mosaic around downtown Peterborough
- official Terrarium formula: `(red * 256 + green + blue / 256) - 32768`
- displaced Three.js terrain
- terrain sampling for buildings, roads, land polygons, trees, cameras, and landmarks
- flat fallback if the tile service is unavailable

### VoxCity

Repository: <https://github.com/kunifujiwara/VoxCity>

Useful ideas:

- combine buildings, land cover, canopy, and terrain into one semantic city model
- choose the best available source per layer
- export models for downstream tools
- preserve data provenance

Applied now:

- separate semantic layers for buildings, land, transport, vegetation, and elevation
- visible attribution and source documentation
- roadmap for multi-source preprocessing

Potential next use:

- generate offline Peterborough voxel/OBJ prototypes
- compare land cover and canopy sources
- export a simulation-ready model for Blender or other tools

### Microsoft GlobalML Building Footprints

Repository: <https://github.com/microsoft/GlobalMLBuildingFootprints>

Useful data:

- large open building-footprint collection
- some height estimates
- confidence attributes
- permissive data licence

Not inserted into the live browser yet because the global files are too large for client-side querying. This should be used in a deployment-time Peterborough extraction job, then compared with OSM rather than blindly replacing community-edited OSM geometry.

### Overture Maps buildings

Schema repository: <https://github.com/OvertureMaps/schema>

Useful data model:

- building and building-part polygons
- height and floor counts
- minimum height and floor
- roof shape, orientation, direction, and roof height
- per-property source provenance

Potential next use:

- fill missing height/roof metadata
- compare source geometry against OSM and Microsoft footprints
- preserve provenance for each imported field

### MapLibre GL JS, CesiumJS, and deck.gl

These engines demonstrate production patterns for tiled geographic rendering, level of detail, terrain, labels, and very large datasets.

The project remains on Three.js because it needs game-like control and custom emergency gameplay, but should adopt their architectural patterns:

- geographic chunk streaming
- tile-based caching
- camera-dependent level of detail
- worker-based parsing
- label collision handling
- frustum and distance culling

## Code inserted in this upgrade

- Terrarium tile coordinate conversion, tile loading, RGB elevation decoding, bilinear elevation sampling, and terrain displacement
- terrain-aware object placement
- `osmtogeojson` multipolygon conversion
- polygon holes for courtyards and complex water geometry
- material-based building mesh merging using Three.js `BufferGeometryUtils`
- instanced terrain-sloped roads, paths, and railways
- instanced trees from OSM points and park/woodland scattering
- deterministic fallback building heights
- expanded Overpass query and endpoint fallbacks
- visible data attribution

The implementation is original integration code informed by these projects. No large third-party source file was copied into the repository.

## Recommended authoritative-data workflow

### Phase 1 — current browser prototype

- OSM/Overpass for city semantics
- Terrarium elevation for immediate terrain
- custom landmark models
- aggressive batching and instancing

### Phase 2 — deployment-time Peterborough build

- download one bounded OSM extract
- obtain the best available Canadian/Ontario DEM or LiDAR-derived terrain
- compare OSM, Microsoft, and Overture building footprints
- retain OSM identity and tags while selectively filling missing fields
- export optimized GeoJSON, binary geometry, or glTF chunks
- publish immutable versioned assets with attribution metadata

### Phase 3 — game-ready streamed city

- spatial quadtree or fixed grid chunks
- low/medium/high detail assets
- collision meshes separate from visual meshes
- road graph for traffic and dispatch routing
- custom landmark and emergency-scene assets
- offline caching for repeat visits

## Licensing rule

Only copy or adapt code when its licence is compatible and its attribution requirements are followed. Ideas and algorithms can be reimplemented, but source code without an explicit licence should not be copied. OSM-derived data must retain OpenStreetMap attribution and comply with the Open Database Licence.
