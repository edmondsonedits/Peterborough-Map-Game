# East City bounded facade batch — 2026-11-10

The initial **v1.6.205** batch added `ROUTE_EAST_CITY_APPEARANCES`: twelve verified current source buildings and fourteen exact adjacent facade edges. A **v1.6.208 candidate** follow-up, below, corrects three reviewed display envelopes after inspecting the exact v205 cab images. Root has connected the registry to the production route composer. Source geometry/dimensions and physics remain intact; app integration, release version and publishing remain with the integrating agent. Tests passing does not establish browser/cab visual approval.

The supplied R261–R300 images were audited in sequence against current `city-explorer/data/peterborough-osm.json`, City of Peterborough [building footprints](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/6), [civic parcels](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/4), and [sidewalk geometry](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/9). Ontario's [imagery service](https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer) corroborated footprint order; its acquisition date was not established. The initial register and old patch were candidate matches, not authoritative proof.

The detailed scratch audit is `east-city-cricket-reference.md/.json/.geojson` beside the repository. Its JSON includes image hashes, complete rings, municipal associations and QA poses. Every implementation record independently retains its source ID, photo IDs, source-image paths, lens/time/direction, municipal IDs, exact front edge, observations, estimate limits and review camera(s).

## Direction and identity

| Frames | Travel | Lens 0 | Lens 1 |
|---|---|---|---|
| R261–R264 | East/ENE on Hunter Street East | South | North |
| R265–R271 | North/NNW on Driscoll Terrace | East | West |
| R272–R281 | East/ENE on Cricket | South | North |
| R282–R292 | Orientation reverses, then pause | North | South |
| R293–R300 | West/WSW return toward Driscoll | North | South |

The exact turn/reversal pose is not recovered. A fixed lens-to-compass assignment through the reversal would put the green-gabled south-side house on the wrong side of Cricket. Source-photo direction fields describe the viewed side; QA coordinates are separately estimated poses, not photo GPS.

## Implemented cues and explicit limits

All hexadecimal colors, metre dimensions, roughness, opening widths/heights, porch details, frontage fractions and QA poses are estimates. Exact source vertices identify the current modeled edge; their decimal precision does not establish surveyed building dimensions. No facade photograph is downloaded at runtime.

| Current source | Evidence / location | Bounded visual cues | Limits retained |
|---|---|---|---|
| `way/1015118634` | R262, R271; 14 Hunter East / Kawartha building | Six tall narrow dark slots between pale piers; one separate broad glazed field at east end | No guessed entry or unreadable wordmark. Long east return not given the six-slot rhythm. Low flat silhouette/higher rear mass needs separate source-geometry review. |
| `way/755554027` | R265/R267/R269; 52 Hunter East, Driscoll frontage | Lower west wing: sparse south openings, northern ribbon, blue-gray eave. Separate north-block west edge: high broad window, opaque navy door toward north, canopy | Navy door/high window are not copied onto the long wing. Existing uniform wall/roof does not reproduce the observed stepped flat heights. |
| `way/755554019` | R263/R264; Circle K, 33 Hunter East | Red-brown lower walls, blue-gray fascia interrupted by pale west-half entry portal, bounded shop glass, readable CIRCLE K sign | The raised portal is fitted inside the current low wall, not reconstructed above it. Separate Shell canopy, pylons and forecourt are untouched. Approved sign identity uses `Circle K` for existing deduplication. |
| `way/1015118609` | R270/R272/R298; Cricket southeast corner / 5 Cricket | Four upper north-face sashes, dark broad porch canopy. Separate west return gets only its south-end upper/lower pair | Main ground openings are hidden and omitted; no front porch copied onto return. Lower rear wing and existing roof mass are preserved. |
| `way/1015118646` | R273/R297/R299; Cricket northeast corner / 436 Driscoll | Large blank red Cricket wall, shallow dark eave cue, single aligned pair near east end | No Cricket-facing porch or entrance. Unseen Driscoll front remains unverified. |
| `way/1015118647` | R275/R276/R278/R295; north-side 14 Cricket | Red main wall, two pale upper sash, broad pale-post porch | White triangular gable and three attic panes require a roof face and are omitted. Hidden ground openings and default central door are suppressed. |
| `way/1015118648` | R276/R278/R295; north-side 16 Cricket | Red wall, two pale upper sash groups, broad porch | v208 candidate adds an estimated shallow visual hip and lower two-storey wall. It is not the green-gabled house on the south side. |
| `way/1015118656` | R274/R298; south-side 9 Cricket | Taupe wall, two upper sash, small entry canopy | Tree-obscured doorway/ground panes are omitted. No full-width porch. |
| `way/1015118657` | R296/R274; south-side 13 Cricket | Pale wall/trim and shallow porch cues on the exact outer porch edge | The upper sash/shutters belong to a recessed upper plane, so no upper windows are placed on the outer porch edge. Recessed-plane geometry and exact rail are deferred. |
| `way/1015118659` | R296/R277/R294; south-side 17 Cricket | Pale lower porch, bounded dark upper rail/deck strips, brown west privacy screen and visible east upper sash | Rail/deck strips are shallow approximations, not surveyed balcony depth/slat texture. Generic balcony disabled to prevent duplication and its shared trim palette from recoloring the dark upper/pale lower structure. White gable/attic remain deferred. |
| `way/1015118660` | R277/R279/R294; south-side 21 Cricket | Red body, two upper sash, west ground sash, small east green-trimmed entry | No broad porch. Green triangular gable/attic pair are not painted as a rectangular panel on the red body. Entry glazing is simplified by the existing renderer. |
| `way/1015118662` | R277/R279/R294; south-side 25 Cricket | Pale body, two upper sash, pale-post porch | Hidden ground openings, fine rail and source hip-roof correction remain deferred. |

Circle K is the only newly authored text sign in this module. The Kawartha identity is independently supported by the civic address and official contact listing, but its small photo lettering is not readable enough to copy. No new business lettering is invented.

## Geometry review flags

This module does not author `height`, `eaveHeight`, `roof`, `roofRise`, `massing`, `recordedRoof`, ground geometry or collision. The existing route composition must mark new records `appearanceOnly` and `preserveMappedMassing`. `detailHeightMetres` only bounds facade decoration; it does not change the source wall.

| Source | Actual current mapped wall used by tests | Separate photo/geometry limitation |
|---|---:|---|
| Kawartha / `1015118634` | 6.517 m | Source infers gable over uniform mass; photo shows low flat frontage and higher rear mass. |
| Driscoll / `755554027` | 5.169 m | Uniform inferred source mass versus low south wing and higher north block. Decoration caps are 3.2 m and 5.1 m on the two exact faces. |
| Circle K / `755554019` | 2.600 m | Source low wall/inferred gable cannot express raised pale portal; sign and glass are deliberately bounded below it. |
| Cricket SE / `1015118609` | 6.705 m | Broad main house and visibly lower rear returns must not be uniformly raised. |
| Cricket NE / `1015118646` | 5.121 m | Photo shallow roof silhouette does not establish all unseen roof geometry. |
| 14 Cricket / `1015118647` | 4.684 m | Source wall is low; upper sash fit under it. White triangular gable/attic needs separate roof support. |
| 16 Cricket / `1015118648` | 7.071 m | Current gable/tall inferred source differs from observed shallow hip. |
| 9 Cricket / `1015118656` | 5.954 m | Source hip retained; photo-occluded entry not derived. |
| 13 Cricket / `1015118657` | 6.223 m | Exact frontage is outer porch projection, not upper main wall. No new upper plane is implied. |
| 17 Cricket / `1015118659` | 6.009 m | Exact balcony depth, white gable and attic remain unmodeled. |
| 21 Cricket / `1015118660` | 6.376 m | Green gable/attic need a separately reviewed roof-face treatment. |
| 25 Cricket / `1015118662` | 5.201 m | Current gable differs from photographed shallow hip. |

These values are retained source/physics model outputs, not measured real building heights. The v208 candidate below adds separate reviewed visual envelopes for Circle K, the northeast Cricket corner and 16 Cricket. A passing bound check does not make an inferred source mass photographically correct.

## Preserved work and exclusions

Existing bespoke 22/24 Cricket profiles are absent from this registry, so route composition cannot duplicate or overwrite them. The ordered sequence and municipal parcel/building association support 22 as the narrow pale-gable house and 24 as the broad orange-toy house. Independent review corroborated that mapping; root assigned the bounded correction to its existing owner. Historic user confirmation remains recorded as conflicting evidence rather than silently erased.

No Driscoll garden, parking stripe, tree, pavement or retaining-wall object is imported. The old garden ellipse intersects municipal parking geometry, and the old Driscoll parking-row origin lies inside the mapped building. Those placements are not considered implementation-ready. Water/Hunter bridge work ends at the preceding route segment and is not duplicated here.

## Conservative cab review poses

Use the normal projection and terrain sampler. Eye height is 2.1 m above sampled road; target height is 2.5 m above the source building base. Bearings are compass degrees (0 north, 90 east). All positions are on a mapped road centerline, but cab collision/visibility still requires runtime review. Edge indices are zero-based vertices of the current ring with its repeated closure removed.

| Source / face | Directed ring edge | Camera latitude, longitude | Bearing | Road |
|---|---|---|---:|---|
| `way/1015118634` / 0 | 1 → 2 | 44.30581346, -78.31231560 | 340.537° | `way/33953339` |
| `way/755554027` / 0 | 2 → 3 | 44.30627140, -78.31169717 | 72.002° | `way/33965578` |
| `way/755554027` / 1 | 4 → 5 | 44.30646776, -78.31178633 | 71.974° | `way/33965578` |
| `way/755554019` / 0 | 0 → 3 | 44.30600622, -78.31145848 | 161.894° | `way/33939069` |
| `way/1015118609` / 0 | 7 → 8 | 44.30702203, -78.31184827 | 162.350° | `way/33960427` |
| `way/1015118609` / 1 | 6 → 7 | 44.30682199, -78.31194824 | 73.146° | `way/33965578` |
| `way/1015118646` / 0 | 2 → 1 | 44.30701578, -78.31187569 | 342.350° | `way/33960427` |
| `way/1015118647` / 0 | 3 → 2 | 44.30709955, -78.31150779 | 342.350° | `way/33960427` |
| `way/1015118648` / 0 | 2 → 1 | 44.30712263, -78.31140642 | 342.350° | `way/33960427` |
| `way/1015118656` / 0 | 1 → 2 | 44.30707005, -78.31163735 | 162.350° | `way/33960427` |
| `way/1015118657` / 0 | 10 → 11 | 44.30710258, -78.31149450 | 162.350° | `way/33960427` |
| `way/1015118659` / 0 | 2 → 3 | 44.30713651, -78.31134548 | 162.350° | `way/33960427` |
| `way/1015118660` / 0 | 3 → 0 | 44.30716975, -78.31119949 | 162.350° | `way/33960427` |
| `way/1015118662` / 0 | 3 → 0 | 44.30720299, -78.31105352 | 162.350° | `way/33960427` |

## Validation status

`node --test tests/route-east-city-appearance.test.mjs` was run before the registry existed: all eight tests failed with the intended missing-registry assertion. After implementation, all eight passed. Tests exercise the actual current source-height resolver and production facade renderer in both full and Lite modes, all fourteen literal adjacent edges and their road-facing normals, centerline QA placement, finite transforms, panels without height collapse, distinct glass fields, sign clearance, Driscoll face isolation, four-window corner rhythm, blank corner side wall, porch-plane restraint, green eastern entry and west-side balcony screen.

After root integrated the registry, the original eight checks were switched from local manual composition to the actual production `addRouteLandmarkAppearances` result, with the preceding recording-appearance and bespoke Cricket profile chain used by the app. Four additional tests bring the focused suite to **12/12 passing**. They verify all twelve sources/fourteen faces, input immutability, preservation of existing source massing, unchanged bespoke Cricket/Station 1 records, and the shared legacy/reference opt-out.

The two Circle K tests create the actual textured facade sign mesh and inspect its `renderedSigns` output in full and Lite modes on the current **2.60 m** source wall. They then pass those actual records and the approved production business-directory row into the production directory-sign layer. Both modes retain one existing sign and create zero duplicate panels. When actual rendered-sign metadata is absent, the same profile retains one directory fallback; sign intention alone does not suppress it. The browser canvas surface is the only Node test substitute. Current footprint, frontage, dimensions, generated registry and sign/deduplication code are real.

An independent reviewer inspected every original R261–R300 in route order and checked all twelve records/fourteen faces against the source ledger, current geometry and renderer. No blocking source-fit defect was found. The reviewer confirmed the six-slot Kawartha rhythm, Circle K portal side, Driscoll face separation, Cricket corner allocation and west balcony screen. Deferred gables, the recessed 13 Cricket upper plane and inferred roof/height conflicts remain explicit limitations. This source/data review is not game-view approval; browser/cab screenshots and release verification remain separate integration gates.

Before the integration hardening, the full repository command `node --test tests/*.test.*` passed **1,667/1,667 tests**. After hardening, a fresh full run passed **1,692/1,692 tests**, with no failures, skips or cancellations. Both new JavaScript files passed `node --check`; the follow-up test passed syntax inspection again, and whitespace inspection reported no errors. Shared-workspace results include concurrent work and do not replace the integrating agent's final release check. No app wiring, version bump, commit, deployment or browser visual approval was performed by this batch owner.

## v1.6.208 candidate: three reviewed display envelopes

The exact Balanced cab images at `qa-captures/1311f75/evidence/current/balanced/east-north/` and `east-south/` were compared again with R263/R264, R265/R269, R273/R299 and R276/R295, the current literal footprint edges, and the previously retrieved Ontario orthophotos. The observed flat/hip roof types and source matches support the changes below; numeric heights and cap thickness remain estimates.

| Source | Retained source wall / roof rise | Candidate visual wall / roof rise | Evidence and limit |
|---|---|---|---|
| Circle K `way/755554019` | 2.600 / 1.56460 m, inferred gable | 2.600 / 0.10 m, flat | R263/R264 show a low blue-gray metal fascia; aerial shows a flat roof behind it. Keep the one-storey source wall and datum exactly. Raised portal and fascia slopes are not reconstructed. |
| Cricket NE `way/1015118646` | 5.12056 / 2.28840 m, inferred gable | 5.12056 / 0.55 m, shallow hip | R273/R299 show a shallow eave silhouette without a tall red triangle. Aerial confirms longitudinal hips. Keep the existing wall and sparse opening pattern. Unseen Driscoll openings remain unverified. |
| 16 Cricket `way/1015118648` | 7.07074 / 1.70958 m, inferred gable | 5.60 / 0.90 m, shallow hip | R276/R295 show two principal storeys, a shallow hip and the existing broad porch; aerial confirms the hip and ordered 14→16→22 row. Both new dimensions are estimates. Hidden ground openings remain omitted. |

All three retain the whole-ring source terrain datum. Independently reconstructed production DTM/Float32-grid samples matched each stored local cab ground value exactly; the full-ring/frontage differences are small and do not explain the incorrect roof silhouettes. The scratch evidence is `east-city-envelope-terrain.json`. The helper continues to reject invalid rings/frontages, unsafe terrain, expansion beyond the source envelope and conflicting bespoke massing.

Circle K has an explicit `building:levels=1` tag, but no source roof tags. The helper now permits a narrowly bounded roof-only inference replacement when the requested wall equals the resolved source wall exactly and the datum remains `source`; `minHeight` is retained. Any change to that wall or datum is rejected. Explicit `height`, roof shape/height/levels, or base tags still take precedence. A later source change to two storeys also rejects the stale 2.60 m opt-in. This does not permit a photo estimate to replace the mapped one-storey wall.

The two Cricket source rings have four vertices. The ordinary four-corner hip builder creates a single pyramid peak; the aerials show elongated ridges. The root-integrated app dispatch sends explicitly reviewed hips through the existing clipped ridge-roof builder before the four-corner fallback. Its roofs cover the exact source areas, stay within the reviewed eave/apex, and produce only 4.74/6.34 mm boundary closures caused by the slightly skewed source quadrilaterals. Their longitudinal ridges are approximately 4.98/10.14 m in the current map projection. Those are computed mesh properties, not surveyed roof lengths.

`tests/route-east-city-envelope.test.mjs` was first run without the records and failed all three tests. After implementation, the new tests and existing East City/Reid-envelope regressions passed **23/23**. They exercise actual source dimensions and reconstructed sloping terrain, unchanged inputs/physics dimensions, the one-storey roof-only exception and refusal cases, clipped roof area/ridge/cap bounds, and the production full/Lite facade/sign behavior at the resolved visual walls. A subsequent focused run including the actual app integration harness passed 34/34. The shared full run passed 1,750/1,751, with one unrelated location-report test expecting an incorrect result for a fixed guess against an unpinned target; that test passed on isolated rerun. Fresh cab captures and the integrating agent's final release check remain separate gates; no new visual approval is claimed.

## Driscoll stepped-height plan — helper reviewed, app integration pending

The fresh v205 images show the long low west wing as a tall solid box. R265/R269 and the aerial roof/shadow pattern support a higher projecting north block and a lower main wing inside the same eight-vertex source ring. A whole-footprint height reduction would erase the higher block.

Using the current ring indices, the high projection is `[3,4,5,6,7]`, closed by the internal line from **3 = (44.3064962, -78.3114520)** to **7 = (44.3065686, -78.3114666)**. The lower main-wing polygon is `[0,1,2,3,7]`. This retains every exterior source vertex. The navy-door/high-window face `4→5` belongs solely to the high block; the complete sparse/ribbon face `2→3` belongs to the low wing. The audit overlay is `east-city-analysis/driscoll-north-block-split-audit.png` in scratch.

A low-wing top around 3.2 m and north-block wall near the existing 5.16891 m are conservative visual estimates; exact roof thickness and hidden elevations remain unmeasured. Existing massing zones accept north/south/east/west boxes, so a box cannot follow this rotated internal boundary accurately. An implementation needs one reviewed oriented split clipped to the exact footprint, source-metadata guards, original ring/area preservation, terrain-bound checks and separate decoration tops. The existing massing helper adds 0.2 m to zone roofs and outer walls, which must be included when translating the target heights. No uniform envelope override is added to the route registry. The separate `reviewed-split-massing.js` helper now implements the exact audited split with explicit 0.12 m roof caps; its app integration remains with root. Independent review passed all eight helper tests and additionally checked actual exterior triangle normals, the internal step facing the low wing, and the existing facade meshes at the captured maximum eave. Low/high partition areas are 547.4151072/55.7536937 m²; together they equal 603.1688009 m². Existing low-face decoration reaches 3.05 m below its 3.2 m eave; the high window reaches 4.48 m below the retained 5.16891 m eave. No source/material/topology blocker was found; this is not cab visual approval.

13 Cricket's recessed upper wall, 21 Cricket's green gable/attic, and bespoke 22/24 roof/attic details remain deferred. Generic panes on the outer porch plane would place those details on the wrong surface. Kawartha's higher rear mass also remains preserved pending a separately verified split.

## Additional v208 corner-return QA pose

The historical `way/1015118609` west-return cab at 44.30682199, -78.31194824 / 73.146° is only 7.7 m from the wall and filled the windshield in the v205 capture. It remains unchanged as evidence. An added oblique review pose is **44.30695376, -78.312004025 / 136.263772°**, targeting the same exact `6→7` edge midpoint **44.30684205, -78.31185570**, 17.09053 m away. The new eye point is exactly 85% along mapped Driscoll `way/33965578` segment `4→5`, about 3.5 m south of the Cricket junction. It faces southeast to include the return and north corner; cab visibility and occlusion still require runtime verification. The scratch camera record is `east-city-analysis/added-driscoll-return-cab.json`.
