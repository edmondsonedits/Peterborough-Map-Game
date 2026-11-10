# Walmart ground reference pass — 2026-11-10

The previous continuation candidates placed two sample parking rows at 68° with origins in the aisles and assigned trees to municipal holes 3/4 without a reliable photo match. This bounded implementation uses the corrected southwestern row origins and 55.7° grid, preserves the complete municipal `10/1429` parking outline and all ten holes, and adds one leafless tree on the northwestern head of hole 1.

This file records source evidence, implementation limits and the integration contract. It does not claim that the running game has passed its required cab/oblique visual review.

## Evidence and inference

The owner photo index establishes R010 at 00:24.024, R012 at 00:32.032 and R013/R014 at 00:36.036. These are elapsed recording times. R001–R025 were reviewed in route order. R012/R014 show the leafless tree, brown planted ground and pale curb; the adjacent split exit median in R013 helps match the island. R010 also shows cart infrastructure, so a parking hole alone is not proof of a tree.

The Ontario provincial aerial was exported through `LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer`. Its returned 1400 × 1200 EPSG:3857 extent was used for pixel georeferencing. **Its acquisition date is unknown.** It must not be labeled 2023 imagery. The exact municipal parking polygon is embedded in `route-open-ground.js`, including every ring. It is the spatial ownership guard, not a replacement pavement mesh.

Two independent mapped edges support the grid: the long side of H1 implies a perpendicular bearing of 55.623°, and a long storefront edge implies 55.695°. The aerial row pattern agrees. The renderer uses 55.7° clockwise from north.

| Detail | Value | Evidence status |
|---|---|---|
| Southern partial-row origin | 44.32364440364343, -78.33454041769727 | Manually georeferenced, approximately ±1–1.5 m |
| Northern partial-row origin | 44.32378222528404, -78.33467183379143 | Manually georeferenced, approximately ±1–1.5 m |
| Row direction | 55.7° | Supported by two source edges and aerial alignment |
| Separator spacing / length / width | 2.65 m / 5.3 m / 0.12 m | Estimated render dimensions |
| Partial extent | 15 separators per row, 37.1 m between first and last | Inferred extent; not a complete stall count |
| Tree anchor | 44.323523678239724, -78.33443303595162 | Inferred within the mapped cap, approximately ±1.5 m |
| Tree height / crown diameter / crown height / trunk diameter | 7.5 m / 5.2 m / 4.4 m / 0.32 m | Conservative estimates, not measured from photography |
| Tree appearance | Leafless deciduous branches, brown planted ground | Direct photo observation; exact shape and colors estimated |

The selected cap uses H1 vertices 13–24. Closing those vertices makes a fill polygon across its neck; that closing segment is **not a photographed curb**. The full median is about 50 m long with a narrow connector. The implementation neither mulches the whole ring nor places a tree at its full-ring centroid. Holes 3 and 4 receive no added trees. No later-route lots or signs are included.

## Integration API

```js
import {
  createWalmartGroundPlan,
  buildRouteParkingPaint,
  createWalmartTreeIsland,
} from './route-open-ground.js';

// App project(lat, lon) returns local metres as {x, y}; {x, z} also works.
const plan = createWalmartGroundPlan(project);
const paint = buildRouteParkingPaint({
  plan,
  samplePavement: (...args) => state.renderedPavementIndex.sample(...args),
});
const island = createWalmartTreeIsland({
  THREE,
  plan,
  groundHeight: terrainHeightAtWorld,
  lowPower: lowPowerProfile,
});
```

`plan` contains projected `rings`, `rows`, `containsParking(x,z)`, and `treeIsland` with the cap ring, open source boundary, anchor and estimated dimensions. The complete source polygon and the two reference records are also exported for inspection.

`paint.positions` is a finite `Float32Array` suitable for one existing paint material/mesh batch. `paint.rows` supplies each row's `id`, `status`, `positions`, `emittedLines`, `retryable` and reason-count `diagnostics`. Each row is atomic:

- `ready`: every requested separator is completely supported.
- `pending`: at least one rendered-pavement sample is missing, nonfinite or unavailable; no geometry is committed for that row and `retryable` is true.
- `blocked`: geometry, ownership, road exclusion or grade failed; no geometry is committed for that row.

The builder has no persistent checked/seen cache. Re-run it after relevant pavement tiles arrive, unload or change and replace the previous paint geometry. A `pending` result must not become a permanent "checked" flag. A `blocked` result should also be reconsidered on a later pavement revision. Do not append repeated results or keep paint floating after its supporting tile is removed. `paint.ready` means both rows are ready; `paint.retryable` means at least one row is pending.

The sampler must return the real rendered-triangle height and `heightSource: 'rendered-pavement-triangle'`. Explicit source IDs belonging to another lot are rejected. The actual shipped Walmart tile `-3:-4` has parking groups with empty `sourceRanges`; its official parking can therefore use the exact municipal outline as the ownership guard. This exception requires an official packed-tile ID and never overrides an explicit different source ID.

Before draping, each entire separator rectangle is checked against the exterior and every hole, including edge intersections and an enclosed hole. The module rejects public-road overlap using the same sampler with `{includeParking:false}`, even if the parking face sits above that road face. Dense stroke probes reject abrupt height changes; draped area coverage then prevents incomplete fragments from being accepted as full separators. No terrain fallback is used for paint.

`island` returns `{group,status,retryable,diagnostics}`. A ready group has two meshes: the mapped cap soil surface and a batch of 26 cylinder instances representing the trunk and bare branches. There are no foliage meshes, signs, collision objects or new curb across the cap neck. Low-power mode retains the same small geometry and disables tree shadow casting. Nonfinite ground leaves the result pending; disconnected grades block the cap. Dispose replaced geometry/materials through the app's normal lifecycle.

## Verification

Focused automated coverage includes:

- all ten source holes and the exterior, including a stroke whose corners are valid while its interior crosses an island;
- the independently georeferenced row bands;
- actual rendered parking slopes and finite, upward-facing output;
- explicit wrong-lot ownership and public-road overlap;
- delayed streamed support that succeeds on retry;
- discontinuous pavement/ground and unavailable samples;
- the actual shipped Walmart packed tile with absent per-lot ranges;
- the single H1 tree's placement, finite transforms, batch count and lightweight behavior.

`node --test tests/route-open-ground.test.mjs tests/road-paint-geometry.test.mjs tests/road-tile-pack.test.mjs` passed 31 tests. `node --check city-explorer/route-open-ground.js` and the scoped whitespace check passed.

At module handoff, `node --test tests/*.test.mjs tests/*.test.cjs` passed **1623/1623** tests. A direct comparison also confirmed that the embedded coordinates exactly preserve the audited source polygon's exterior and ten holes.

**Still required after app integration:** actual cab-height and oblique screenshots at the two row bands and H1 cap, comparison against R010/R012/R014, normal and lightweight mode inspection, and a streamed unload/reload check. Automated geometric checks do not establish visual scale, color or the final appearance of the tree.
