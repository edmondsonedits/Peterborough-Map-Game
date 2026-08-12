# Peterborough geospatial build pipeline

This pipeline produces the browser-ready Peterborough Explorer map cache, adds official municipal detail from the City of Peterborough eMaps service, and checks public-road geometry against Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.

## Build stages

`build_peterborough_assets.py` is the single supported build entry point. It:

- downloads one bounded OpenStreetMap extract from Overpass, including roads, footprints, water, parks, parking, street lamps and traffic signals;
- downloads and fully paginates the City's Bus Stops, Points of Interest, Recreation, Park, Major Trail, and Sidewalks and Pathways layers;
- queries those municipal layers in EPSG:4326, clips every returned geometry to the same Peterborough bounding box, and combines them in `city-explorer/data/peterborough-city-open-data.geojson`;
- downloads the City's separate Basedata Road Surface, Curb / Edge of Pavement, Parking lots / Other surface, and Bridge layers into `city-explorer/data/peterborough-road-surfaces.geojson`;
- removes only ArcGIS curve-densification noise in NAD83 / UTM zone 17N, with documented tolerances of 0.05–0.15 m, while preserving topology and official pavement boundaries;
- builds or integrity-checks the packaged Ontario 2025 lidar-derived DTM used as the browser's primary terrain, and caches Terrarium compatibility tiles;
- imports Ontario's official 2016-17 Peterborough lidar PolygonZ hydro breaklines in EPSG:2958/CGVD2013, preserving the distinct lock-controlled water stages;
- clips and de-duplicates Ontario Hydro Network waterbodies and permanent/intermittent stream centrelines to fill small-pond and creek coverage gaps;
- discovers and fully paginates the current ORN ArcGIS road layer;
- excludes driveways, parking aisles, tracks and explicitly private roads from the public-road comparison;
- projects both networks to NAD83 / UTM zone 17N and samples centrelines in both directions at approximately 15 metre intervals;
- writes the map assets, machine-readable validation metrics, manual-review candidates and `city-explorer/ROAD-VALIDATION.md`.

Object-ID pagination is deliberate: ArcGIS geometry transfer limits can otherwise return a partial page that appears complete while omitting roads, parks, trails, or street furniture.

The road-surface snapshot is the visual pavement authority. OSM remains the semantic centreline authority for names, lane metadata, elevation smoothing, navigation, and future collision queries. Run `python tools/geospatial/build_peterborough_assets.py --road-surfaces-only` to refresh only the surveyed pavement asset and its manifest entry.

## Official terrain

`official_lidar_terrain.py` exports a bounded Float32 mosaic from Ontario's Digital Terrain Model service, explicitly selecting the `DEDSFM Central East 2025` project. It converts that mosaic to lossless Terrarium RGB while preserving CGVD2013 heights to 1/256 m, then records the source catalogue selection, CRS, bounds, resolution, elevation range and SHA-256 integrity values in `peterborough-dtm-2025.json`. The current 1,536 × 1,878 asset resolves approximately 8.30 m on the ground; the source catalogue's native lidar DTM resolution is 0.5 m.

Normal builds reuse and integrity-check the packaged official asset. Pass `--refresh-official-terrain` to re-export it from Ontario's ImageServer. The older 3×3 global Terrarium mosaic remains an offline compatibility fallback only.

## Official hydrography and water levels

`peterborough-hydrography.geojson` combines sub-metre-simplified lidar shorelines and staged Z elevations with OHN waterbodies/watercourses. Lidar geometry takes precedence wherever it substantially covers an OHN polygon, preventing duplicate floating shoreline slivers. The browser triangulates those 3D rings, recesses terrain beneath the resulting surface, and uses a spatial triangle index so Little Lake, the Otonabee River and the Trent Canal retain their real level changes. Narrow streams such as Jackson Creek follow terrain continuously instead of being flattened to one centroid height.

`hydrography-validation.json` requires lidar staging, OHN coverage, plausible CGVD2013 elevations, a lock-controlled stage span, and named coverage for Otonabee River, Little Lake and Jackson Creek.

## Official City eMaps detail

The combined City GeoJSON uses a stable `ptbo_layer` property (`bus_stops`, `points_of_interest`, `recreation`, `parks`, `major_trails`, or `sidewalks_pathways`) so the browser can style each class without coupling itself to ArcGIS layer IDs. Only useful public attributes are retained, such as stop and route names, shelter status, point-of-interest labels and addresses, recreation type, park name/type, and trail or sidewalk street context. ArcGIS object IDs are retained as top-level GeoJSON feature IDs for deterministic de-duplication rather than repeated in every property object.

The manifest records the combined file, service URL, EPSG:4326 query bounds, total feature count, per-layer counts, layer metadata, and whether a packaged cache had to be reused. If any City layer cannot be refreshed, the builder reuses the last complete `peterborough-city-open-data.geojson` instead of publishing a silently partial municipal dataset. A first build therefore needs either access to the public eMaps service or an existing packaged cache.

## Current verified snapshot

The v1.5.5 asset refresh passed strict validation using an OpenStreetMap cache dated 2026-06-12, City eMaps and ORN data retrieved on 2026-08-01:

- 4,326 official municipal features: 595 transit stops, 189 points of interest, 186 recreation points, 104 parks, 130 major trails, and 3,122 sidewalks/pathways;
- 16,195 official street-shape features: 4,554 road surfaces, 9,610 curb/edge features, 1,924 parking surfaces, and 107 bridges;
- 2,701 public OpenStreetMap road features;
- 3,179 complete ORN road features;
- 0.649 m median OSM-to-ORN offset and 99.01% of OSM samples within 20 m;
- 0.662 m median ORN-to-OSM offset and 97.38% of ORN samples within 20 m.

The current ORN layer did not expose a usable official street-name field, so this refresh reports positional alignment only rather than inventing a name-agreement score. Values can change when upstream data is refreshed; the generated report remains the source of truth.

## Local build

```bash
python -m pip install -r tools/geospatial/requirements.txt
python tools/geospatial/build_peterborough_assets.py \
  --output city-explorer/data \
  --report city-explorer/ROAD-VALIDATION.md \
  --strict
```

If Overpass is temporarily unavailable, rebuild and validate the packaged source extract without downloading new OSM data:

```bash
python tools/geospatial/build_peterborough_assets.py \
  --output city-explorer/data \
  --report city-explorer/ROAD-VALIDATION.md \
  --reuse-osm \
  --strict
```

Generated files include the cached OSM extract, combined official City eMaps GeoJSON, official pavement/curb/parking/bridge GeoJSON, complete ORN comparison layer, public-road comparison layer, Ontario lidar heightmap and metadata, Terrarium fallback tiles, manifest, machine-readable metrics and the human-readable validation report.

## Renderer regression checks

Run the renderer and asset regression checks after changing road, terrain, land, or water code:

```bash
node tools/geospatial/test_road_network.mjs
node tools/geospatial/test_road_terrain_clearance.mjs
node tools/geospatial/test_official_road_surfaces.mjs
node tools/geospatial/test_water_system.mjs
node tools/test_land_surface.mjs
node tools/test_terrain_heightmap.mjs
python tools/geospatial/test_official_lidar_terrain.py
```

The road checks validate all 5,955 classified drivable ways, profiles, source-vertex retention, sampling gaps, grades, junction surface selection, exact terrain-triangle interpolation and cross-slope envelopes. The full-city check decodes the packaged Ontario lidar heightmap, reconstructs the exact browser terrain grid, and samples the complete pavement width along every non-tunnel road. It fails if any tested pavement point enters the visible terrain mesh. The remaining checks cover water triangulation, terrain-following land tessellation, official heightmap sampling and offline source/asset integrity.
