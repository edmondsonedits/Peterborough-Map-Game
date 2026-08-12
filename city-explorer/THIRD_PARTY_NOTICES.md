# Third-Party Notices and Data Attribution

## Three.js

Project: <https://github.com/mrdoob/three.js>

Used as the WebGL rendering engine and for `BufferGeometryUtils`.

Version: `0.180.0`, vendored unmodified under `vendor/three-r180/`. This revision is required by Spark 2.1.0.

Licence: MIT. The supplied upstream `LICENSE` is retained beside the runtime.

## Spark

Project: <https://github.com/sparkjsdev/spark>

Documentation: <https://sparkjs.dev/>

Used only for the optional, proximity-streamed Gaussian-splat landmark layer. The conventional terrain, roads, water, buildings and landmarks do not depend on Spark.

Version: `2.1.0`, vendored unmodified under `vendor/spark-2.1.0/`.

Licence: MIT. The supplied upstream `LICENSE` is retained beside the runtime.

No third-party photographic capture is bundled with the five pilot entries. Every current pilot honestly uses its procedural mesh fallback.

## osmtogeojson

Project: <https://github.com/tyrasd/osmtogeojson>

Copyright © 2013 Martin Raifer and contributors.

Used to convert OpenStreetMap Overpass JSON into GeoJSON, including proper polygon and multipolygon handling.

Version: `3.0.0-beta.5`, vendored unmodified under `vendor/osmtogeojson-3.0.0-beta.5/`.

Licence: MIT. The supplied upstream `LICENSE` is retained beside the browser build.

## OpenStreetMap

Website: <https://www.openstreetmap.org/>

Map data © OpenStreetMap contributors.

OpenStreetMap data is made available under the Open Database Licence. The application displays attribution in its interface and documentation.

Overpass API is used to retrieve a bounded Peterborough extract. Nominatim is used only for explicit user searches and is not queried as autocomplete.

## Ontario Digital Terrain Model (Lidar-Derived)

Data catalogue: <https://data.ontario.ca/dataset/ontario-digital-terrain-model-lidar-derived>

ArcGIS item: <https://www.arcgis.com/home/item.html?id=776819a7a0de42f3b75e40527cc36a0a>

The Explorer's primary terrain is a prepared RGB heightmap exported from the Ontario Ministry of Natural Resources' Float32 Digital Terrain Model service. The packaged v1.5.5 asset selects the DEDSFM Central East 2025 lidar project, retains CGVD2013 elevations, and records the exact export bounds, source catalogue selection, resolution, checksums, and encoding in `data/terrain/peterborough-dtm-2025.json`.

Licence: Open Government Licence – Ontario, <https://www.ontario.ca/page/open-government-licence-ontario>

## Mapzen / Tilezen Terrarium fallback elevation tiles

Project documentation: <https://github.com/tilezen/joerd>

The deployment build caches Terrarium-format elevation tiles from the public `elevation-tiles-prod` bucket. The browser uses these packaged tiles only if the primary Ontario lidar heightmap cannot be decoded.

Terrarium tiles combine elevation from open source datasets. Source and licence conditions can vary by underlying dataset; they remain a compatibility fallback rather than the authoritative Peterborough terrain source.

## City of Peterborough eMaps and open data

Website: <https://www.peterborough.ca/council-city-hall/open-data/>

The Explorer uses public City eMaps layers for bus stops, points of interest, recreation facilities, parks, major trails, sidewalks and pathways. It also uses the City's public Basedata MapServer for Road Surface, Curb / Edge of Pavement, Parking lots / Other surface, and Bridge geometry. The build records the exact MapServer layers, query bounds, feature counts and refresh time in `data/manifest.json`; the interface and project documentation identify the City as the source.

- City Basedata MapServer: <https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer>

## Ontario Road Network

Service: <https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/0>

The deployment build uses Ontario's authoritative Road Net Element layer to validate the positional alignment and coverage of public OpenStreetMap road centrelines. The complete paginated comparison extract and current measurements are packaged in `data/orn-roads.geojson`, `data/road-validation.json`, and `ROAD-VALIDATION.md`.

Licence: Open Government Licence – Ontario, <https://www.ontario.ca/page/open-government-licence-ontario>

## Ontario lidar hydro breaklines and Ontario Hydro Network

Data catalogue: <https://data.ontario.ca/dataset/ontario-digital-terrain-model-lidar-derived>

The Explorer uses the Ontario Ministry of Natural Resources' Peterborough lidar hydro-breakline package for detailed PolygonZ shorelines and CGVD2013 water stages, plus Ontario Hydro Network waterbody and watercourse services for coverage gaps. Exact service/package URLs, query bounds, counts and validation results are recorded in `data/manifest.json` and `data/hydrography-validation.json`.

Licence: Open Government Licence – Ontario, <https://www.ontario.ca/page/open-government-licence-ontario>

## External projects reviewed but not bundled

The following projects informed architecture or future plans but their source code is not included as a dependency:

- OSMBuildings: <https://github.com/OSMBuildings/OSMBuildings>
- OSM2World: <https://github.com/tordanik/OSM2World>
- VoxCity: <https://github.com/kunifujiwara/VoxCity>
- Microsoft GlobalML Building Footprints: <https://github.com/microsoft/GlobalMLBuildingFootprints>
- Overture Maps schema: <https://github.com/OvertureMaps/schema>
- MapLibre GL JS: <https://github.com/maplibre/maplibre-gl-js>
