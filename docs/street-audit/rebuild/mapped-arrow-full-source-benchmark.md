# Approximate full-source mapped-arrow workload

Run `node tools/benchmark_mapped_arrow_full_source.mjs` and again with `--low-power`.
The script runs the actual app mapped-arrow builder with every packaged OSM road and
all 6,502 eligible municipal pavement polygons, with normal Station reconciliation
followed by the bounded Hospital reconstruction. Source eligibility applies active
status and vehicular bridge-use filters. An assertion checks that no eligible source
polygon is excluded by the fixture window.

This is NOT final-browser equivalence: global bridge elevation profiles and water
recess are omitted. Node CPU/memory measures cannot establish browser startup time,
frame rate or GPU allocation. The underlying road support remains finite seven-probe
sampling on <=0.2 m patches, adapting toward 0.025 m with <=2 mm plane residual;
this does not prove absence of arbitrarily microscopic gaps.

Both profiles: 5,953 source ways; 140 eligible mapped ways; 134 emitted ways;
173 arrows batched into five compound-kind meshes.

- Desktop: 410,106 vertices / 136,702 triangles; 14,763,816 bytes in actual mesh
  attribute arrays; mapped-arrow build 2,404 ms wall / 2,591 ms process CPU.
- Low-power: 409,887 vertices / 136,629 triangles; 14,755,932 attribute bytes;
  mapped-arrow build 2,527 ms wall / 3,703 ms process CPU.

These are material startup and mesh costs, not a claim of no regression. Peak
process RSS was 3.41 GB desktop / 1.68 GB low-power, dominated by this test harness's
complete source mesh snapshots and duplicate contact indices; it is NOT incremental
arrow memory or browser memory. Heap deltas were not retained because garbage
collection of fixture intermediates makes them misleading. Source fixture setup took
20.7 s / 15.4 s separately from the reported arrow build.

Actual full-city browser timing/counters remain an integration/CI verification item.

## Longest-edge bisection verification

After the red narrow-stem coverage/performance test, only mapped-arrow subdivision
was changed to bisect the longest edge. The same spacing, support probes, plane
residual and unresolved minimum size remain mandatory. No app wiring changed.

Final repeated runs, including full-output Float32 winding verification:

- Desktop: 162,792 vertices / 54,264 triangles; 5,860,512 attribute bytes;
  1,308 ms wall / 1,488 ms process CPU.
- Low-power: 162,903 vertices / 54,301 triangles; 5,864,508 attribute bytes;
  1,232 ms wall / 1,438 ms process CPU.
- Both retain 173 arrows on 134 ways in five meshes; every emitted Float32
  triangle is nondegenerate and faces upward. Mesh payload falls about 60%.
- Initial optimized runs were 1,191 / 1,128 ms wall, showing the expected
  environment variability. The final run JSON is authoritative for reported times.

Actual four-way source-site tests still pass all seven final-pavement probes per
triangle, with maximum 0.715 mm lift residual. These local workload reductions do
not replace actual full-city browser startup and frame-time measurements.
