# Third-Party Notices

Release: **v1.6.37**

This file is a repository-level inventory for major third-party software, data and external map services used by Emergency Games. Component-specific licence files/notices remain controlling where supplied.

## Leaflet

Project: <https://leafletjs.com/>  
Runtime version: **1.9.4**  
Licence: **BSD 2-Clause**

Used for 2D interactive maps in the response simulator and related map tools.

## Leaflet.RotatedMarker

Project: <https://github.com/bbecquet/Leaflet.RotatedMarker>  
Licence: **MIT**

Used for rotated Leaflet markers/vehicle display support.

## Leaflet.EdgeBuffer

Project/package: Leaflet.EdgeBuffer  
Licence: **MIT**

Used to keep additional map tiles around the visible viewport where enabled.

## Three.js

Project: <https://github.com/mrdoob/three.js>  
City Explorer runtime version: **0.180.0**  
Licence: **MIT**

Used by City Explorer for WebGL rendering and related geometry utilities. The detailed City Explorer notice and bundled upstream licence are retained in the City Explorer vendor structure.

## Spark

Project: <https://github.com/sparkjsdev/spark>  
City Explorer runtime version: **2.1.0**  
Licence: **MIT**

Used by City Explorer for the optional Gaussian-splat landmark layer.

## osmtogeojson

Project: <https://github.com/tyrasd/osmtogeojson>  
City Explorer runtime version: **3.0.0-beta.5**  
Licence: **MIT**

Used to convert OpenStreetMap/Overpass data to GeoJSON in City Explorer.

## OpenStreetMap

Website: <https://www.openstreetmap.org/>  
Copyright: © OpenStreetMap contributors  
Data licence: **Open Database Licence (ODbL)**

OpenStreetMap data is used in map/geographic features. The OpenStreetMap Foundation community tile service has separate operational usage requirements and is not treated as an SLA-backed commercial tile host.

Public/demo Leaflet attribution is displayed in the map UI. Department/commercial deployments should use a licensed/self-hosted production tile service while preserving required OpenStreetMap attribution.

## Esri / ArcGIS map services

Website: <https://www.esri.com/>  
Service: World Imagery / reference-label basemap services

Esri/ArcGIS imagery is an **external hosted map service**, not an open-source dependency. Use is governed by the applicable Esri/ArcGIS account, service terms, pricing and attribution requirements.

Public/demo builds currently use the development/public imagery path. Department/commercial deployments are configured to require an explicit ArcGIS Location Platform access token (or another appropriately licensed provider) before sale.

World Imagery attribution can include Esri, Maxar, Earthstar Geographics and the GIS User Community depending on the displayed area/zoom.

## CARTO basemaps

Website: <https://carto.com/>  
Basemaps: Positron / Dark Matter (legacy options)

CARTO is an external hosted service. CARTO basemaps are disabled by the v1.6.37 runtime unless a current CARTO tile template and project API key are explicitly configured. When used, required OpenStreetMap and CARTO attribution must remain visible.

## Google Firebase / Cloud Firestore

Website: <https://firebase.google.com/>

Firebase/Firestore is used as an external cloud service for legacy analytics/leaderboard data. Firebase client web configuration/API keys are public client configuration, not a substitute for authentication or Firestore security rules.

Commercial/private analytics should use the security architecture documented in `docs/ANALYTICS-PRIVACY-SECURITY.md`.

## Ontario Digital Terrain Model and Ontario geospatial data

Primary licence: **Open Government Licence – Ontario**  
Licence: <https://www.ontario.ca/page/open-government-licence-ontario>

City Explorer uses Ontario lidar-derived terrain, Ontario Road Network and Ontario hydrography-related datasets as described in its detailed notices/manifests.

## City of Peterborough open data/eMaps

Website: <https://www.peterborough.ca/council-city-hall/open-data/>

City Explorer uses public City of Peterborough eMaps/open-data layers for geographic features as documented in its detailed data manifest and notices.

## Mapzen / Tilezen Terrarium elevation fallback

Project documentation: <https://github.com/tilezen/joerd>

City Explorer may use packaged Terrarium-format elevation fallback tiles. Underlying source/licence conditions can vary by contributing elevation dataset; this is a compatibility fallback rather than the authoritative Peterborough terrain source.

## Detailed City Explorer notices

See:

- `city-explorer/THIRD_PARTY_NOTICES.md`
- `city-explorer/LAWFUL-CITY-REFERENCES.md`
- relevant `vendor/**/LICENSE*` files
- City Explorer data manifests/validation documents

## Distribution checklist

Before any paid/private distribution:

1. Keep this file and all component-specific required licence notices.
2. Keep provider attribution visible in the product UI where required.
3. Confirm the intended commercial account/licence for external hosted map services.
4. Confirm customer-supplied data/assets are properly licensed for the deployment.
5. Do not treat a third-party open licence as permission to use unrelated trademarks/logos/photographs.
6. Re-run the repository commercial-readiness audit after adding a dependency, map provider, dataset, font, image library or external service.

This notice is an engineering inventory and does not replace the text of the applicable third-party licences/terms.
