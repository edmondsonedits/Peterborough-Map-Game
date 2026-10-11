# Final reconciled road source provenance

## Reproduced production-order defect

The low-power municipal browser lost both Hospital way 1414147320 arrows even though the previous combined geometry fixture passed. Actual app ordering builds OSM ribbon batches first, then municipal geometry, then Station reconciliation and Hospital reconciliation, and only then paint. Both reconciliations clip/subdivide and replace OSM buffers. Original source/editor ranges remained at pre-reconciliation offsets.

Reproducing that order restores the failure: 4,758 of 4,760 Hospital arrow probes are hidden. In the diagnostic low-power tile grouping, the service batch grows from 18,120 to 23,790 vertices and the parking-aisle surface batch from 21,972 to 31,626, leaving source ranges stale. The previous fixture built OSM ribbons after reconciliation and therefore could not detect it. Terrain/raster and foundation-only checks did not explain these two hidden arrows.

## Narrow repair

- Existing source triangle ranges pass through the same clipping/conformance operations in original order. Output geometry is byte-identical to reconciliation without tracked ranges.
- Range objects and their owning arrays are preserved in place for already-created editor bindings. Fully removed sources retain zero-length ranges.
- Updates are staged until replacement geometry is ready; exceptions during computation leave old geometry and ranges intact. Station and Hospital passes compose through explicit geometry revision numbers.
- Source/deck metadata remains attached to the verified final slices. A stale, unknown or invalid slice cannot manufacture road/bridge eligibility; unclassified actual surface triangles may only block paint conservatively.
- Foundations and curbs do not become paint support. Municipal/historical eligibility policy, source geometry, lane dimensions and vehicle physics are unchanged. The new helper is loaded with the narrow initial version `reconciled-road-ranges.js?v=1`.

## Verification

`node --test tools/test_reconciled_road_ranges.mjs tools/test_fallback_arrow_support.mjs` checks two-pass remapping, byte equality, a pre-existing editor binding's hide/restore, removed sources, exception atomicity, stale-range rejection and unknown-surface occlusion.

The corrected-order source check and independent reviewer both report:

- Low-power Hospital: both arrows, 4,830 probes, zero hidden/unsupported; maximum 8 mm lift residual 0.437 mm.
- Desktop Hospital: both arrows, 4,760 probes, zero hidden/unsupported; maximum residual 0.002 mm.

These checks include final raw foundations and terrain/raster clearance. The prior separate Medical foundation burial also disappears when foundations undergo the proper reconciliation order; no foundation-as-support exception is introduced.

Full actual `buildOfficialRoadSurfaces` orchestration, both mapped sites, historical profiles and renewed full-source cost evidence are recorded by the independent composition regression. Fresh browser positive pixels remain the final integration gate; this source proof does not claim browser completion.

## Superseded evidence

The earlier municipal combined-top reports and `benchmark_visible_paint_full_source.mjs` results under `visible-paint-top/` used the wrong assembly order. They remain diagnostic history only and must not be treated as proof of final composed production geometry or its cost. Pure shape/support unit tests and the municipal-absent default-lite path are not invalidated by this ordering defect.
