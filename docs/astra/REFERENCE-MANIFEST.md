# Reference Manifest

This file records reference classes and handling rules. It does not replace source-specific metadata stored with generated assets.

| Reference | Current use | Authority / handling |
|---|---|---|
| Ontario 2025 lidar-derived DTM | Bare-earth elevation | Primary terrain datum; CGVD2013. Local packaged asset: `city-explorer/data/terrain/peterborough-dtm-2025-terrarium.png` plus metadata JSON. |
| City of Peterborough Basedata | Buildings, road surfaces, curb/edge, parking, bridges | Authoritative municipal geometry where used. Packaged GeoJSON under `city-explorer/data/`. |
| City of Peterborough eMaps | Parks, trails, sidewalks/pathways, transit, recreation, POIs | Municipal semantic/detail source. Packaged in `peterborough-city-open-data.geojson`. |
| OpenStreetMap | Roads, buildings/building parts, land use, trees, crossings and semantic tags | Core editable semantic geometry; attribution required. Cached in `peterborough-osm.json` and derived GeoJSON. |
| Ontario Road Network | Independent road-centreline/name validation | Validation reference, not a complete reference for private/service/parking roads. See `ROAD-VALIDATION.md`. |
| Ontario hydrography / lidar breaklines | Water stages, shoreline/waterbody/creek geometry | Authoritative hydro/vertical evidence where packaged. |
| South Central Ontario Orthophotography 2023 | Overhead visual audit and semantic survey | Open Government Licence – Ontario. Station 1 bounded developer reference: `data/survey/station-one-district-orthophoto-2023.jpg`. Do not treat transient objects as permanent truth. |
| Mapillary | Street-level visual comparison | Use per-image/sequence licence and attribution. Current game opens viewer links; do not assume imagery may be copied into production assets. |
| Panoramax | Street-level visual comparison where coverage exists | Check sequence-specific licence and metadata before deriving production work. |
| Google Maps / Street View | Manual visual comparison only | No scraping, downloaded textures, reconstruction, splats or training-derived assets without separate explicit rights. |

## Station 1 reference package
- Survey metadata: `city-explorer/data/survey/station-one-survey.geojson`
- District inventory: `city-explorer/data/survey/station-one-district-inventory.geojson`
- 2023 district orthophoto: `city-explorer/data/survey/station-one-district-orthophoto-2023.jpg`
- Local orthophoto calibration image: `city-explorer/data/survey/station-one-ontario-orthophoto-2023.jpg`
- Existing renders/screenshots: `city-explorer/screenshots/station-1-*`
- Station 1 OSM building source: `way/1009651229`

## Station 1 reviewed semantic evidence
Verified records currently include:
- authoritative/reviewed building footprint;
- apparatus-bay facade line with four bays;
- projecting entry facade;
- public-office facade;
- front planting bed;
- front flagpole;
- multiple stable tree positions.

## Captured-detail pilots
Configured pilots: Lift Lock, Downtown George Street, Del Crary/Little Lake, Trent University, Canadian Canoe Museum. Current asset status for all five: **missing/unapproved; mesh fallback only**. See `city-explorer/data/splats/manifest.json`.

## Reference acceptance rule
Every manually authored production landmark or detail derived from a visual reference must retain source URL/identifier, imagery/capture date, licence, attribution, reviewer/processing note and confidence where applicable.