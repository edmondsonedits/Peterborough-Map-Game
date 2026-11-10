# Reid photo-route review — R069–R132

Read-only review, 2026-11-10. No game files were edited and no rendered-game result is claimed. Current geometry was read from `city-explorer/data/peterborough-osm.json` and `peterborough-official-buildings.geojson`; the register and old patch were treated as candidate correspondences. All 64 photos were inspected on four contact sheets; the high-value/ambiguous photos and three four-corner intersections were then inspected at the supplied 680×680 size.

## Main conclusion

Use the six high-confidence building matches below as the next small Reid batch. They cover the Parkhill approach, three Edinburgh corners, and the red duplex before Dublin with existing renderer capabilities. The old Edinburgh southwest and light-brick-house matches should **not** be imported: the blue-gray house in R079 fits a different ring, and R081 has a potentially merged/misassigned frontage. The Kirk trio is distinctive and correctly ordered, but its old frontages are projecting porch edges rather than the complete upper façades.

The route runs **south on Reid**. In this segment, **lens 0 looks predominantly west** and **lens 1 east**. West-side buildings face east toward Reid; east-side buildings face west. This is supported independently by the Parkhill/service-shop sequence, Edinburgh crossing, the McDonnel crossing and street blade, the bridge followed by Murray, Kirk, Brock, cathedral/Simcoe, Charlotte, and Sherbrooke. Within the photos, west-facing camera views put north toward image-right; east-facing views put north toward image-left. Oblique views can show a return as well as the principal Reid face.

## Recommended next batch: six low-dependency stable IDs

All listed endpoints exactly match adjacent vertices in the **current** OSM ring. Endpoint precision is source-map precision, not a claim about real-world survey accuracy. Dimensions, colors and nonvisible returns remain estimates. Current visual profile modules contained none of these six IDs at the initial review. The subsequent six-record `route-reid-appearances.js` has now received a read-only photo/data review; see the follow-up below.

| Priority / stable ID | Source | Location and matched front | Directly visible appearance | Minimum implementation / limits |
|---|---|---|---|---|
| 1. `way/446339087` | R074 03:34.214, R076 03:36.216, R078 03:40.220; lens 1 | Edinburgh NE; west-facing main wall. N→S: `(44.3134345,-78.3281535)` → `(44.3132778,-78.3281395)` | One low flat-roof service building; pale walls; dark/red fascia; **two** pale-gridded garage bays on the north part of the west face, red entry zone to their south; south return also has a garage bay. **Jiffy Lube** lettering is readable in R076 and consistent in R074/R078. Large open apron north and west. | Current retail profile, `groundWindows`, `entryDoor`, red `facadePanels`, `signText` can establish mass/color/openings. Do **not** put the south-return garage on the west face: the old patch's third west-face `groundWindow` is wrong. Grid bars require a small reused primitive or a verified current consumer; old `windowMullions/windowTransom` are unsupported. Preserve the broad open apron. |
| 2. `way/1002680974` | R073 03:34.214; lens 0 | First west-side house south of Parkhill, SW corner. N→S east edge: `(44.3135563,-78.3285760)` → `(44.3134873,-78.3285716)` | Pale sage horizontal siding; front gable; two upper narrow windows; separate low gray awnings over the lower window and entry; white trim. | House profile with gable, material category, two upper windows, supported entry/canopy pieces. Keep awning placement visually estimated. A precise side entrance is not established by R073. |
| 3. `way/1002680975` | R073, R075 03:36.216; lens 0 | Immediately south of 0974. N→S east edge: `(44.3134402,-78.3285639)` → `(44.3133717,-78.3285595)` | White-sided gabled house, single narrow attic window, enclosed projecting porch, broad pale-framed porch glazing and red-brown lower porch wall. | Colors and gable can use current fields. The enclosed porch must not be substituted with the renderer's default open two-post porch. Use `porch:false` plus supported façade panels/openings for a conservative first pass, or an explicitly bounded porch component. |
| 4. `way/1002680782` | R077 03:40.220; lens 0; neighborhood ordering R073/R075/R078 | Edinburgh NW. N→S east edge: `(44.3132339,-78.3285525)` → `(44.3131668,-78.3285482)` | Low tan bungalow; broad dark shallow roof; pale window group; rough stone-faced lower wall/entry; shrub partly occludes north end. | Current one-level house profile, muted tan, pale trim, dark roof, `plinthColor/plinthHeight` as estimates. Roof is low pitched; calling its exact subtype surveyed would overstate the photo. Do not infer hidden windows or exact porch width. |
| 5. `way/1005415712` | R078 03:40.220; lens 1 | Edinburgh SE; immediately across Edinburgh from service shop. N→S west edge: `(44.3130103,-78.3281834)` → `(44.3129525,-78.3281821)` | Raised reddish brick house with two main floors and front gable; pale upper window trim; pale enclosed/screened porch framing, gray lower/base area; lawn above continuous stone retaining wall. Low return extends south/right. | Supported main mass/colors/porch can be estimated. Keep the lower return lower; applying one gabled height to this entire complex polygon will overstate that wing. Existing `massing` support could preserve it, but exact zone bounds are not derived here. Trees hide much of the façade; restrained openings. |
| 6. `way/1002680800` | R083 03:56.236; lens 0; Dublin appears next in R084 | West side immediately north of Dublin, south of the long apartment/row footprint. N→S east edge: `(44.3120235,-78.3286140)` → `(44.3119450,-78.3286090)` | Red brick two-storey front; two narrow upper sashes; broad low dark porch roof with pale posts; two separate pale doors and a lower dark sash; dark shallow hip-like roof. | Current mass/roof/colors and broad porch are enough for first pass. **Two doors are observed**, but old `doorFractions` has no current consumer. Do not claim exact reproduction with a single default centered door; either use two bounded panels/entry components or defer that detail. |

The photos support roughly one/two-storey categories and roof silhouettes, not exact metre heights. Do not import the old patch's decimal dimensions as observations.

## Edinburgh: explicitly account for all four corners

| Corner | Result |
|---|---|
| NW | `way/1002680782`, R077, high-confidence tan bungalow match. |
| NE | `way/446339087`, R074/R076/R078, high-confidence service shop match. |
| SE | `way/1005415712`, R078, high-confidence raised brick house match; complex ring includes lower return. |
| SW | Actual corner is `way/1002680794`, corroborated by full municipal building `6/29097` and the Ontario orthophoto. It is the long tan/garage property partly visible at R079 image-right/north. **R079's principal blue-gray house is `way/1002681002` (`6/8215`), one house south of the corner.** OSM ring, full municipal ring, roof in the orthophoto, and north/south neighbor order all corroborate this correction. A clear image of 0794's entire frontage remains missing, so its appearance stays deferred. |

Candidate corrected R079 front: `way/1002681002`, current adjacent east edge N→S `(44.3127978,-78.3285841)` → `(44.3127273,-78.3285795)`. Observed blue-gray walls, shallow pyramidal/hip-like blue-gray roof, two large white-framed window groups, rust-toned door, cream base, short front steps. This is now a **high-confidence corroborated map correspondence**, not a directly readable geographic label in the photo. The distinct small hip/pyramid-like roof and neighbor sequence agree in the Ontario orthophoto and full municipal Buildings data. Keep it out of an “all four Edinburgh corner façades verified” claim: it is not the corner. Exact ring/frontage and an estimated QA camera are in `reid-r079-corrected-plan.geojson`.

Other useful independent pair: R075's small white gabled cottage with green-edged front gable sits between the white porch house and NW tan bungalow; the ordered source-ring candidate is `way/1002680976`. Its projection is in the ring; old patch did not register it. R075 is clear enough for a later conservative profile, but use the full main wall rather than the tiny projected porch edge.

## R081 mapping ambiguity: do not color one entire ring as the light-brick house

R081 (03:48.228, lens 1) shows a red two-storey porch house at image-left/north and a light gray/tan brick, near-flat-roof two-storey house at image-right/south, both above the retaining wall. The old register assigns the latter to `way/1005416166` with west edge `(44.3126931,-78.3282071)` → `(44.3125243,-78.3282032)`.

That source edge is approximately 19 m long **in source geometry**, far wider than the isolated light house appears. The nearby source rings do not unambiguously separate the two photographed buildings. `1005416166` may encompass both visible houses, or the light house may instead correspond to the next ring `1005416163`. The photo alone does not settle this. The initial gap-fill data supplied no resolution. A later query of the **full municipal Buildings layer** also shows the same long rectangle as `6/17194`; the next small ring 6163 corresponds to municipal `6/4448`. The Ontario orthophoto shows a long hip-roof form within 6166 and an open area to its north, so it does not independently establish the photo's separate red/light house assignment. Temporal change or an incomplete/merged source footprint remains possible. Avoid applying one light wall/flat roof profile to all of 6166. An additional geolocated view or capture-date comparison is still needed.

## Kirk trio: good identities, extra façade care

R102 (04:52.292, lens 1) directly shows three consecutive houses east of Reid, north of Kirk. North→south/image-left→right: charcoal/red brick, pale yellow, cool gray. The current ring sequence is unambiguous. **Kirk terminates at Reid from the east (a T junction)** in current map geometry; do not manufacture four equal corners.

| Stable ID | Directly observed | Old registered front / issue |
|---|---|---|
| `way/1005684943` | Dark charcoal upper wall over red-brown brick; pale upper sashes; shallow clipped front roof; dark projecting porch. | N→S `(44.3075626,-78.3278542)` → `(44.3075211,-78.3278511)`. These are the outer **porch** edge vertices, not the complete upper wall. |
| `way/1005685022` | Pale yellow horizontal siding, white trim, two upper windows, small dark front attic opening, projecting pale porch with dark roof, concrete/gray base. | N→S `(44.3074707,-78.3278558)` → `(44.3074408,-78.3278537)`. Again the narrow outer porch edge; do not squeeze upper windows into it. |
| `way/1005684944` | Cool gray siding, two upper white-framed windows, small attic opening, prominent dark porch roof, pale porch columns/rails, lawn and shrubs. NE Kirk corner. | N→S `(44.3073855,-78.3278515)` → `(44.3073537,-78.3278491)`. Outer porch edge rather than full main façade. |

These three extend the proposed batch to **nine IDs**, but only after separating porch treatment from the upper façade. Roof tops are clipped/hipped at the front; current roof generator supports gable/hip/pyramid/mansard, not an explicit clipped-gable shape. A plain gable is a visible approximation and must be described as such. No business sign is warranted on any of these houses.

Optional simpler later substitute: R101 (04:48.288, lens 1) shows a red-brick two-storey house with **480** clearly legible, two upper windows, dark shallow entry canopy and broad ground window. The street corner on its north/left is Murray, immediately after the bridge. The high-confidence ordered-ring candidate is `way/1005685028`; its west N→S edge is `(44.3079726,-78.3279403)` → `(44.3078899,-78.3279343)`. This is a new match from current map order and photo, not from the old register. Do not confuse 480 with 490.

## Open spaces and retaining wall / bridge

1. **North of Jiffy Lube (R074/R076):** broad vacant paved/gravel forecourt is plainly visible, with low weeds/trees at its back. Current official gap-fill building **`6/20155`** occupies this open area (ring near 44.31353, -78.32821). That source shape is not present in the recorded view, but the Ontario orthophoto **does show the building there**. This establishes a source/capture disagreement consistent with temporal change; no acquisition or demolition date is established. Municipal parking polygon `10/230` notches around that building, so suppressing the building alone can leave a ground or collision inconsistency. Any deliberate visual correction must treat building, ground, and collision coherently; do not delete authoritative data by assumption. No replacement building should be invented.
2. **East retaining wall south of Edinburgh (R078/R081/R082):** continuous low gray layered stone/block wall, flat top, raised grass, mature trees, breaks for paths/steps. The wall turns around the Edinburgh corner. A noticeable stair break is directly visible in R081 between the two houses. Old patch runs are approximate candidates, not exact measured linework. **Subsequent checks found the old north run intersects Edinburgh road11/994 and municipal sidewalk9/1189; the other two runs partly overlap the sidewalk at their proposed width. Do not import the old coordinates.** Checking only OSM sidewalk centerline `way/826804088` misses the municipal corner and ribbon offsets. Revised candidate coordinates and clearances are recorded below; path/step breaks remain unresolved. The old three runs stop before the R082 bungalows, although wall continues visibly there. Thus old coverage is incomplete. Do not describe the wall as only a single small corner decoration.
3. **West lawn at McDonnel NW (R088/R090/R092/R094):** broad grass/tree corner in front of the brick house, with utility cabinet and sidewalks. Preserve the large setback; the house is not at the curb corner. The green cabinet is directly visible; exact text and warning sign cannot be read confidently.
4. **Creek/retirement entry (R098/R099):** R098 lens 0 shows a landscaped open drive into a set-back larger complex, with mature trees. R099 lens 1 clearly shows the **east** bridge parapet: pale concrete wall with stains/graffiti, one narrow gray horizontal pipe rail and short posts, tree-filled creek behind. The west parapet is not established by R099 alone. Symmetric west rail would be an inference.
5. **Bridge map match:** current `way/746752007` is the Reid bridge centerline, `(44.3082217,-78.3280857)` → `(44.3081176,-78.3280786)`. East bridge sidewalk is `way/826785731`, `(44.3081200,-78.3280040)` → `(44.3082303,-78.3280107)`; west sidewalk `way/826785732`, `(44.3082227,-78.3281730)` → `(44.3081200,-78.3281676)`. These independently anchor the old `reid-creek` candidate. Municipal bridge `12/90` independently anchors the crossing. **Both old interpolated parapets and exact outer-edge alternatives require further work:** an east parapet on the exact municipal edge would overlap the game's municipal sidewalk ribbon35/3920, and the west alternative conflicts with the adjacent OSM sidewalk826785773. Do not shift the parapets arbitrarily beyond the bridge to hide this source discrepancy. Deck/terrain height logic and pavement reconciliation are needed, so this is separate from the façade-only batch.
6. **Later open spaces:** R107 shows a broad grass/paved setback beside the Masonic building's plain west service wall; R114/R116 show an open paved lot south of Trinity; R126 shows a larger open parking lot east of Reid farther south. R127–R132 show lawns/driveways near King/Sherbrooke. Preserve the open gaps and avoid generic infill; the follow-up `reid-open-context-plan.geojson` preserves exact existing municipal polygons as references: `10/266` Masonic west setback, `10/1179` south of Trinity, and `10/428` east of Reid south of Charlotte. `10/457` is only a candidate for R132's background lot and is not a verified polygon for the foreground lawn. No new lot boundaries or stall markings were inferred.

## Other four-corner checks in the requested image range

All four candidate IDs at McDonnel and Charlotte exist in current geometry, and their old registered endpoints are adjacent vertices. That only validates edge existence; visible wall selection still needs care.

| Junction | NW | NE | SW | SE |
|---|---|---|---|---|
| McDonnel / Reid | R090: `way/1002681044`, red brick house behind broad treed lawn, white projecting porch. | R091: `way/1005416071`, low red-brown commercial complex with brown fascia/dark openings; front lawn and corner setback. | R094/R096: `way/1002312394`, pale two-storey house at curb corner plus low south return. | R095/R097: `way/1005678451`, white/gray service/commercial building and open apron. R097 is much better than R095 for bay layout. |
| Charlotte / Reid | R119: `way/1001156256`, low brick commercial face, pale sign band, dark glazing, taller brick body behind. | R120: `way/1006217256`, cream corner with two-storey south tower and low north wing, black/dark shallow roof with rounded decorative heads; green doors. A uniform two-storey extrusion misses the low wing. | R123: `way/1000902329`, red brick gabled house with pale gable, projecting upper bay and rough-stone lower addition. | R124: `way/1006594144`, red brick block with three full upper window rows above a partly blank lower level, pale lintels, shorter south return. “Kawartha Cardiology” comes from register; the name is not readable in this view. |

McDonnel SE caution: the old west-edge frontage is short; much of the conspicuous white horizontal façade in R095 is a different return. Match R097 against the west edge before placing the whole bay pattern. Do not put the large north-facing strip on the short west wall.

R106/R107 correspond coherently to the long apartment row west of Reid and plain Masonic west wall east of Reid. R109 cathedral is an existing landmark; R110–R112 are the pale house/opposite stone building/Trinity sequence. **Trinity's old main endpoints are not adjacent** in its current ring (indices 22 and 25), so it requires a recess/segment-aware frontage review. R131 only establishes the NW Sherbrooke brick house in the requested range; R132 is still the east/north approach. Full four-corner Sherbrooke assessment needs the subsequent photos, not this range alone.

## Current renderer compatibility

The reviewed baseline `sherbrooke-footage.js` supports `frontLatLon`, `levels`, `windowColumns`, `windowOverrides`, `groundWindows`, `entryDoor`, `entryCanopy`, `facadePanels`, `plinthColor/plinthHeight`, `porch:false` and bounded porch dimensions, `additionalFrontages`, and sign fields. `sherbrooke-footage-roofs.js` supports `roof:'gable'|'hip'|'pyramid'|'mansard'`, with `eaveHeight`/`roofRise` supplied through the profile. Root agent/other workers may be changing these modules concurrently; verify before implementation.

The **old-patch-only** fields `observedRoofShape`, `observedWallLevels`, `gableColor`, `doorFractions`, `porchRailing`, `windowMullions`, `windowTransom`, and `parapetColor` had **no consumers** in the current baseline. Copying those records alone silently omits their intended details. In particular, generic house material defaults to brick unless `wallSurface` is deliberately chosen; the sage/white/yellow/gray siding should not become brick merely because the color is close.

No current rendering, browser QA or game camera views were produced by this read-only task. Before claiming completion of a subsequent implementation, compare each changed building with a ground-level camera on the same side/heading as its photo; check the opposite view for wrong-wall placement; preserve source IDs/rings and collision; check that unobserved returns are conservative; and inspect the Jiffy empty lot, Edinburgh wall clearance, and bridge rail offset separately.

## Scratch inspection artifacts

- `reid-next-batch-plan.geojson` — **six exact current source footprint rings**, six ring-adjacent frontage lines, six proposed QA camera points. Each camera includes target lon/lat, compass heading, mapped Reid centerline source ID, and ground-relative eye/target settings. Camera positions are computed QA estimates, not recovered recording poses. This file deliberately excludes ambiguous R079/R081, open-lot suppression and Kirk upper-wall segmentation.
- `reid-analysis/qa-camera-table.json` — compact copy of the six camera/target/heading records.
- `reid-analysis/contact-069-084.jpg`
- `reid-analysis/contact-085-100.jpg`
- `reid-analysis/contact-101-116.jpg`
- `reid-analysis/contact-117-132.jpg`
- `reid-analysis/map-edinburgh-cropped.png` — useful map of the two ambiguous matches; gray OSM buildings, red official gap-fill, north up, labels are final five digits of IDs.
- `reid-analysis/map-edinburgh.png`, `map-mcdonnel-creek.png`, `map-kirk.png` — full source-neighborhood plots; margins contain off-plot road labels and are less useful than the cropped Edinburgh map.

Photo timestamps/lenses above come from `handoff/extracted/photo-index.csv`; original photographs remain in `handoff/extracted/R###.jpg`. No exact facade dimensions have been inferred from their experimental perspective calibration.


## Follow-up review: source reconciliation and implementable scope

The current six-record `city-explorer/route-reid-appearances.js` was reviewed against the actual photos and exact current ring directions. **No blocking photo/data mismatch was found in this appearance-only scope.** The Jiffy west face has two bays; the south-return bay remains omitted. The sage entry is toward the north/right in R073. The two enclosed porches use bounded panels rather than a generic open porch. The raised brick house retains only restrained visible opening cues; no extra occluded windows are warranted. The duplex has two opaque door panels and no invented third default entry. Precise dimensions/fractions are explicitly estimates. Source massing/roof geometry is preserved. This review does **not** establish rendered-game quality; the implementation agent reported focused tests separately, and ground-level camera QA remains the integrator's task.

The six original IDs remain the strongest immediately implementable group. R079/1002681002 is now a supported later addition after the corrected correspondence above. Actual Edinburgh SW corner 1002680794, R081/6166, Jiffy lot suppression, bridge rails and retaining-wall step breaks remain separate issues; none should be forced into the six-building batch.

### Pavement clearance findings

A new continuous segment-to-polygon/ribbon check uses a local equirectangular metre projection. It checks municipal road/parking polygons, full municipal sidewalk polygons, the game’s municipal sidewalk centerlines at their current 1.45m width, and OSM sidewalk lines at the default 1.6m width. This is **source-model geometry**, not a field survey or proof of rendered elevation. Old-run checks sampled at ≤0.25m; revised checks use continuous segment distances. Widths below are visual estimates.

Old wall north line `[-78.328315,44.313060]→[-78.328304,44.312902]` intersects road11/994 and sidewalk9/1189. At 0.35m wall width, old middle/south lines overlap the municipal sidewalk polygon by approximately 0.119m/0.032m. The old north endpoint falls in Edinburgh pavement, rather than following the sidewalk’s corner curve.

The revised candidates below clear source pavement, but **are not approved measured wall locations**. The northern run is shortened to omit the unresolved corner turn. Middle/south runs retain estimated old longitudinal intervals, so the stair and driveway breaks must be located before implementation. Do not create continuous barriers across the visible R081 steps.

| Candidate | Lon/lat endpoints N→S | Estimated solid width | Minimum clearance to municipal sidewalk polygon | Minimum clearance to current municipal sidewalk ribbon | Minimum clearance to default OSM sidewalk ribbon |
|---|---|---:|---:|---:|---:|
| North short wall | `[-78.328289,44.312985]→[-78.3282896,44.312902]` | 0.35m | 1.001m | 0.364m | 1.409m |
| Middle wall | `[-78.3282926,44.312872]→[-78.3282786,44.312680]` | 0.35m | 0.630m | 0.402m | 0.998m |
| South wall | `[-78.3282766,44.312647]→[-78.3282646,44.312475]` | 0.35m | 0.716m | 0.343m | 0.946m |

All three also clear municipal road polygons by >2.2m at that proposed width. Heights remain unassigned; any later build needs runtime ground sampling and a conservative estimated retaining height. These line positions favor non-overlap in the current source model; that does not make them exact photographic reconstruction.

Municipal bridge12/90 is named Reid St bridge, facility BR76, with `BR_SPAN:11` in source attributes. Its exact east outer edge is `[-78.327992441774,44.308227576312675]→[-78.32798669107294,44.308122599877905]`; west edge is `[-78.32818306348807,44.30822219015841]→[-78.32817731369889,44.30811721375413]`. A 0.31m estimated parapet centered on those edges would clear sidewalk **polygons** by 0.089m east/0.309m west, but overlap the current municipal east ribbon35/3920 by 0.136m and OSM west approach826785773 by 0.191m. This is a real cross-source placement conflict to resolve before adding rails; the source span attribute is not a photographically measured parapet dimension. R099 directly supports only the east parapet.

### Open space and tree limits

`reid-open-context-plan.geojson` contains exact existing polygons10/230,10/239,10/266,10/309,10/428,10/457,10/1179,12/90 and conflicting building6/20155, each with its photographic context and limits. The Trinity south lot is10/1179, not10/406 on the church’s north side. No painted parking pattern is verified from these ground photographs. Existing large setbacks and open gaps should remain open.

The live municipal tree inventory was also queried. Its sparse points and older edit dates do not establish which exact trunk appears in R078/R081, and no individual tree was promoted to a verified photo match. The photos directly support mature tree cover and raised lawn along east Reid, but species, trunk coordinates and present condition remain unverified. Avoid substituting an arbitrary tree inventory point for a photographed tree merely because it is nearby.

### Sources and reproducible scratch files

- Full municipal Buildings layer: https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/6 — the live complete layer, not the repository’s nonoverlapping gap-fill subset. Query output is `reid-analysis/official-edinburgh-full.geojson`.
- Municipal sidewalks: https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/9 — query output `reid-analysis/official-reid-sidewalks.geojson`.
- The same Basedata service has 6 Buildings, 8 curb/edge pavement, 9 sidewalk polygons, 10 parking, 11 road surfaces, 12 bridges; source layers are separate and need not align perfectly with OSM.
- Ontario imagery service: https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer — export with bboxSR4326 and imageSR3857. Returned coverage layer 0 identifies Ontario; no acquisition year was found. Do not label this mosaic 2023 or current without additional metadata. Image/extent retained as `edinburgh-ontario-orthophoto-mercator.jpg` and `edinburgh-ortho-export.json`; labeled overlay is `edinburgh-ortho-ring-overlay.png`.
- Tree inventory: https://citymaps.peterborough.ca/arcgis/rest/services/TreesExternal/MapServer — layer 1 Trees by Scientific Family, layer 2 Forestry Zone, layer 3 Ash Trees. Local queried extract is `official-edinburgh-trees.geojson`.
- `reid-r079-corrected-plan.geojson` — corrected source ring/frontage plus camera lon/lat `[-78.32840433068013,44.31276856944369]`, compass 267.286°, estimated eye 2.1m above road and target 2.2m above sampled building base. Those heights are QA settings only.
- `reid-context-candidates.geojson` / `reid-analysis/streetscape-clearance.json` retain the **failed old-patch** wall/bridge placements for comparison.
- `reid-context-revised-candidates.geojson` / `reid-analysis/revised-clearance.json` contain the revised conservative wall candidates and **deferred conflicting** exact bridge-edge candidates. They are review plans, not game changes.
- `reid-analysis/revised_clearance.py` and `prepare_context_plan.py` reproduce the numerical checks and planning artifacts.

No game code, source rings, collision data, release version, or published site was modified by this read-only review.
