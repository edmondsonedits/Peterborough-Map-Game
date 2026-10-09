# Fallback junction geometry prototype — October 9, 2026

## Scope and safety

- Branch: `prototype/road-junction-geometry-2026-10-09`, created from `main`. **Do not merge until the listed browser comparisons pass.**
- The existing Peterborough municipal pavement, bridge, curb and parking polygons remain authoritative and unchanged.
- The experimental junction solver runs **only** where the normal pipeline has no official road-surface coverage, **and** the URL includes `?junctionPrototype=1`.
- Without that query parameter, all existing circular fallback junctions, curb trimming and surface queries retain their original behaviour.
- This is an **opt-in geometry/contact prototype**, not a production-ready replacement for all intersections. Source files remain in the original format.

## Existing source pipeline inspected

1. `tools/geospatial/build_peterborough_assets.py` fetches/caches a bounded OSM extract, City eMaps/Basedata pavement and curb geometry, Ontario 2025 lidar DEM, and ORN comparison layers.
2. `tools/geospatial/road_alignment.py` reprojects to NAD83/UTM 17N and compares public OSM centrelines with ORN; the published October 1 report records 0.64 m median OSM→ORN offset. This validation does *not* establish surveyed curb, grade, or junction accuracy.
3. `city-explorer/road-network.js` classifies widths/lanes, preserves source vertices, samples terrain envelopes, smooths height profiles and exposes an indexed road-centreline height query.
4. `city-explorer/app.js` builds tile-batched asphalt/foundation ribbons, fallback circular junction fills, optional OSM curb fallback, road markings and rendered municipal pavement triangles.
5. `city-explorer/official-road-surfaces.js` indexes actual Float32 pavement triangles and disambiguates stacked decks by actor height. Truck gameplay uses this surface as its primary height source.
6. `tools/geospatial/test_road_network.mjs`, `test_road_terrain_clearance.mjs`, `test_official_road_surfaces.mjs` and `tools/test_rendered_pavement.mjs` already validate much of the municipal road pipeline.

## Confirmed limitations in reviewed code

- The fallback `buildRoadJunctions()` paints cylinders scaled to road width. This cannot reproduce asymmetric T-junctions or varying approach angles accurately. The surveyed-pavement path avoids that fallback in normal Peterborough loading.
- The fallback `buildUrbanCurbs()` uses short, fixed geometric end trims rather than intersection-mouth distances.
- Road-centreline distance may not be equivalent to the generated fallback junction's visible pavement footprint, so gameplay needed a matching triangle index.
- Existing Fire Truck kinematics accept `onRoad` (binary), with separate samples controlling truck pitch/roll, rather than individual material-specific tire forces. This is a possible future enhancement, not an error in the current kinematic control.
- The 3D authoring integration can batch and register OSM road ribbons; the experimental polygon batch does not yet have equivalent per-polygon editor selection. This is a known limitation.

## Prototype implementation

- `city-explorer/fallback-junction-geometry.js`: pure Three.js-free solver. Groups source OSM vertices by projected position and height, deduplicates coincident arms, requires at least three approach directions, intersects road boundary lines, computes bounded mouth trims and triangulates simple junction footprints.
- `city-explorer/app.js`: adds opt-in triangle-batched polygon/foundation meshes while retaining legacy caps for unsolved cases (including dead ends); uses proper winding for upward-facing XZ road faces; applies bounded inferred-curb trimming; indexes *the same rendered triangles* using `RenderedPavementIndex`; prefers surveyed pavement before prototype surface data; clears prototype index at every road graph rebuild.
- `tools/test_fallback_junction_geometry.mjs`: synthetic topology, elevation separation, material, triangulation and game-surface precedence tests.
- `tools/benchmark_fallback_junction_geometry.mjs`: reproducible CPU-only microbenchmark of the new solver. Does not measure GPU or FPS.

**Important geometric limit:** this prototype overlays the existing untrimmed centreline ribbons; it has not yet removed the covered portions of ribbon geometry. Curbs are retracted only where source segments allow. Therefore it is not yet a fully seam-free, collision-ready polygon/curb topology system. The first visual review must check overlapping asphalt, road markings and curb connectivity before enabling it by default.

## Validation and benchmark status

The solver implementation was exercised during authoring against seven directly evaluated synthetic topologies (T, four-way, bend, dead end, divided carriageways, stacked grades, angled T); all produced the expected polygon counts and valid triangle counts. This is **not** a claim that Node tests or browser regression suites were executed against a cloned working tree.

The GitHub connector writes were successful, but this environment could not clone GitHub (DNS resolution failed), so the following repository tests, full-city terrain clearance and desktop/mobile browser benchmarks **remain unexecuted here**. Do not infer FPS, memory or per-device gains.

Run from a checked-out branch with Node 22+:

```sh
node tools/test_fallback_junction_geometry.mjs
node tools/test_rendered_pavement.mjs
node tools/test_gameplay_systems.mjs
node tools/geospatial/test_road_network.mjs
node tools/geospatial/test_road_terrain_clearance.mjs
node tools/geospatial/test_official_road_surfaces.mjs
node tools/benchmark_fallback_junction_geometry.mjs
```

For visual QA, launch the explorer normally (existing unchanged behaviour), then compare `?junctionPrototype=1` **when the surveyed pavement fallback is in use**. On the normal packaged Peterborough map, the municipal layer is present and the fallback may not be invoked, so the flag alone will correctly show *no* change. To evaluate the alternate rendering, use an isolated fixture or developer-only environment with no municipal road-surface data. Do not remove the official assets from a production deployment.

Record desktop and mobile: p50/p95 frame times, draw calls, heap size, time-to-interactive, junction count, truck contact height continuity, visual mesh gaps, markings, curb continuity and regression against a no-flag baseline. Use matched paths/scenes, warm caches and identical hardware quality settings.

## Next engineering pass — prerequisites for default enablement

1. Add stable per-road approach mouth offsets to the *ribbon builder*, removing covered ribbon triangles before rendering. This must also trim centre-line and curb markings consistently.
2. Generate continuous corner curb/sidewalk geometry only on sides that are mapped or confidently inferred, and reconcile it with the official curb layer.
3. Improve steep-slope junction vertical interpolation by clipping intersection triangles to the rendered terrain mesh and verifying clearance.
4. Integrate polygon batches with the generated-asset registry/editor selections, and preserve stable OSM IDs.
5. Add an isolated browser screenshot fixture and compare against legacy at several real OSM examples and both power profiles.
6. Run existing full-city/regression tests and baseline-versus-prototype desktop/mobile benchmarks.
7. Keep behind query flag if any failures persist; the rollback is simply omitting `?junctionPrototype=1`, or deleting the prototype branch.

## External code consulted

- [osm2streets](https://github.com/a-b-street/osm2streets): shared road/lane/intersection geometry and edge trimming.
- [OpenStreetMap Racer](https://github.com/egore/openstreetmap-racer): vertex/arm junction solving, terrain-conforming road ribbons, surface containment.
- [Jev FSD](https://github.com/BrendanH18/jev_fsd): directed road graph, lane-aware browser rendering, cached map packs.
- [drive-game](https://github.com/esc5221/drive-game): continuous surface query interface and height-aware bridge/road contact.

Reference concepts were studied; this prototype is newly authored JS, not a wholesale copy of external code. Check third-party licences before any future source-code incorporation.
