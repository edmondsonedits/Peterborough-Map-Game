# Driscoll low wing and high north block

Prepared for the v1.6.208 candidate on 2026-11-10. The helper and source tests are ready; runtime integration and fresh cab/oblique review remain separate gates. No app, source-data, physics or version file is changed by this helper.

## Matched evidence

The exact source is `way/755554027`, the tan building east of Driscoll Terrace. Original R265 shows its long low west wing with sparse southern openings and northern ribbon glazing. R269 shows the higher projecting north block, broad high window and navy entry; R267 is the intervening route reference. These are distinct faces already present in the reviewed frontage profile. The v1.6.205 independent review found that the inferred uniform tall wall defeats this observed stepped silhouette.

The source analyst's plan is `east-city-analysis/driscoll-split-plan.geojson`, with an orthophoto crop at `east-city-analysis/driscoll-north-block-split-audit.png`. The helper implementer opened the original R265/R269 images and the annotated source/aerial split, then independently verified the current OSM ring, zone convexity, area and generated triangles. The aerial acquisition date is not established here. Neither the images nor the source tags provide a surveyed wall height.

The current source has these eight distinct vertices and only the tag `{building:'yes'}`:

| Index | Latitude | Longitude |
|---:|---:|---:|
| 0 | 44.3066001 | -78.3113302 |
| 1 | 44.3062276 | -78.3111625 |
| 2 | 44.3061924 | -78.3113152 |
| 3 | 44.3064962 | -78.3114520 |
| 4 | 44.3064837 | -78.3115063 |
| 5 | 44.3065729 | -78.3115464 |
| 6 | 44.3065892 | -78.3114759 |
| 7 | 44.3065686 | -78.3114666 |

The high north polygon is `[3,4,5,6,7]`. The low main-wing polygon is `[0,1,2,3,7]`. Their shared internal boundary is **3 → 7**. All eight original exterior edges remain unchanged and appear once. The two convex pentagons lie on opposite sides of the shared line and have no overlap beyond it.

At the production projection, the outer area is approximately **603.1688009 m²**, partitioned into **547.4151072 m² low** and **55.7536937 m² high**. The original west ribbon/sparse face `2→3` belongs wholly to the low zone. The north-block west face `4→5` belongs wholly to the high zone. There is no north/south/east/west axis-aligned box approximation.

## Estimated display heights

| Zone | Wall/eave above source datum | Cap above eave | Roof top above source datum |
|---|---:|---:|---:|
| Low main wing | 3.20 m | 0.12 m | 3.32 m |
| High north block | 5.16891 m | 0.12 m | 5.28891 m |

The low eave and both shallow flat caps are visual estimates. The high wall retains the existing **inferred** mapped wall height; it is not reclassified as measured. Existing source dimensions are `{height:5.16891,minHeight:0,roofHeight:1.80253,roofShape:'gabled'}`. The source height and physics inputs remain unchanged even though the accepted display envelope has lower roofs.

Cap thickness is explicit and separate from wall height. Exterior tan walls stop at their zone eave. Blue-gray roof triangles include the flat cap tops and 0.12 m perimeter fascias. The high block's internal tan step wall starts at the **low cap top**, 3.32 m above the source datum, and stops at the high eave. Its top cap fascia continues to 5.28891 m. No internal full-height wall is emitted below the low roof.

Material intent comes from the existing reviewed profile: wall `#b8aa88`, roof/cap `#8c9796`. No new entrance, window, chimney, rooftop equipment or site geometry is introduced.

## Pure helper and integration contract

`city-explorer/reviewed-split-massing.js` exports:

```js
DRISCOLL_SPLIT_MASSING
buildReviewedSplitMassing({
  sourceId, ring, groundHeights, dimensions, tags, project, holes: []
})
```

The versioned correction ID is `driscoll-755554027-stepped-flat-v1`. Inputs use the original world-space outer ring and one original terrain sample per vertex. X/Z points and Three.js Vector2 X/Y points are supported. A cyclic rotation, reversed winding or one matching closing vertex preserves identity. Matching projected vertices allows 0.0001 m numerical tolerance; source coordinate changes at practical map precision fail closed.

Guards require the exact source ID, all eight expected vertices in the original cyclic order, no holes, unchanged source tags and mapped dimensions, a valid two-polygon partition, and finite bounded terrain. Any tag change, including newly measured height/storey/roof/minimum-height data, disables the correction pending review. Unknown geometry does not receive a guessed split. The function neither mutates inputs nor returns partial geometry on failure.

On success the result contains:

- `wallTriangles` and `roofTriangles`, flat X/Y/Z arrays for the existing material batches;
- `foundationTop`, unchanged maximum of the supplied original ground samples;
- `zones.low` / `zones.high`, with source indices, area, explicit eave/cap estimates, absolute `wallTop` and `roofTop`;
- `maxWallTop` and `maxRoofTop`, for visual capture and bounds;
- `split`, footprint area, ground range, maximum edge grade, source ID and correction ID.

There are 18 wall triangles and 24 roof/fascia triangles. Roof triangle normals face upward; exterior and step faces use consistent outward winding. Source vertices are used directly, with no geographic offsets or expanded bounding rectangle.

Root owns runtime integration. Only a valid result replaces the ordinary visual walls and roof. A rejected result retains the complete source fallback. Suppress ordinary generated openings, inferred gables/chimneys and rooftop equipment on the accepted branch so none float above the low wing. Retain the existing audited frontage profiles. Capture `maxWallTop` for their shared ceiling; each face keeps its existing 3.2 m / 5.1 m detail limit. Capturing only the low primary height would clip the high north window. Do not feed these display values into collision, source-height or terrain logic.

## Verification

`tests/reviewed-split-massing.test.mjs` passes **8/8**. It exercises the actual source ring and production terrain samples, immutable inputs, independent polygon and emitted-triangle area comparisons, roof containment and winding, all eight exterior edges and their own heights, internal step bounds, cyclic/reversed/closed inputs, changed source geometry/tags/dimensions, holes and invalid terrain.

The combined massing/East City facade/envelope run passed **23/23**. An independent source reviewer also verified the partition and all 18 wall triangle normals, confirmed the step faces the low wing, and rendered both existing frontage detail sets against the maximum captured wall top. Low-face details end at 3.05 m; north-block details end at 4.48 m, below their respective eaves. No source/material/topology blocker was found. This does not replace runtime pixel review.

```sh
node --test tests/reviewed-split-massing.test.mjs tests/route-east-city-appearance.test.mjs tests/route-east-city-envelope.test.mjs
```

The terrain fixture comes from `east-city-envelope-terrain.json`. Its DTM/Float32-grid reconstruction matched the stored v205 low-wing cab ground value exactly. The source maximum is about -6.188738 m in the local coordinate system, with a 0.209 m ground range and maximum edge grade about 0.662%. Exterior wall bottoms retain the individual sampled vertex heights; no pad, datum shift or ground flattening is added.

Fresh screenshots must include both `east-r265-755554027-f0` and `-f1` cab and oblique views in Balanced and Lite. Verify the low eave immediately above its existing ribbon, preserved high window and navy door, the shared step closure, no visible crack or duplicate source gable, and unchanged adjacent ground. Passing geometry tests alone does not approve the photo fit.
