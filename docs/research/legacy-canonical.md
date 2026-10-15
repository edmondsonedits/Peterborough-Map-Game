# Belleville and Scarborough canonical location packs

Verified on 2026-10-15. These two existing city entries now have the same schema-1 canonical location format as the other route cities. Geo Guesser remains unavailable. Route targets are shared by Fire and EMS; the original civic seeds retain `recognitionDifficulty: null` and a 45 m arrival radius pending local review.

## Belleville

The [City fire service inventory](https://www.belleville.ca/home-and-property/fire-and-emergency-services/about-belleville-fire-and-emergency-services/) lists five operating stations: 60 Bettes Street, 72 Moira Street West, 4867 Old Highway 2, 516 Harmony Road and 26 Hoskin Road. The [County operating-base list](https://www.hastingscounty.com/communities/services/emergency-services) identifies Base 00 headquarters at 111 Millennium Parkway and Base 01 at 38 Farley Avenue. Headquarters has an ambulance deployment function and remains eligible.

Coordinates come from the City's [Address Points layer 1](https://gis.belleville.ca/arcgis/rest/services/BV_GIS/Address_Points/MapServer/1), queried by exact `FullAddr` and transformed by the server with `outSR=4326`. They identify published civic-address points; they are not claims about vehicle doors or exact driveways.

| Canonical ID | Municipal address-point OBJECTID |
| --- | ---: |
| `belleville-fire-1` | 9263 |
| `belleville-fire-2` | 2915 |
| `belleville-fire-3` | 18661 |
| `belleville-fire-4` | 13195 |
| `belleville-fire-5` | 19112 |
| `belleville-ems-00` | 14375 |
| `belleville-ems-01` | 11119 |

Farley is **44.16680243665393, -77.3491454191396**. The former package fallback was roughly 900 m north of the official address. `package.js` now uses the canonical municipal coordinates for all seven bases. The fire source is a static inventory supported by the operating-station page. The hypothetical `Fire_Stations_Proposed` GIS layer is no longer queried for operating facilities.

Bounds are `[[44.12,-77.50],[44.37,-77.23]]`, covering the northern volunteer stations as well as the urban area. Previous package bounds excluded Station 5.

Eight original call seeds use named, public civic destinations. Their addresses and names are supported by the City's [municipal sites inventory](https://www.belleville.ca/files/MAP_Appendix_2_-_List_of_Municipal_Sites_and_Facilities.pdf), [library contact page](https://www.bellevillelibrary.ca/about-us/contact-us/), [Glanmore directions](https://www.glanmore.ca/plan-your-visit/directions-and-parking/), [Quinte Sports and Wellness Centre page](https://www.belleville.ca/learn-and-play/recreation/quinte-sports-and-wellness-centre/), [regional transit page](https://www.belleville.ca/walk-ride-and-drive/transit/regional-transit/) and [Loyalist College locations](https://loyalistcollege.com/our-locations/). Exact civic coordinates use the same Address Points layer. Nearby road names come from the City's [Road Network layer 19](https://gis.belleville.ca/arcgis/rest/services/BV_Building/CityviewMap/MapServer/19), excluding generic ramp names.

## Scarborough

Scarborough is a geographic subset of Toronto. The [official fire facility layer](https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/3) supplies **17** records where `MUNICIPALITY_NAME = 'Scarborough'` and `TYPE_DESC = 'Fire Station'`. The [official ambulance facility layer](https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1) supplies **12** records where `MUNICIPALITY = 'Scarborough'`. Queries use `outFields=*`, `returnGeometry=true`, `outSR=4326`; coordinate values come from the returned point geometry. The mixed-case municipal value matters on these services.

The retained fire station numbers are 211–215, 221–223, 225, 231–232, 234 and 241–245. Stations 224, 226, 227, 233 and 235 are excluded: their command-district numbers begin with 2, but their municipal attributes place them in East York, former Toronto or North York. A rectangular bounds check or the 2xx number alone is insufficient.

The ambulance subset contains stations 20, 21, 22, 24, 25, 26, 27, 28, 29, 42 and 47, plus the distinct **26 Post** at 5316 Lawrence Avenue East. Station 26 is at 4331 Lawrence Avenue East. Both retain official number 26; the post has a distinct selection number and canonical ID. Canonical ambulance IDs use municipal OBJECTIDs, preventing collisions between station and post labels. Legacy fallback IDs remain aliases.

Bounds are `[[43.66,-79.355],[43.87,-79.10]]`.

Two future EMS facilities remain informative and ineligible:

- **MFS 02, 300 Progress Avenue:** the [City's September 4, 2025 groundbreaking release](https://www.toronto.ca/news/city-of-toronto-breaks-ground-on-90000-square-foot-state-of-the-art-paramedic-station/) and [2026 paramedic budget](https://www.toronto.ca/legdocs/mmis/2026/bu/bgrd/backgroundfile-261037.pdf) confirm construction. The coordinate is retained from the Toronto pack's municipal structure point. An anticipated construction completion is not used as an actual opening date.
- **Ambulance Post 04, 4610 Finch Avenue East:** the same budget and [adopted zoning decision](https://secure.toronto.ca/council/agenda-item.do?item=2025.SC24.1) establish a future depot project. No unique deployment entrance or operational opening is confirmed, so the point and opening date remain null.

Twelve original library call seeds are selected from the [City Toronto Public Library facility layer](https://services3.arcgis.com/b9WvedVPoizGfvfD/arcgis/rest/services/COTGEO_TPL_FACILITY/FeatureServer/0) using `MUNICIPALITY = 'Scarborough'`. Each preserves the published civic address and point, plus its official branch URL. Nearby road names are drawn from the [Ontario Road Network composite layer 5](https://services1.arcgis.com/TJH5KDher0W13Kgo/arcgis/rest/services/Ontario_Road_Network_Composite_Service_GeoHub_View_EN/FeatureServer/5), queried around each facility. Nearby-road context does not imply that each pair is a vehicle entrance.

## Regression checks

Run `node tools/test_route_legacy_city_data.cjs`. It checks the exact active inventories, exclusions, separate 26 facilities, planned eligibility, shared seed metadata, bounds, and the Farley correction in both canonical and legacy package data. Future route curation may add locations while preserving the original unranked civic seed IDs.
