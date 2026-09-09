# Commercial Map Setup

Release: **v1.6.37**

Emergency Games now separates **public/demo map services** from **department/commercial map services**.

The public demo can continue using the existing development map stack. A paid/private department deployment is expected to supply explicitly licensed production services.

## Department deployment configuration

Configure map services before the simulator scripts load:

```html
<script>
window.PTBO_DEPLOYMENT = {
  mode: 'department',
  department: 'peterborough_fire',
  analyticsEnabled: true,
  publicLeaderboardEnabled: false,
  map: {
    arcgisAccessToken: 'ARCGIS_ACCESS_TOKEN',
    osmTileUrl: 'https://YOUR-PROVIDER/{z}/{x}/{y}.png'
  }
};
</script>
```

Never commit real commercial tokens/credentials to this public repository. Inject deployment configuration through the private hosting/deployment environment.

## Satellite imagery

The existing player experience remains Esri World Imagery with labels.

For a department/commercial deployment, v1.6.37 can redirect the legacy imagery request to the authenticated ArcGIS Location Platform World Imagery endpoint when `arcgisAccessToken` is provided.

Expected authenticated imagery endpoint:

```text
https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=...
```

The commercial policy also switches the reference-label layer to the current authenticated ArcGIS Static Basemap Tiles imagery-label service.

Before sale:

1. Create/choose the appropriate ArcGIS developer/location-platform account.
2. Create a token/API credential appropriate for the web deployment.
3. Restrict the credential as supported by the provider (allowed origins/referrers and only required privileges/services).
4. Confirm attribution is visible at every zoom and on mobile/desktop.
5. Review the current Esri service terms and pricing for the intended commercial use.
6. Load-test expected tile/session volume before signing a department contract.

If no commercial ArcGIS token is configured, **department/commercial mode fails closed** rather than silently using the public development imagery endpoint.

## Street map / OpenStreetMap-derived map

OpenStreetMap data can be used under its applicable open-data licence, but the OpenStreetMap Foundation community tile servers are not a production SLA-backed commercial hosting service.

The public demo normalizes the community URL to:

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

For department/commercial mode, supply a licensed/self-hosted production tile URL in `osmTileUrl`.

Examples of acceptable architecture:

- paid OSM-derived tile provider with commercial application terms/SLA
- department/vendor-hosted tiles
- self-hosted tiles generated from appropriately licensed OSM data

Do not use bulk/offline prefetch against the OSM Foundation community tile servers.

If `osmTileUrl` is missing in department/commercial mode, the street-map option is disabled/fails closed.

## CARTO

CARTO Positron/Dark Matter remain disabled unless a current CARTO tile template **and** project API key are explicitly supplied.

Optional configuration:

```js
window.PTBO_MAP_CONFIG = {
  cartoApiKey: 'YOUR_CARTO_KEY',
  cartoTileUrl: 'CURRENT_CARTO_TILE_TEMPLATE_WITH_{apiKey}'
};
```

Do not re-enable the old anonymous `basemaps.cartocdn.com` pattern without confirming the current CARTO basemap terms/API-key format.

## Runtime readiness check

After the simulator loads, inspect:

```js
window.PTBO_MAP_READINESS
```

A department deployment should report:

```js
{
  commercial: true,
  arcgisSatellite: 'configured',
  streetTiles: 'configured',
  readyForCommercialMaps: true
}
```

Treat `readyForCommercialMaps: false` as a deployment blocker.

## Attribution

`shared/map-attribution-1.6.35.js` automatically detects the active provider and keeps required attribution visible/clickable for Esri, CARTO and OpenStreetMap.

Attribution is not a substitute for a valid provider licence/account. Both must be correct before commercial launch.
