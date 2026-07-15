# Third-Party Notices and Data Attribution

## Three.js

Project: <https://github.com/mrdoob/three.js>

Used as the WebGL rendering engine and for `BufferGeometryUtils`.

Licence: MIT.

## osmtogeojson

Project: <https://github.com/tyrasd/osmtogeojson>

Copyright © 2013 Martin Raifer and contributors.

Used to convert OpenStreetMap Overpass JSON into GeoJSON, including proper polygon and multipolygon handling.

Licence: MIT. The copyright and permission notice must be retained in copies or substantial portions of the software.

The project loads the published browser build from jsDelivr rather than vendoring a modified source copy.

## OpenStreetMap

Website: <https://www.openstreetmap.org/>

Map data © OpenStreetMap contributors.

OpenStreetMap data is made available under the Open Database Licence. The application displays attribution in its interface and documentation.

Overpass API is used to retrieve a bounded Peterborough extract. Nominatim is used only for explicit user searches and is not queried as autocomplete.

## Mapzen / Tilezen Terrarium elevation tiles

Project documentation: <https://github.com/tilezen/joerd>

The explorer requests Terrarium-format elevation tiles from the public `elevation-tiles-prod` bucket and decodes the documented RGB elevation format.

Terrarium tiles combine elevation from open source datasets. Source and licence conditions can vary by underlying dataset. This project identifies the tile source in the interface and uses the tiles only to render terrain. A future production pipeline should record the exact source dataset and licence for the Peterborough extract.

## External projects reviewed but not bundled

The following projects informed architecture or future plans but their source code is not included as a dependency:

- OSMBuildings: <https://github.com/OSMBuildings/OSMBuildings>
- OSM2World: <https://github.com/tordanik/OSM2World>
- VoxCity: <https://github.com/kunifujiwara/VoxCity>
- Microsoft GlobalML Building Footprints: <https://github.com/microsoft/GlobalMLBuildingFootprints>
- Overture Maps schema: <https://github.com/OvertureMaps/schema>
- MapLibre GL JS: <https://github.com/maplibre/maplibre-gl-js>
