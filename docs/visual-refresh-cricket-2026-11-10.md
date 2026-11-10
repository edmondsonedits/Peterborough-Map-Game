# Cricket Place photo correspondence correction — v1.6.205 candidate

The earlier facade records associated the broad house beside the orange-wheeled toy with 22 Cricket Place, and its narrower eastern neighbor with 24. Two independent reviews of the full approach/return sequence, current OSM rings and municipal parcels instead place those photographed houses at **24 and 28**. This update corrects the photo associations and bounded facade details for the existing 22/24 records. The address-to-OSM mapping is retained.

## Identity evidence and preserved conflict

The north side, west to east, is:

| Address | Current OSM source | Municipal parcel / building | Visible distinction and source |
|---|---|---|---|
| 14 Cricket | `way/1015118647` | 4/4380 · 6/8829 | First broad pale-gable house after the driveway beside the blank Driscoll corner wall; three small attic panes. R275, R276, R278. |
| 16 Cricket | `way/1015118648` | 4/4381 · 6/6424 | Red-brick house with shallow hip roof between 14 and 22. R276, R278, R295. |
| **22 Cricket** | **`way/1015118649`** | **4/4384 · 6/10576** | Narrow pale front gable, paired small attic opening, two upper sash, broad green porch canopy and tree-screened lower frontage. R281 isolates this house; R278 and R295 establish its neighbors. |
| **24 Cricket** | **`way/1015118651`** | **4/4385 · 6/16714** | Broad dark cross-gable house, wide porch canopy with small central pediment, orange-wheeled toy on its lawn. R283/R285 foreground; R278 right. |
| 28 Cricket | `way/1015118652` | 4/4387 · 6/9362 | Narrower pale-porch house east/right of broad 24 in R283/R285. No appearance change in this update. |

R278 simultaneously shows 14/16 at image left, narrow 22 in the middle and broad 24 at image right. R281 does **not** put narrow 22 east of broad 24. R283/R285 place the toy with broad 24, and the smaller porch house farther right with 28. The green-gable house seen on the opposite side in R277/R279/R294 is south-side `way/1015118660` / 21 Cricket, which helps detect the view-orientation reversal. The exact vehicle maneuver is not recovered. No civic number is asserted to be readable in these photographs.

The [2026-10-25 verification](cricket-visual-verification-2026-10-25.md) and `city-explorer/data/outer-recording-review.json` record the user's earlier identification of the toy house as **22**. That is conflicting evidence, not a statement to erase. Those historical files remain unchanged; both current profiles retain the conflict in `identityReview.historicalUserIdentification`. The correction concerns the association between the pictured house and the mapped footprint, not a renumbering of the map.

Two independent reviews corroborate the new association:

1. `east-city-cricket-reference`: inspected R275–R300, route continuity, municipal parcels/buildings and an Ontario aerial overlay with current OSM rings.
2. `cricket-independent-photo-parcel-review`: inspected the contact sheets, then individual R275/R276/R278/R281/R283/R285/R294/R295 reference images; independently re-queried official parcels/buildings and recomputed centroid/ring associations. A follow-up photo check independently confirmed 22's eastern doorway and 24's broad canopy.

Fresh [municipal parcel query](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/4/query?where=OBJECTID+IN+%284380%2C4381%2C4384%2C4385%2C4387%29&outFields=OBJECTID%2CADDRESS&returnGeometry=true&outSR=4326&f=geojson) and [municipal building query](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/6/query?where=OBJECTID+IN+%288829%2C6424%2C10576%2C16714%2C9362%29&outFields=OBJECTID%2CLOCATION%2CSTATUS&returnGeometry=true&outSR=4326&f=geojson) were retrieved on 2026-11-10. Their exact response SHA-256 values are `fa3befc17e79e8eca054a93f5c0d7d3ec6bf65f9d10ecedf39569f9767b10fb2` and `b11f04bda071e2883c1f7073f97cf901a63e922cc051368eacf57d901cbb1225`.

Each current footprint centroid falls inside the listed parcel and municipal building. OSM and municipal edges are not survey-coincident: the distinct OSM vertices inside the parcel are 4/4, 2/4, 7/8, 6/8 and 7/8 respectively. The overlay corroborates roof shape/order; its imagery acquisition year was not established, so it does not prove current finishes.

## Bounded implementation

| Record | Supported change | Retained limits |
|---|---|---|
| 22 / `way/1015118649` | R281 is the primary source; R278/R295 provide neighbor context. Brick/pale-trim estimates, green canopy covering 95% of the registered frontage, and eastern lower entry. The guessed western lower glass is removed because the tree hides it. | The existing edge is the outer porch projection. The upper wall setback and pale gable cannot be recovered by treating that edge as the full main wall. Existing mapped wall height **6.09791 m**, hip roof and footprint remain authoritative. |
| 24 / `way/1015118651` | R283 is the primary source; R285/R278 provide context. Brick/pale-trim estimates and dark canopy covering 90% of the frontage, replacing the narrow-neighbor 48% treatment. | Existing mapped wall height **5.70568 m**, roof and footprint retained. The small porch pediment, side projection, precise roof arrangement, obscured lower openings, lawn and toy are not reconstructed. |

Canopy depths of 1.8 m / 1.6 m, canopy height 2.5 m, the eastern entry fraction 0.78 and its 0.9 × 2.3 m size are visual estimates. Two upper openings on each frontage are observed; their dimensions, equal spacing and color values remain approximations. Both records set `reviewedWallMaterial: true`, retaining the reviewed material choice without generic random tint and keeping their essential facade in lite mode. These profiles use supported fields only. There are no height, roof, massing, address, collision, garden, sign or address-plate additions. The existing `appearanceOnly` / `preserveMappedMassing` flags, opt-out behavior and caller-profile precedence are unchanged.

Source hashes in the registry identify original reference exports from `photo-index.csv`, not the resized R-number handoff images. Primary R281 SHA-256 is `4a90a9e9a2cb7d3e9976eb589c3f37feb9d38790cfa9bd3081e7261fb8f286aa`; primary R283 is `fcdb895bd275ca35ae7dd533e6cb42166cd01a83deb967b20cfb0eb91511a724`.

## Exact edges and cab review plan

Both edges retain adjacent vertices of their current OSM rings. Endpoints run approximately west to east; increasing facade fraction is image-right/east when looking north toward these south-facing frontages.

| Source | Start (lat, lon) | End (lat, lon) |
|---|---|---|
| 22 / `way/1015118649` | `44.3072879, -78.3113502` | `44.3073049, -78.3112781` |
| 24 / `way/1015118651` | `44.3073191, -78.3112248` | `44.3073465, -78.3111084` |

The following coordinates are nearest-point projections onto current Cricket Place centerline `way/33960427`, looking toward each frontage center. They are reproducible review positions, not recovered recording poses. Use the actual truck/cab seat camera in balanced and lite modes. A requested 2.5 m fly-camera altitude is clamped to 5 m by the runtime and does not establish driver-height appearance.

| Target | Camera latitude | Camera longitude | Compass bearing | Approx. edge distance |
|---|---:|---:|---:|---:|
| 22 | 44.30715767 | -78.31125256 | 342.362° | 16.21 m |
| 24 | 44.30719152 | -78.31110388 | 342.362° | 16.50 m |
| 28, context only | 44.30722235 | -78.31096848 | 342.362° | 16.96 m |

Review the 14 → 16 → 22 → 24 → 28 order in an oblique route view as well as the individual fronts. Check 22's east entry, 24's broad canopy and preservation of the intervening open gaps. Runtime visibility, collision clearance, cab framing and appearance remain unverified for this candidate until those captures are inspected.

## Validation

The three new regression checks failed on the prior profiles: primary source identity, 24's narrow canopy and 22's guessed west lower glazing. They pass with the correction. A follow-up material-policy assertion also failed before `reviewedWallMaterial` was set on both records and passes afterward. Real Three.js facade geometry is generated in full and lite modes using the actual mapped wall heights; the checks cover observed lower-entry placement, broad canopy extent, finite geometry, source bounds, immutable provenance, opt-out behavior and caller-profile precedence.

`node --test tests/cricket-recording-appearances.test.mjs tests/cricket-runtime-integration.test.mjs tests/sherbrooke-frontage-lite.test.mjs` — **23 passed, 0 failed**.

`node --test tests/*.test.mjs tests/*.test.cjs` — **1,667 passed, 0 failed**, 18.18 seconds, after the material flag change, on checkpoint `f7d9610` plus the current shared candidate files. `git diff --check` on the owned code/test files also passes. No rendered visual approval or publication is claimed here.
