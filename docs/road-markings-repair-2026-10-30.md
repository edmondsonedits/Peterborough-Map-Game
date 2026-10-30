# Map-wide marking repair

Base: 5ca6df0 / v1.6.154. User authorized implementation, phone driving-view QA and live publication. Isolated checkout: H:/ChatGPT/Peterborough-Road-Markings-20261030.

Acceptance: joined offset/stroke paths through bends; phase and physical dash/gap lengths independent of arbitrary input segmentation; explicit source-node/grade/semantic continuity across way splits; preserve junction cuts, one-way/cycle-lane rules and editor source IDs. Clip paint to exact final road contact faces so it cannot sink between samples or bridge pavement holes. Balanced should smooth raster edges without adding shadows or increasing road residency.

Verification: red/green geometry, clipping, phase, loop/cusp and height regressions; current whole-map marking inventory/quality diagnostics; actual phone portrait driving camera and HUD at multiple device pixel ratios, Water Street close/bend/turn plus major two-way, cycle-lane, bridge and junction routes, Low/Balanced/High; inspect captures manually. Browser emulation is not physical-phone FPS/thermal qualification. Rebuild and verify all prebuilt tiles after final source edits; publish fresh release and verify public hashes + clean live driving view.

Root owns integration/projection/build/release. One focused worker owns pure paths and tests. Sol reviews architecture and final visual/code gates. Keep unrelated work and geographic source truth. No guessed stop-bar placements or traffic-rule overrides.
