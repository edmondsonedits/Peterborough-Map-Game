# Lawful city-reference workflow

The shipped City Explorer contains no copied street-view or satellite pixels. Its authoritative layers remain Ontario/municipal/open geospatial data and OpenStreetMap geometry. Reference imagery is used to identify errors and decide how procedural materials, roofs, façades, curbs, parking areas, and vegetation should be represented.

## Recommended sources

| Source | Best use | Licence / handling |
| --- | --- | --- |
| [Ontario South Central Orthophotography 2023](https://open.canada.ca/data/en/dataset/a3ebafa1-bda6-4fc4-b91f-b3fbd8d49c1a) | Current roof outlines, road surface extents, medians, parking aisles, tree cover, and site layout | Open Government Licence – Ontario. Record dataset vintage and attribution for any derived production data. |
| [City of Peterborough Open Data](https://www.peterborough.ca/council-city-hall/open-data/) | Municipal boundaries, parks, facilities, roads, trails, and other semantic layers | The City states that open datasets may be used, reused, and redistributed. Validate each downloaded dataset and retain its metadata. |
| [Mapillary](https://www.mapillary.com/app/) | Lawful street-level visual comparison of façades, signs, poles, lanes, and streetscape character | Images are shared under CC BY-SA. Retain creator/source attribution and review share-alike obligations before producing a derived asset. The current game only opens the viewer; it does not download imagery. |
| [Panoramax](https://explore.panoramax.fr/) | Open street-level imagery where local coverage exists | A federation may accept Licence Ouverte 2.0 or CC BY-SA 4.0 imagery. Check the individual sequence licence and metadata before deriving anything. |
| [Ontario lidar-derived DSM](https://data.ontario.ca/dataset/ontario-digital-surface-model-lidar-derived) | Evidence for rooftop, mature-tree, tower, and other above-ground heights | Open Government Licence – Ontario. Coverage dates vary, so do not treat it as a current façade survey. |

City eMaps and Google Maps/Street View can be consulted manually for lawful visual comparison, subject to their terms. Do not scrape, download, trace into distributable textures, or make Gaussian splats from those services without separate, explicit reuse rights.

## Block-by-block production method

1. Start with the authoritative OSM footprint and Ontario terrain position; never move a road or building merely to match perspective-distorted imagery.
2. Compare the 2023 Ontario orthophoto for road edge, median, intersection, parking, roof-plan, and vegetation discrepancies.
3. Compare openly licensed street imagery for façade class, storey count, roof form, material family, window rhythm, storefront character, and street furniture.
4. Encode reusable observations as OSM/GIS tags, a procedural rule, or a reviewed landmark record. Avoid one-off unexplained offsets.
5. Record source URL, licence, attribution, imagery date, reviewer, and processing note for every manually authored landmark asset.
6. Recheck at road level and from an elevated orthographic view. The mesh-only city must remain complete if reference imagery or optional splats are unavailable.

## Developer controls

Open City Explorer with `?referenceMode=1`, or press `Ctrl+Alt+R`, to display developer-only links centred on the current camera position. The ordinary player view remains unchanged. `Ctrl+Alt+G` continues to toggle the Gaussian-splat calibration overlay.
