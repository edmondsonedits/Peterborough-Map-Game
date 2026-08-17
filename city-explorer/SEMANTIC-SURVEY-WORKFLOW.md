# Semantic city survey workflow

The survey layer is the repeatable bridge between lawful overhead reference imagery and the editable 3D city. It records *what exists and where* as geographic data before choosing how that feature looks in Three.js.

## Authoritative order

1. Ontario LiDAR remains the elevation datum.
2. Municipal and OSM road, hydro, building, and land-cover geometry remains authoritative.
3. A georeferenced orthophoto is shown only in the developer survey view to reveal omissions or alignment errors.
4. Stable observations are digitized as semantic points, lines, or polygons in EPSG:4326.
5. Each record is reviewed with its source, licence, capture date, confidence, and status intact.
6. The runtime converts verified records into replaceable low-poly 3D objects.

Temporary vehicles, people, construction, shadows, and seasonal clutter are not permanent city inventory. A single image is never treated as proof that a transient object belongs in the city.

## Geometry model

- Points: trees, streetlights, signs, hydrants, and landmark anchors.
- Lines: curbs, fences, reviewed facade edges, lane markings, and other narrow linear features.
- Polygons: building footprints, paved areas, and planting areas.

The first production district is centred on Peterborough Fire Station 1. It covers 662,695 m²—exactly ten times the original 66,270 m² calibration tile—and uses a 4,096-pixel South Central Ontario Orthophotography 2023 extract licensed under the Open Government Licence - Ontario. Reviewed Station 1 details are stored in `data/survey/station-one-survey.geojson`; the generated district inventory is `data/survey/station-one-district-inventory.geojson`; and the calibrated developer reference is `data/survey/station-one-district-orthophoto-2023.jpg`.

The generated inventory currently indexes 441 source building footprints, 110 authoritative road-surface polygons, 294 curb sections, and 99 mapped trees. Source-aligned inventory is deliberately distinguished from manually reviewed site detail in the editor.

## Developer use

Open City Explorer with `?survey=1` or press `Ctrl+Alt+S`. The view moves above the complete 10× district and displays the terrain-draped north-up reference overlay.

1. Adjust reference opacity to compare the orthophoto with the GIS city.
2. Select a stable point type and choose **Place point**.
3. Click its ground position. A yellow draft marker is stored locally in geographic coordinates.
4. Use **Undo** to remove the latest draft or **Export GeoJSON** for review.
5. Review exported records against the source and promote only defensible observations to `verified` in the production GeoJSON.

The player view never requires the reference image. If the survey file or overlay is missing, terrain, roads, buildings, water, and existing landmarks still load normally.

## Expansion rule

Regenerate the source-aligned district with `node tools/geospatial/build_station_one_accuracy_district.mjs`. Add new neighbourhood tiles as separate GeoJSON collections with stable IDs and explicit source metadata. Do not scatter visual offsets through rendering code. Reusable citywide classes should be rendered by `semantic-survey.js`; exceptional landmarks should keep a simplified mesh fallback and use their own documented asset record.
