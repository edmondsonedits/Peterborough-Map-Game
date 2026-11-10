# Ultramar canopy audit — 2026-11-10

Read-only design audit for the next candidate. No canopy, road, collision or common renderer code changed during this audit. The current review branch contains unrelated work in progress; the observations below concern `way/446339023` and its immediate ground only.

Subsequent implementation status: the isolated `recorded-canopies.js` definition/builder and its tests are now implemented, as described below. The original audit findings remain applicable. Root owns activation and ground integration; this module alone does not restore the missing pavement or establish visual approval.

## What the photographs establish

Owner frames R041, R043, R045, R047 and R049 were inspected directly in route order. The canopy is at the northeast corner of Chemong Road and Bellevue Street, on the east side of Chemong, with the separate three-door garage `way/446339024` behind it. The camera looks approximately northeast across Chemong in R041, then increasingly east toward Bellevue in R043–R049.

The fuel canopy is open below a flat roof. Pale square columns support it. The short southwest-facing fascia is dark navy with readable white **Ultramar** lettering. The long southeast-facing return is pale, with a blue lower edge and a small yellow brand symbol. The tall roadside pylon is separate, farther south; its exact base has not been mapped in this audit. Do not place a duplicate pylon or apply the name to the neighboring garage.

**Conflicting existing name:** `business-directory.json` has approved row `osm:node/462351260`, name **Husky**, assigned by point containment to this same canopy and its southwest wall. Its OSM retrieval date is October 25, 2026, which is not evidence that the physical sign was inspected on that date. The owner October 18 photos visibly say Ultramar. A new Ultramar front will not automatically suppress a differently named Husky directory sign. Preserve the original row's provenance and explicitly mark the conflicting placement for review/suppression in this photo-based scene; do not silently treat Husky as an Ultramar alias or draw both names. This audit does not establish the business's current legal/operator identity.

Photo-supported details: open sides, flat roof silhouette, pale supports, dark front fascia, pale long return and blue edge, front wordmark. Exact height, column count/positions, roof thickness, colors and lettering dimensions remain estimates. The unseen northwest/rear roof edges are not verified named frontages.

## Exact source footprint and current result

The OSM way has four corners and only `building=yes`; there is no source height or roof tag. The current app projection gives an area of **85.364 m²**, with approximately **11.84 m × 7.21 m** sides. Its geographic centroid is **44.318974525, -78.331144050**. Preserve these footprint vertices.

| Edge | Start latitude, longitude | End latitude, longitude | Length | Outward bearing | Meaning |
|---|---|---|---:|---:|---|
| 0 | 44.3189701, -78.3312310 | 44.3190320, -78.3311098 | 11.833 m | 324.67° | Northwest return, not clearly visible |
| 1 | 44.3190320, -78.3311098 | 44.3189790, -78.3310571 | 7.207 m | 54.38° | Northeast rear toward garage |
| 2 | 44.3189790, -78.3310571 | 44.3189170, -78.3311783 | 11.840 m | 144.63° | Southeast long fascia visible from Bellevue |
| 3 | 44.3189170, -78.3311783 | 44.3189701, -78.3312310 | 7.216 m | 234.43° | Southwest short front with Ultramar wordmark |

`mappedBuildingDimensions({building:'yes'}, 'way/446339023')` currently returns wall height **5.33487 m**, roof rise **1.93321 m**, shape **gabled**: a closed generic building roughly **7.26808 m** above its foundation. No active footage/reconstruction override was found for this way. This is visibly the wrong object, rather than a minor facade-color error.

`isOpenSidedRoofShell` already recognizes `building=roof|carport|canopy`, but this source tag does not qualify. Simply overriding that test would still leave the inferred gable and the generic perimeter support algorithm. `appendOpenRoofSupports` places 0.14 m posts at vertices and at up-to-7 m perimeter spacing; that is not the observed fuel-canopy support arrangement. The open-roof path also needs an explicit roof underside and fascia to avoid a paper-thin slab from the driver's seat.

## Collision and ground findings

The ordinary solo truck motion predicate in `updateFireTruck` checks world bounds, Station 1/2 sweeps, Station 3, parked fleet and scenery/road readiness. Generic building shells are not consulted there. The shared multiplayer world `blocks` method checks readiness and station geometry. A real prefetched sweep from the southwest entry to the northeast exit across this canopy returned **false** for blocked with a 10.4 m × 2.55 m vehicle. This is source/geometry verification, not an actual driven browser test.

Do not generalize that finding to every collision system: the aerial runtime has a separate `fleetObstacleBoxes` callback. Its current building-record/GeoJSON handling should be investigated separately if aerial reach is tested. No aerial or vehicle collision behavior should be changed merely to create the canopy.

More significantly, the existing parking data treats the canopy as an excluded building hole. Municipal parking **`10/99`, hole index 2** is an 85.45 m² four-corner exclusion almost coincident with the canopy. Its center is offset slightly north/west from the OSM footprint. Hole index 1 is the actual garage and must remain excluded.

Exact canopy pavement-hole ring, longitude/latitude:

```json
[
  [-78.33118216174825,44.318922749270556],
  [-78.33106097576224,44.31898473660138],
  [-78.3311137430816,44.31903782448556],
  [-78.33123492908591,44.318975837999865],
  [-78.33118216174825,44.318922749270556]
]
```

The actual shipped `-2:-3` packed road tile was decoded and sampled using `PackedRoadSurfaceIndex`, with neighboring `-2:-2` also loaded. The center and all four draft inset-column points have **no rendered pavement hit**. A separately loaded current multiplayer world, version `4d3bd6e096e82b32a2c4953f`, confirms the terrain fallback at the center:

| Probe | Local x, z | Surface height | Contact |
|---|---|---:|---|
| Canopy center | -911.61661, -1091.52723 | 12.61956 | Terrain; `onRoad:false` |
| Southwest entry, just outside roof | -917.40938, -1087.42177 | 13.10152 | Rendered parking; `onRoad:true` |
| Northeast exit, just outside roof | -905.82384, -1095.63269 | 12.69723 | Rendered parking; `onRoad:true` |
| Northwest side, just outside roof | -914.13541, -1095.04903 | 12.99615 | Rendered parking; `onRoad:true` |
| Southeast side, just outside roof | -909.09781, -1088.00543 | 12.83336 | Rendered parking; `onRoad:true` |

These samples are not all at one coordinate, so their difference alone is not a measured vertical seam. They do establish a missing pavement/contact region beneath the canopy. A decorative flat asphalt pad would hide a discrepancy without fixing wheel contact. Opening the canopy should therefore be paired with a bounded restoration of **only the erroneous `10/99` hole 2**, using the same rendered ground and surface-contact path and normal pinned road/world generation checks. If that work cannot be verified in this batch, keep it explicitly outstanding; do not claim a complete drivable forecourt.

## Smallest suitable implementation

1. Add one source-keyed reviewed canopy definition rather than alter OSM tags globally. Its explicit open-flat form should override the inferred closed/gabled shell only for `way/446339023`. Preserve original source geometry, editor identity and neighboring garage.
2. Use a bounded geometry helper for a shallow roof slab, roof underside, four fascia sides and explicit inset support points. Emit into existing spatial/material batches and keep the same essential silhouette in Lite. Do not invoke generic facade windows, doors, wall volumes, gable generation or random rooftop equipment for this record.
3. Use the existing verified-sign path on edge 3 only: transparent/applied white `Ultramar` lettering against the navy fascia. Leave unseen edges unnamed and leave the freestanding pylon for a separate exact placement review. The pale southeast return may have a thin blue edge; omit the small logo unless using a verified supplied asset.
4. Correct the specific pavement cutout through the existing ground generation/contact workflow, retaining garage hole 1 and the rest of the lot. Do not change road alignment, lane geometry, parking boundaries or global collision semantics.

An initial estimated silhouette can use **4.7 m clear underside**, **0.55 m fascia/slab thickness**, **0.4 m square supports** and the source footprint. These are visual starting estimates, not surveyed measurements, and deliberately replace the unsupported 7.268 m gabled interpretation. Final values require comparison to R041/R043 and a normal cab screenshot.

For an initial support layout, let `u` run from source vertex 0 toward vertex 1 along the long axis, and `v` from vertex 0 toward vertex 3 across the short axis. Four candidate supports at `(u,v)=(.2,.18),(.8,.18),(.2,.82),(.8,.82)` leave about 4.2 m between the inner support faces. They are inferred locations, not individually matched pump-island centers:

| Candidate | Latitude | Longitude | Nearest municipal public-road polygon edge |
|---|---:|---:|---:|
| A | 44.318972922 | -78.331197274 | 10.07 m |
| B | 44.319010062 | -78.331124554 | 17.17 m |
| C | 44.318938938 | -78.331163546 | 10.10 m |
| D | 44.318976078 | -78.331090826 | 17.20 m |

They are inside the canopy footprint and erroneous parking hole, not on a mapped public road. There is **no mapped service aisle beneath the canopy** that proves their safe relationship to fuel-pump travel paths. The photographed pumps/columns and a cab pass must therefore be checked before accepting them; do not describe the four candidates as verified positions. Prefer withholding an uncertain pump/island prop over blocking a usable aisle with invented clutter.

## Verification contract

- Source-footprint equality and unchanged editor/source identity; no triangles outside the roof footprint except explicitly bounded fascia thickness.
- Finite top/underside/fascia/support geometry; flat roof; no gable, full-height perimeter walls, windows or door panels. Four bounded supports at the chosen checked positions, with no solid panel closing the center aisle.
- All support bases use the same accepted ground as the restored pavement, not a guessed global elevation.
- Only front edge 3 receives the verified wordmark; directory dedup must count an actually rendered replacement. The conflicting Husky row must not produce a second canopy sign, with the reason retained in evidence. No garage/pylon name duplication.
- The correct parking hole alone is restored; its boundary and the garage exclusion remain exact. Boundary/grade checks, streamed tile readiness, and surface-contact parity pass in source and packed road modes.
- Normal and Lite geometry are both present, without new source-image downloads in Lite. Material and geometry counts remain bounded and source batches retain hide/restore behavior.
- Browser cab checks: approach southbound on Chemong, front look from approximately **44.31886410, -78.33135769** bearing **54.43°**, southeast return from Bellevue, and an ordinary-input under-canopy drive after pavement restoration. Inspect underside, columns, garage sightline, pavement seams, wheel contact and sign scale. Elevated/fly pictures do not replace cab review.
- Independent reviewer compares the resulting frames against R041/R043/R049. This audit supplies no visual-quality approval.

## Isolated geometry implementation

`RECORDED_CANOPIES['way/446339023']` exports the immutable source-keyed definition, original longitude/latitude outline, observed/photo fields, estimated numeric dimensions, required parking repair (`10/99`, hole 2), four inferred support fractions, five surface colors and one southwest `signProfile`.

```js
const result = buildRecordedCanopy({
  sourceId: 'way/446339023',
  ring: outer,                 // App Vector2 x/y or x/z; four corners, optionally closed.
  holes: [],
  project,                    // project(lat, lon), used to verify the exact source outline.
  groundHeightAt,             // Accepted repaired pavement; numeric height or {height}.
  maxTriangles: 256,
  lite: false,
});
```

The helper does not create scene objects or change a contact index. It returns `surfaces` with `roof`, `underside`, `pale`, `navy` and `blue` records, each containing `color` and a flat world-space `positions` triangle array for existing spatial/material buffers. The default canopy is **48 triangles** across five surface families. Pale supports share the pale fascia batch. Top and underside are independently wound, with no generic gable, windows, doors or rooftop equipment.

Successful results include `foundationTop`, `undersideY`, `roofTop`, original caller `footprint` in canonical source order, support footprints/base heights, `groundSamples`, `triangleCount` and the compatible verified `signProfile`. Create its frontage at `base:result.foundationTop`, `top:result.roofTop`. The sign uses transparent applied lettering, no solid board, no secondary named face and no pylon. Its intended outset is 0.025 m; the frontage renderer must honor the smaller applied-letter outset rather than the existing 0.3 m boarded-sign minimum.

The builder accepts rotated/reversed corner order but verifies each against the known projected source within 0.04 m, retaining the caller's points. Changed footprints, holes, nonfinite inputs, nonconvex/skewed outlines, invalid/overlapping/outside supports, missing ground, large/discontinuous grade or an exhausted triangle budget fail atomically with empty surfaces and no sign. Roof/column geometry is identical in normal and Lite modes. The ground callback is an integration contract: accepting `{height}` does **not** by itself prove that a rendered pavement/contact surface exists. Root must supply the separately verified restored ground and activate the canopy and ground changes together.

`node --test tests/recorded-canopies.test.mjs` passes **6/6** tests using the actual OSM footprint, both winding orders and the real frontage renderer. Tests include an unobstructed center-aisle ray, a roof-underside ray, exact footprint bounds, correct southwest navy edge, atomic rejection, per-support ground bases and one actual Ultramar text plane. Syntax and scoped whitespace checks pass. Browser screenshots, ground/world parity and independent visual approval remain outstanding.
