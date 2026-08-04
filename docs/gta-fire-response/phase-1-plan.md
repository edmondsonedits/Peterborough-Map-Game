# Phase 1 Plan — Polished Movement Foundation

Version target: `0.4.0-phase1`  
Branch: `agent/gta-fire-phase-1-foundation`  
Production policy: draft PR only; no merge or deployment.

## Baseline findings

The v0.3.0 prototype already had a satellite map, Station 1, a recognizable compact fire-truck marker, direct-stick input, indexed OSM road centre-lines, a simple dispatch loop and one-button incident completion. The principal risks were mutable global state, scattered mission strings, centre-biased collision, replacement of the truck icon every frame, frequent queued Leaflet camera animations, no traffic or audio manager, no deterministic browser path and no automated test suite.

## Architecture

The Phase 1 runtime remains static Leaflet JavaScript and separates:

- Configuration and versioning: `src/config.js`
- Pure math and interpolation: `src/math.js`
- Named state transitions: `src/state.js`
- Keyboard/touch collection: `src/input.js`
- Indexed road geometry and swept vehicle footprint: `src/road.js`
- Marker and line reuse: `src/renderer.js`
- Cadenced north-up camera and zoom hysteresis: `src/camera.js`
- Pooled local traffic simulation: `src/traffic.js`
- Procedural Web Audio siren/tones: `src/audio.js`
- Structure-fire equipment and suppression: `src/incident.js`
- HUD, dispatch, settings and debug mode: `src/ui.js`
- Fixed-step orchestration and player/truck physics: `src/game.js`
- Boot sequence: `src/main.js`

## Milestones

1. Baseline, debug mode and deterministic calls.
2. Immediate normalized on-foot movement and safe enter/exit.
3. Tunable heavy direct-stick truck handling and reverse behaviour.
4. Swept multi-point truck footprint, road-edge slide and intersection handling.
5. Cadenced look-ahead camera, zoom hysteresis and tile-load treatment.
6. Capped pooled traffic with emergency yielding and performance scaling.
7. Original lights, two procedural sirens and horn.
8. Dispatch subtitles, collapse/repeat controls, route and directional arrow.
9. Flagship structure-fire loop with compartment, hose, extinguisher, aiming and cleanup.
10. Mobile/desktop HUD, settings, pause/restart/return and persisted accessibility options.
11. Unit, syntax, HTTP and browser smoke validation.

## Acceptance strategy

Automated tests cover pure steering/state/road functions. Browser smoke uses deterministic test road data and a local Leaflet fallback so assertions do not depend on Esri. Production continues to load the real Peterborough GeoJSON and Esri imagery. Manual review remains required for real-road alignment, low-memory Android tile behaviour and a full 20-minute production-map soak.
