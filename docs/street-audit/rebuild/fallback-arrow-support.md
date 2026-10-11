# Default-lite mapped arrow support

## Correction

The municipal-only arrow support path emitted zero mapped arrows in default lite because municipal pavement was not loaded. The new paint-only helper indexes actual rendered fallback road top triangles, bounded to candidate arrow windows. It consumes source/editor batch ranges so bridge classification is retained even when ordinary and bridge ribbons share a material. It respects Float32 geometry, world/instance transforms, draw ranges and visibility, and excludes foundations, curbs, side faces, degenerate ranges and appended paint.

Junction top support uses the actual transformed cap geometry at its rendered height (including the existing 18 mm lift). Added source/bridge metadata does not change junction geometry. Municipal presence retains exclusive ownership, including municipal holes. Neither the municipal nor gameplay contact index is replaced. Historical profiles retain their municipal-only policy.

Overlapping faces initially exposed a nearest-reference selection defect: independent inspection found 18,775 probes hidden by nearby actual road tops, including Lansdowne Street West paint under Monaghan Road. Sampling now selects the highest actual face in the source deck's local height cluster, with explicit bridge/tunnel/layer provenance and conservative omission on conflicting classes. Consecutive height gaps greater than 1 m separate clusters. This is a bounded paint presentation heuristic, not surveyed deck separation or clearance certification. No artificial raising offset is used.

## Reproduction and evidence

- `node --test tools/test_fallback_arrow_support.mjs tools/test_mapped_arrow_paint.mjs tools/test_street_paint_runtime_edges.mjs`
- `node tools/test_fallback_arrow_runtime.mjs` (mobile), append `--desktop` for desktop.
- Set `FALLBACK_ARROW_REPORT` to save the main JSON report.

The runtime fixture uses all 5,953 source ways, packaged lidar and actual app ribbon, bridge elevation, junction and arrow builders. Its ablation reproduces zero municipal-only arrows. The corrected mobile run emits all 185 candidates, with no omitted arrows, 57,358 triangles and 401,506 finite vertex/midpoint/centroid probes. Maximum error from the final 8 mm lift is 1.995 mm; unsupported and downward triangles are zero. The retained support index has 886 triangles. One local measured arrow build took 1.076 seconds; this is not browser startup or frame-rate evidence.

The runtime test also includes the independent reviewer's raw rendered-face visibility check. It reconstructs actual mesh/instance top faces separately from the helper's range/class selection and looks for the highest top within 250 mm of each painted deck. All 401,506 mobile probes pass with zero missing support or hidden paint. The independent review log is saved alongside the mobile report. The 250 mm window is a bounded visibility check, not a universal deck threshold.

The fixture omits water recess and is not a browser renderer run. Seven finite probes per triangle cannot certify arbitrarily microscopic gaps. The adaptive paint helper keeps its existing maximum patch spacing and 2 mm plane-fit cutoff, omitting unresolved patches. Desktop final aggregate and actual browser/CI confirmation are integration responsibilities; this evidence does not claim those checks have completed.

Source data, road dimensions, source geometry hashes and gameplay index identity remain unchanged. Unit coverage includes municipal holes, mixed bridge batches, transformed instances, hidden/degenerate geometry, cap offsets, conflicting cap classes, overlapping ordinary faces and separated stacked decks.
