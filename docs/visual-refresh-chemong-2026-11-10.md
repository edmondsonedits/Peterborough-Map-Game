# Chemong photo appearance batch — 2026-11-10

Candidate implementation based on `4da1b86` / v1.6.201. The numbered archive was recovered from the supplied handoff; this batch follows Walmart lot → southbound Chemong Road → Mason Avenue. R001–R068 were reviewed for route context, with active building evidence through R061. Reid/Aji Sai, Hunter and Cricket are outside this batch.

This is an appearance implementation, not a claim that the complete scene matches the photographs. Browser/cab screenshot approval remains a separate gate. Source building rings, collision, terrain, roads and driving behavior are retained. The source `peterborough-osm.json` reports its OSM base timestamp as `2026-11-10T00:17:22Z`.

## Evidence and decisions

The independent reference review inspected all R001–R068 in contact sheets, then individual originals and selected inspection crops. It matched current OSM rings, register frontage endpoints, adjacent parcels and travel direction. After the lot exit the car travels southeast/southbound; lens 0 mostly shows the west/right side, lens 1 the east/left side. Lens identity alone was not used to infer a lot-exit direction.

Every active main/additional facade segment follows one exact current OSM ring edge. Numeric dimensions, colors, opening spacing and frontage fractions remain visual estimates. They are stored separately from the observation text in each record's `estimated` field. None is a survey measurement. Hidden/rear elevations are not claimed as photo-verified.

| Source ID | Photo evidence | Observed cues implemented | Limits retained |
|---|---|---|---|
| `way/176908280` | R008, R012, R014 | Walmart blue southwest-facing wall, white wordmark, pale stepped returns and broad dark glazing field | Distant view does not resolve entrance count or glass subdivisions: no added individual entry windows/door. Existing authored GLB remains; its 10.15 m wall height is used for the decoration only. |
| `way/176908281` | R019, R026 | Shoppers red central fascia and uprights, pale walls and tall entry cue | Existing reviewed footprint/eave/roof/frontage retained. Panel/sign widths are estimates. |
| `way/755556771` | R026, R028 | Starbucks dark fascia, verified white STARBUCKS COFFEE name, broad shop glass and pale return color | Glass subdivision and entry fraction estimated. |
| `way/446343896` | R033, R035 | Pale dental-office masonry, dark trim and narrow green-gray windows | Exact tenant wording unreadable; no new named sign. |
| `way/383393878` | R037, R038 | Pizza Pizza and Tim Hortons on their separate mapped frontage edges; charcoal fascia and pale glazing strip | No pylon; numeric facade/sign dimensions estimated. |
| `way/446339024` | R041 | Garage behind Ultramar: pale structure, dark fascia and three glazed service-door panels | Canopy is a separate deferred source, not merged into this building. |
| `way/77717331` | R048 | Brookdale low row, continuous pale fascia and broad glazing | Cropped Dollarama sign lacks a verified segment fraction; no new named sign. |
| `way/446339099` | R051, R053 | Dairy Queen cream trim and long glass frontage; v204 adds a glazed center gable and two smaller front gables | Roof projections and hidden hip form are estimated; the mapped outline and maximum roof elevation are retained. |
| `way/446343895` | R053 | Little Caesars pale masonry, charcoal fascia, verified orange lettering and broad storefront glass | Opening and sign dimensions estimated. |
| `way/176910551` | R055 | Four broad dark shop bays and pale divisions at 806 Chemong | Tenant names unreadable; no new tenant text. |
| `way/446366842` | R057 | KFC pale fascia, verified KFC letters, red north entrance trim and dark glazing | Roadside pylon deferred; its exact location is not inferred. |
| `way/1002815290` | R056 | Pale siding, green shutters, two lower windows, centered entry, two dormers and a ridge parallel to the street | v204 lowers the inferred eave to an estimated 3.25 m while retaining the source outline and maximum roof top. |
| `way/1002815291` | R058 | Red-brick color, pale trim and shallow red porch canopy | Distinct building south of the dormer house; pale side-wing geometry unchanged. |
| `way/1002815295` | R059 | Pale color and one small centered upper opening | Hedge obscures lower facade; no invented lower windows/entry. Gable-end ridge relation documented, geometry unchanged. |
| `way/1002815296` | R061 | Red-brick north Mason corner material colors | R061 principally shows Mason side elevations; no new Chemong-facing doors/windows/porch. |
| `way/1002815324` | R061 | Pale south Mason corner material colors | Same material-only restraint; roof/chimney geometry unchanged. |

The pale-sided house records use the existing `render` surface recipe as a restrained painted-wall treatment. This adds surface detail without claiming to reproduce the visible horizontal siding boards; an unsupported `plaster` recipe found during independent review was removed.

The active route modules contain 16 source IDs. Shoppers already has a base footage profile, so this adds 15 profile IDs and refines that existing one. The previous broad patch was not applied wholesale. Its inferred dentist/Dollarama sign placements, seven Walmart window bays, two-column R059 upper row, and detailed Mason front openings were deliberately removed or withheld after the current photo review.

## Runtime integration

- `route-landmark-appearances.js` merges the active landmark, corner and street registries after the existing recording/Cricket composition. Route cues are gated by the existing recording-reference and expansion toggles; legacy/reference opt-outs retain the original profile composition.
- Newly added records use `appearanceOnly` and `preserveMappedMassing`. Existing profile massing remains authoritative. The two separately tested `recordedRoof` opt-ins described below refine inferred roofs while retaining source outlines and maximum elevations.
- `sherbrooke-footage.js` accepts explicit glass color, an optional retail entry, optional shutters, optional sign font and an explicit `entryDoor: null` for an unseen entrance. The prior defaults remain when those fields are absent. Legacy glass keeps its existing default.
- The optional `decorate` callback in `emergency-facilities.js` attaches world-space frontage geometry to the validated Walmart replacement wrapper. It follows replacement visibility/runtime ownership. A decoration error is reported separately and does not discard a valid GLB or its existing scenery.
- Business-sign deduplication recognizes verified signs on additional storefronts and explicit business-name aliases. This prevents a directory label from duplicating the Tim Hortons sign on the wrong primary shop face.
- Generic prototype, citywide, reusable and legacy facade paths skip each registered captured frontage. Back/side generic behavior is retained. Ancillary garage doors do not apply to the active Bellevue garage because its mapped tag is `building=yes`.

Root integration owns the shared wall material selector and the source material classification used by roof/HVAC logic. Those need to preserve geometry decisions while allowing the reviewed route wall colors to render without generic random tint. The route unit tests alone do not establish that final app branch or cab appearance.

## Explicitly deferred

- Ultramar canopy `way/446339023`: R041 shows an open canopy, but its current source is a closed generic building. The earlier claim that a generic building collider would remain was unsupported: subsequent app/server inspection found obstacle handling for stations/fleet and road readiness, not ordinary mapped building shells. A bounded canopy geometry and access review is still pending; no canopy windows are added here.
- Walmart directory at Deana and KFC/DQ/Pizza road pylons still lack exact verified placement. Walmart's separately audited two partial parking rows and H1 leafless tree are now integrated; see `visual-refresh-walmart-ground-2026-11-10.md` for source guards and estimates.
- The R059 house ridge relation remains deferred. Dairy Queen and R056 roof cues are included in the separately tested v204 refinement below.
- Unreadable dental and 806 tenant wording and the cropped Dollarama frontage fraction: no new text placement.
- Reid/Aji Sai from R067 onward, then later route segments: queued separately.

## Verification

`tests/route-chemong-appearance.test.mjs` was first run against the unchanged runtime: all seven tests failed for the absent registry/options. After implementation all seven passed. Coverage includes opt-in glass and legacy preservation; entry/window exclusivity; paired shutters; bounded registry composition and immutability; exact current-map edge adjacency and finite Three.js geometry; world-coordinate decoration/visibility; and secondary-frontage sign deduplication. A later explicit Walmart no-invented-bays assertion failed against the old patch values, then passed after those values were removed.

Focused impacted run: 52 passing tests across the new route suite, business-sign renderer, emergency facilities, recording facade/integration, Sherbrooke frontage renderer, corridor and Cricket appearance suites. The unchanged source height/roof/frontage integration assertions passed. A complete `node --test tests/*.test.*` run then passed 1,580/1,580 tests. An added material-recipe check caught the unsupported pale-wall recipe and passed after it was changed to the existing `render` recipe. Browser capture review remains separate; no browser approval is claimed in this document.

## Source-height integration correction

An independent renderer review found that the earlier finite-geometry tests used a 10 m test wall. They proved valid geometry but missed the actual source-height clamp. Several `building=yes`, one-level sources currently resolve to a **2.60 m wall**, because the shared mapper allocates part of the inferred height to a pitched roof. `detailHeightMetres` is a cap on decoration, not a building-height override. Fascia values above 2.55 m consequently collapsed to the renderer's 0.05 m minimum.

The appearance records have now been fitted to the current rendered walls. This correction changes no source heights or footprints. Broad fascia bands retain visible height; explicit entries remain 2.05 m tall; named sign boards and text stay below the wall top and in front of overlapping panels/glass. Starbucks, 806 Chemong and Brookdale glass bounds were also adjusted to leave room below their fascia/trim. The garage's three 2.05 m panes are closed decorative service-door cues, **not vehicle-clearance measurements**.

The following values are actual rendered band heights, measured with current OSM tags, `mappedBuildingDimensions` and `createFootageFacade`:

| Facade | Source wall | Before | After | New vertical range |
|---|---:|---:|---:|---:|
| Dairy Queen fascia | 2.60 m | 0.05 m | 0.48 m | 2.08–2.56 m |
| Little Caesars fascia | 2.60 m | 0.05 m | 0.48 m | 2.08–2.56 m |
| KFC north header | 2.60 m | 0.27 m | 0.46 m | 2.10–2.56 m |
| Dental office fascia | 2.60 m | 0.05 m | 0.38 m | 2.12–2.50 m |
| Pizza Pizza fascia | 2.60 m | 0.33 m | 0.48 m | 2.08–2.56 m |
| Tim Hortons fascia | 2.60 m | 0.30 m | 0.42 m | 2.14–2.56 m |
| Bellevue garage fascia | 2.60 m | 0.05 m | 0.42 m | 2.14–2.56 m |
| Jiffy Lube fascia (Reid batch) | 2.60 m | 0.05 m | 0.42 m | 2.14–2.56 m |

Walmart's generated fallback is a separate 3.15 m shell. Its sign board previously extended to 3.525 m; it now spans 2.14–2.86 m (center 2.50 m, height 0.72 m). Its colored fallback panels also fit below 3.15 m. The successful authored GLB decoration remains at its separate 10.15 m wall scale, with the 6.85 m sign center unchanged.

The new `tests/route-source-height.test.mjs` first reproduced three failures: collapsed fascia, requested panels above the real wall, and a KFC sign board above the roof. It now passes with actual source dimensions and actual renderer geometry, including canvas-backed text-plane occlusion checks. Earlier route geometry tests now also use actual source dimensions rather than a fictional tall wall. These tests verify that the current model renders coherently; they do not establish that the inferred 2.60 m wall or roof shape matches the real building. Service-bay scale and inferred roof/storey heights remain candidates for explicit geometry correction. Cab/ground-level photo review is still required.

After the source-height correction, the focused impacted run passed 41/41 tests, the three route suites passed 17/17, and a complete `node --test tests/*.test.*` run passed 1,600/1,600 tests. No browser-rendered photo-match approval is implied by those results.

## Bounded recorded roofs in v204

The R056 house now has two small enclosed dormers and a street-parallel gable ridge. An estimated 3.25 m eave replaces its unsupported inferred high wall; the existing top elevation and footprint are unchanged. Dairy Queen gains the observed broad glazed center gable and two smaller gables within its pitched main roof. Dormer widths, projection depths, roof colors and the hidden Dairy Queen hip shape remain explicitly estimated.

`buildRecordedFrontRoof` produces one complete clipped roof surface and bounded gable/dormer wall and glass batches. It does not draw a second full roof beneath the projections. Invalid or over-budget geometry returns an empty rejected candidate before changing the source mesh. Explicit source height/roof shape/roof height/building-level tags prevent the inferred-eave adjustment. Existing roof/HVAC material classification remains separate from reviewed wall colors. Actual app-assembly tests verify finite positions, source-outline bounds, retained top elevations, complete buffer/material resolution and no commercial flattening of accepted recorded roofs. Independent code review found no blocking defect; new cab/oblique screenshots are still needed for proportion approval.
