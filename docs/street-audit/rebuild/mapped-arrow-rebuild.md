# Mapped arrow rebuild

New implementation against f8818548ad903b14b22ee5a48a88f3abcd92f582. Source geographic data, lane counts, and vehicle physics are unchanged.

Mapped movement strings retain all supported semicolon-separated movements, empty lane slots, and reverse one-way direction. Arrow lane centers use actual directional lane allocation. App local +X and `(dz, -dx)` are driver left, so arrow left heads use positive local X. Every local triangle faces upward with the existing front-side white paint material.

Arrows are generated only after municipal and Station/Hospital reconciliation. Actual final rendered pavement is sampled for all corners, edge midpoints and centroid of each triangle patch. Patches have maximum 0.2 m edges, adapt toward 0.025 m for discontinuities, require all finite supports and <=2 mm plane residual, and retain the existing 8 mm paint lift. Unsupported patches are omitted. Seven absent probes stop immediately: the 2×2 m unsupported triangle requires 7 queries. Mapped service-road turn arrows may use rendered parking pavement; ordinary roads cannot. Bridge-tagged arrows require an actual bridge deck. No municipal gaps use inferred street or terrain fallback.

World triangles are batched by compound movement, indexed in generatedRoadMeshes, and appended to existing state.roadPaintRanges arrays so editor bindings created earlier can hide/recolor/restore the new geometry.

Verification: node --test tools/test_mapped_arrow_paint.mjs (13 passing); node tools/test_city_detail_rules.mjs (pass); node --check city-explorer/app.js (pass). Tests use actual app setRoadQuaternion with Three.js matrices for north/east/diagonal headings and reversed one-way; asymmetric source fixtures 364843830 and 1414147320, blank fixture 1414147337; upward winding; unsupported-query bound; discontinuity omission; parking and bridge policy; real editor range binding. Full final-source terrain and browser site verification remain separate required checks.

Additional guards reject contradictory explicit lane totals and directional slot counts. One-way directional evidence overrides generic evidence and never emits the forbidden direction. Draping quantizes output XZ coordinates before support lookup, so Float32 upload does not move supported vertices outside their ownership mask.

## Actual source terrain verification

`node tools/test_mapped_arrow_final_surface.mjs` runs the real app arrow builder and quaternion against the municipal/OSM/official-lidar source fixture, at both desktop and low-power terrain resolutions. It checks all three corners, three edge midpoints, and centroid of every emitted Float32 triangle. All probes have actual rendered pavement support and paint lift within 2.2 mm of 8 mm. Hospital ways 250811909 and 1414147337 each retain one arrow; 1414147320 and south-site 364843830 each retain two, including their combined heads. Maximum observed lift residual across these source fixtures is 0.715 mm; minimum lift is 7.855 mm. The results JSON records counts and measured build times (hardware-dependent, not a browser frame-rate claim). Browser screenshots remain integrator-owned.

## Bounded subdivision optimization

A failing geometry/performance regression exposed uniform quartering of narrow stems (704 triangles for one flat left arrow). Longest-edge bisection reduces this to 292 triangles / 1,245 memoized height queries while preserving projected coverage. Every emitted patch still independently satisfies the existing maximum edge, minimum unresolved cutoff, seven finite supports and plane-residual limits. Actual-source tests additionally check upward, nondegenerate winding after Float32 upload. No tolerance or support spacing was relaxed. Full-source before/after measurements are recorded separately.
