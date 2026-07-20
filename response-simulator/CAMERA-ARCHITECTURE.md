# Driving camera test architecture (v1.4.19)

The v1.4.19 camera remains isolated to `response-simulator/camera-game-test/`. The normal simulator does not load the camera module.

## Root cause

The v1.4.18 experiment moved Leaflet's translated `mapPane` into a viewport-sized wrapper and rotated the wrapper around the viewport centre. Leaflet continued to calculate layer and container points for the original DOM hierarchy. The CSS pivot and Leaflet's translated layer coordinate space could therefore disagree, producing a geographic-looking offset even when the truck latitude and longitude had not changed.

## Coordinate model

Leaflet retains exclusive control of `mapPane` and its translation. The camera module adds one child, `#ptbo-camera-world`, and reparents all geographic panes into it: tiles, vector overlays, markers, shadows, tooltips, and popups.

For truck layer point `p`, map-pane translation `t`, and camera rotation `R`, every geographic layer point `q` is rendered as:

`screen(q) = t + p + R(q - p)`

At the truck point, `q = p`, so:

`screen(p) = t + p`

The result is independent of camera bearing. Fixed Map and Driving View therefore use the same truck coordinate, the same Leaflet layer point, and the same road point. Camera rotation cannot introduce a truck-to-road offset because every geographic layer is transformed by the same matrix.

The map is centred on the truck synchronously from the truck marker's `setLatLng` call. Vehicle-heading smoothing uses shortest-angle interpolation. Fixed Map converges to an exact zero-degree bearing; Driving View follows the smoothed vehicle heading.

## Test telemetry

The test module exposes `window.PTBO_CAMERA_TEST_TELEMETRY`, `window.PTBO_DRIVING_CAMERA`, and the hidden DOM output `#ptbo-camera-telemetry`. Telemetry includes exact coordinates, raw and smoothed headings, bearing, screen anchor, position error, nearest-road error, frame timing, device pixel ratio, coordinate-space values, and captured JavaScript errors.
