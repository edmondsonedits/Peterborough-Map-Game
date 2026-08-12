# Peterborough hybrid city layer

## Authority and compatibility

Terrain, hydrography, roads, buildings, land cover and authored landmark meshes are always the authoritative city. Gaussian splats are optional appearance overlays only. They do not own the renderer, camera, scene, render loop, geographic transform, navigation surface or future collision geometry.

The browser runtime is pinned to Three.js `0.180.0` because Spark `2.1.0` declares `three >=0.180.0`. Spark is vendored locally and imported only when a licensed configured asset comes into range, or when `?splatPreflight=1` is used for QA. Spark RAD is preferred for very large captures because it supports progressive LOD and page streaming; SPZ is appropriate for compact landmark captures. The desktop target is 2.2 million visible splats, with 1.4 million on medium-memory hardware and 750,000 on mobile/low-power hardware. These are budgets, not promised densities.

Primary references reviewed for this design:

- Spark 2 and integration: <https://sparkjs.dev/>
- Spark LOD/RAD: <https://sparkjs.dev/docs/lod-getting-started/>
- Niantic SPZ: <https://github.com/nianticlabs/spz>
- Google Maps Platform terms: <https://cloud.google.com/maps-platform/terms>
- Cesium city-scale LOD example: <https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/>

Google Maps and Street View may be used for lawful visual comparison only. This project must not download, scrape, extract, reconstruct or train capture assets or textures from Google imagery.

## One coordinate path

1. Manifest anchors are WGS84 (`EPSG:4326`) latitude/longitude.
2. `project()` maps longitude to local +X east and latitude to local +Z south, in metres around the City Explorer origin.
3. An explicit CGVD2013 anchor elevation becomes local Y by subtracting the loaded Ontario terrain base elevation. When no surveyed anchor is available, the authoritative terrain height at the anchor is used.
4. The single manifest `verticalOffset` applies any documented survey/capture-origin correction.
5. Heading is degrees clockwise from true north and converts once to negative Three.js Y rotation. Pitch and roll convert to X and negative Z rotation. Scale is applied once to the capture root.
6. SPZ uses its documented RUB convention (+X right, +Y up, -Z forward). Any capture-tool conversion must be completed and recorded before the asset is accepted; unexplained offsets are not allowed elsewhere in the code.

## Production capture checklist

Use only owned, commissioned, public-domain or expressly licensed ground/drone photography. For every asset:

1. Confirm site access, flight/privacy permissions and redistribution rights.
2. Record owner, source, licence name/URL, capture date, CRS, vertical datum and capture-origin survey.
3. Remove or mask ground, roads and water that conflict with authoritative meshes.
4. Remove people, moving vehicles, sky and distant/background geometry.
5. Preserve the simplified mesh below the capture as its failure, distance and unsupported-device fallback.
6. Convert to SPZ or build RAD LOD, retain processing notes and verify attribution.
7. Set `licence.status` to `approved` only after review. The validator rejects a loadable asset with any other status.
8. Calibrate at ground level and overhead in daylight; do not conceal errors with fog, bloom or darkness.
9. Test fade, hysteresis, cancellation, repeated loading/unloading and GPU memory before release.

## Calibration and QA

Open the Explorer with `?splatCalibration=1&splatPreflight=1`, or press `Ctrl + Alt + G` to show anchors and diagnostic rings. The overlay reports the nearest pilot, distance, state, visible pilot/splat count, budget, approximate loaded bytes and city axes. Page datasets and `window.__PTBO_SPLAT_STATS__` expose the same information to automated QA.

The ordinary interface has one lightweight captured-detail toggle. Unsupported WebGL2/Three combinations, missing captures, network failures, decode failures and budget pressure all leave the mesh city usable. Loading uses an abort controller for SPZ requests, an unload radius larger than the activation radius for hysteresis, a maximum of two simultaneous desktop pilots (one low-power), and explicit Spark/mesh disposal on unload.

## Current pilot asset status

All five pilots are configured, but none has an approved production capture in this repository:

- Peterborough Lift Lock — mesh fallback
- Downtown George Street — mesh fallback
- Del Crary Park and Little Lake — mesh/hydro fallback
- Trent University — mesh fallback
- Canadian Canoe Museum — mesh fallback

Do not describe these as captured or complete until real assets and their rights/provenance records are present.
