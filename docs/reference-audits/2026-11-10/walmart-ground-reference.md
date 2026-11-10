# Walmart ground reference audit

Read-only audit, 2026-11-10. No repository files were changed.

**Do not restore the old Walmart parking rows or the old `rings: [3, 4]` tree assignment unchanged.** The parking grid is approximately **55.7° clockwise from north**, not 68°. Both old row origins are in the driving aisles/outer edge rather than on painted row spines. The best-supported match for the tree in R012/R014 is the **northwestern rounded head of municipal parking hole 1**, immediately before the split exit approach.

## Evidence and georeferencing

- Owner references R001–R025 were reviewed in route order, with individual inspection of R009–R014 and enlarged R012. The index gives R010 = 00:24.024, R012 = 00:32.032, R013/R014 = 00:36.036. These are elapsed recording times, not acquisition dates.
- Municipal parking surface `10/1429` supplies the outer boundary and its 10 interior rings. Ring indices here use the GeoJSON array index, where 0 is the outer boundary.
- `handoff/review/walmart-ortho.jpg` is a 1400 × 1200 Ontario provincial aerial export. Its **acquisition date is unknown**; do not describe it as 2023 imagery.
- Pixel measurements were transformed through the actual returned EPSG:3857 extent in `walmart-ortho-export.json`, not the requested geographic bbox. Local ground scale is approximately **0.2412 m/pixel** at latitude 44.3241°.
- The old extracted `route-open-ground.js` was treated only as a list of candidates, not as evidence that its placements were correct.

## Route-order observations

| References | Directly visible | Map/use conclusion |
|---|---|---|
| R001–R008, 00:00–00:20 | Broad asphalt lot; faded yellow/cream bay divisions and hatched/buffer markings; tall light poles; planted perimeter | Supports restrained parking paint and asphalt treatment, not a complete counted stall inventory |
| R009/R010, 00:24 | Conifers and mixed trees on the perimeter in one view; Walmart frontage, lot paint and a cart corral in the other | Context for the western lot; do not treat every municipal cutout as a tree |
| R011–R014, 00:30–00:36 | Exit approach, a long narrow fenced grass median, and a nearby rounded planted island with one leafless deciduous tree and pale curbs | Two independent matching cues: adjacent exit geometry in the route sequence and the rounded head joined to a long narrow separator. Best match is the NW head of hole 1 |
| R015–R019, 00:45–00:50 | Wood fence, grass berm, guardrail, blue directory and conifers at the exit | Preserve the mapped access/median arrangement; individual tree coordinates and fence dimensions were not measured in this pass |
| R020–R025, 01:00–01:06 | White diagonal hatch area, stop/intersection approach and signal context | Do not extrapolate lot stall lines through the exit markings or into the road |

## Parking grid and approximate paint proposals

The long straight side of hole 1 has bearing 325.623°, implying a perpendicular parking-row axis of **55.623°**. A long mapped storefront edge implies **55.695°**. The aerial parked rows and visible paint align with this same grid. Use **55.7°** for this local rectangular grid.

The old 68° heading differs by 12.3°. Across the old 37.1 m span it creates about **7.9 m of perpendicular error**, before considering the misplaced origins. The old origin at aerial (416,815) is around 9 m NW of the proposed southern row spine; the old origin at (447,695) is around 10 m NW of the proposed northern row spine. Replacing only the bearing is insufficient.

These are **inferred partial paint proposals**, not a surveyed stall layout. Origins were manually picked on the aerial and should be treated as approximately ±1–1.5 m. They should be checked at driver height and against the aerial overlay before acceptance.

| Proposal | Latitude | Longitude | Pixel origin | Bearing | Facing in existing helper |
|---|---:|---:|---|---:|---:|
| Southern partial row | 44.323644404 | -78.334540418 | (488.54,810.28) | 55.7° | -1, strokes NW |
| Northern partial row | 44.323782225 | -78.334671834 | (445.15,746.67) | 55.7° | +1, strokes SE |

For compatibility with the old helper, the JSON records 15 separator lines, 2.65 m spacing, 5.3 m length and 0.12 m paint width. **Those dimensions and the extent of 15 lines are inferred**, not measurements established by the photos. Fifteen separator lines are not a claim that a row has exactly fifteen stalls. The rendered span is 37.1 m. All 60 tested line endpoints lie inside the municipal parking polygon and outside its holes; this is a geometry sanity check, not a substitute for clipping every paint polygon and checking other pavement layers.

The review overlay shows old axes in red and proposed separators in green. It is intended to expose the placement change, not to make the inferred stroke dimensions look authoritative.

## Tree island recommendation

Use **hole 1, NW rounded head only**. The cap outline is taken directly from the source ring; its north-aligned bounding dimensions are about 7.0 × 6.3 m. The narrow connecting stem is approximately 1.5 m wide and the full median is about 50 m long. Do not convert the entire hole into mulch and do not place a tree at the full-ring centroid.

- Proposed tree point: **44.323523678, -78.334433036**, aerial pixel **(524,866)**. This is an inferred location inside the mapped cap, approximately ±1.5 m.
- Observed appearance: one leafless deciduous tree, brown planted/mulched ground, pale concrete curb. The owner photos establish this appearance; the aerial is only a plan-position aid.
- Height, trunk diameter, exact crown shape, curb height and color values were not measured. Any values used by the renderer must remain labeled inference.
- The JSON contains the cap polygon formed from source ring 1 vertices 13–24. Its closing chord is a fill boundary at the neck, **not evidence for a new curb across the stem**. Preserve the complete municipal hole topology.

**Withhold trees for holes 3 and 4.** Their identity is not established by the supplied ground views. A municipal parking hole indicates excluded pavement, not whether it contains a tree, cart equipment or another feature. R010 visibly contains cart infrastructure, but this audit does not claim it is a particular numbered hole.

The tree-island identity is a high-confidence manual photo/map match from shape plus route adjacency, not a GPS survey. Exact camera coordinates and headings are deliberately not supplied: the lens orientation and camera calibration are not known well enough to make those precise.

## Files

- `walmart-ground-reference.json`: exact georeferenced proposal values, cap source geometry and uncertainty fields.
- `handoff/review/walmart-ground-audit-overlay.jpg`: numbered municipal holes, old row axes, proposed partial paint, and selected tree cap.
- `handoff/review/walmart-rotated-grid.jpg`: aerial aligned to the 55.7° grid; demonstrates why both old origins fall between row pairs.
- `handoff/review/walmart-contact.jpg`: R001–R025 route-order contact sheet.

No screenshot of the running game was produced by this read-only audit. The recommended implementation still needs its normal/lightweight and driver-height checks.
