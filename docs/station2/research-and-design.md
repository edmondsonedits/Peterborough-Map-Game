# Peterborough Fire Station 2: research and proposed build

Date: 27 October 2026. Status: the user approved the researched exterior and functional apparatus-bay scope on 27 October 2026. Blender and local game integration are implemented; verification results are recorded in game/docs/station2/README.md. Publication is outside this local build.

## Intent

Create a recognizable model of the current Fire Station 2, 100 Marina Boulevard, in Blender, and integrate it into the Peterborough Map Game City Explorer driving simulator. Priorities are walls, colours, spatial layout, bay doors, and the experience of starting in or entering a truck inside the bay and driving onto Marina Boulevard.

## Proposed approach and alternatives

Recommended: a source-grounded exterior and usable apparatus bay, with measured door sizes, photo-matched finishes, documented site arrangement, and estimated remaining dimensions recorded explicitly. Preserve unverified room layout as unresolved; do not fabricate a complete operational plan. Build native Blender source and a separate game GLB, then add gameplay behavior in the existing Three.js runtime.

Alternative: defer geometry until a dimensioned construction/as-built plan set is supplied or publicly located. This could support exact interior reconstruction, but that set has not been located and there is no known delivery date.

A generic station proxy would be faster but would not meet the user's recognition and door-detail requirements. A whole-engine migration is unnecessary for this station feature.

The user accepted this approach and instructed the team to build and test it.

## Evidence and confidence

| Source | Verified information | Limits |
| --- | --- | --- |
| City project page: https://www.connectptbo.ca/fire | New Station 2 at former Northcrest Arena site, 100 Marina Boulevard; public consultation materials | Project includes earlier design stages |
| City January 2022 design presentation: https://www.connectptbo.ca/18056/widgets/72720/documents/73419/download | Downloaded and inspected. 11 pages. Pages 4-7: site arrangement, footprint, apron/parking/landscape. Page 9: three front openings and proposed facade. Approx. 11,000 sq ft. | Early proposal, not an as-built set; no full interior plan or usable dimension schedule |
| City Council site study: https://pub-peterborough.escribemeetings.com/filestream.ashx?DocumentId=28987 | Research agent retrieved early site-study description; drive-through program and parking | Earlier 10,250 sq ft estimate; direct web retrieval returned 403 during parent inspection; not controlling dimensions |
| Contractor: https://www.jcb.ca/en/project/fire-station-no2-at-peterborough | Completed exterior and interior photos; mass timber, offices/rest/training program | Text says two truck bays; photos visibly show three front door openings. Use visible geometry and installer inventory rather than treating this wording as front-door count |
| Door installer: https://www.northerndocksystems.com/peterboroughs-first-zero-carbon-building/ | Three FF-300 four-fold doors, 14 x 14 ft each, eight insulated windows per door, masonry frame attachment. Two C-175 sectional overhead doors, 14 x 14 ft each, full-view polycarbonate sections. Front folding doors visually confirmed by JCB photographs. | Rear assignment of sectional doors inferred pending a clear rear view; nominal size does not establish finished clear width |
| Architect: https://www.unitydesignstudio.ca/news-1/city-of-peterboroughs-fire-station-no-2-grand-opening | Completed project, mass timber and reclaimed Northcrest Arena wood | No construction plan set located |
| Mass timber supplier: https://elementfive.co/projects/peterborough-fire-station-2/ | CLT/glulam and renewable energy project information | Not a dimensional survey |
| Masonry supplier: https://ixlbuild.com/featured-projects/peterborough-fire-station-no-2-built-for-response-and-net-zero-performance/ | Obsidian Shadow finish lead | Reference identity; no colour-calibrated finish measurement |
| Public construction tender: https://cityofpeterborough.bidsandtenders.ca/Module/Tenders/en/Tender/Detail/0d523f58-bebe-4f83-9b71-ed769d029dad | RFP-15-22 construction procurement | Complete drawings not freely retrieved; do not bypass bidder access |

Research agents ran 16 initial searches (88 requested results), followed by a focused door/plan search. Search-result counts are not a count of individually verified unique documents. Primary pages and downloaded City presentation were checked separately.

## Appearance to reproduce

- Tall apparatus-bay block beside lower office/living wing; broad dark roof fascia/overhang, grey masonry piers, tower element and timber-coloured accents.
- Three red four-fold front door sets, each composed of four vertical leaves and eight glazing panels. Preserve real side-folding action and hinge lines; do not animate these as roll-up doors.
- Clerestory glazing above the front doors and around the bay; black frames and careful transparency to preserve visibility from the truck.
- Bay interior: warm exposed timber roof/walls and large beams, concrete slab, drainage channel, restrained lighting and visible service features as established by photos. Props must keep the vehicle and pedestrian route clear.
- Lower wing exterior and public entrance based on completed photos. Room names are documented broadly, but their complete adjacency, dimensions and door positions are unresolved.
- Site: apron connecting to Marina Boulevard, side/rear access and parking, lawn and nearby context. Public GIS remains authoritative for streets and terrain.

Reference photographs remain research material. Create original mesh geometry/materials; do not ship credited contractor/architect photographs as textures. Record all reference URLs and copyright attribution in research notes.

## Dimensional contract

- Blender source uses metres. Documented door nominal size: 14 ft = 4.2672 m for width and height.
- Record source-derived, photo-scaled and gameplay-adjusted values separately in a parameter manifest. Do not label photo scaling as a survey.
- Anchor facade proportions to the known doors and completed photos; resolve site scale/orientation using current map geometry plus the City site plan. Do not copy approximate early area figures into exact dimensions.
- Measure the game's truck bounding box and wheel floor height before choosing spawn offsets. Nominal door width is not a clearance certificate.
- Working bay entrance must have enough usable opening for the actual in-game truck and its mirrors. If source geometry and gameplay vehicle disagree, report/resolve the mismatch rather than silently widening the station.

## Blender and runtime design

Deliver editable .blend, reproducible build script/parameter data, optimized .glb, source/assumption manifest, and visual review images. Name static building, each door leaf/pivot, sectional components, floor, spawn anchors and collision proxies consistently. Keep moving doors separate from merged static geometry. Preserve meter scale and export axis conventions explicitly.

Use a dedicated Station 2 runtime module in City Explorer. Load only near the station or when selected. Install its original visual footprint without duplicate generic building geometry. Loading failure should retain a usable existing scene and report the issue; do not leave invisible collision barriers or claim the model loaded.

Define local bay coordinates and transform visual geometry, player/truck spawn, interaction zones, collision boundaries and apron consistently from one station transform. Preserve GIS roads, terrain and existing navigation.

Proposed play flow: select Station 2; start beside the truck in the bay with the existing E-to-enter interaction, or choose a supported direct truck start. Add a clear bay-door control. Animate front leaves with correct paired hinge movement. Closed doors/walls block passage; fully open doors allow truck clearance. Prevent closing through the truck/player. Support leaving the bay, traversing the apron, reaching Marina Boulevard, returning and re-entering.

Exact keyboard/control placement and direct-spawn presentation are implementation choices unless the user specifies otherwise. Keep existing station selection and other stations working.

## Inspected integration baseline

Read-only baseline: H:\ChatGPT\Peterborough-Business-Release-1.6.129 at 90d3a4e, version 1.6.138 when inspected. Two pre-existing untracked overlap files must be preserved. Recheck upstream and concurrent changes before implementation. New project files belong under H:\ChatGPT.

- cities/peterborough/package.js: station metadata and yard/spawn positions.
- city-explorer/gameplay-systems-1.6.69.js: selected base and spawn resolution.
- city-explorer/app.js: scene setup, player/truck interaction and gameplay update.
- Existing detailed Station 1 facade creation and Station 1 hint are hardcoded in app initialization; Station 2 currently lacks a dedicated Blender building.
- Existing pumper GLB loading provides a pattern, but authored-building runtime is limited to registered assets. No functional station-door animation or building-wall collision was found.
- Source-of-truth correction from independent review: city package metadata has center 44.335719,-78.316209, truck spawn 44.335928,-78.316016 heading 202 degrees and yard 151 x 41 m rotation 65 degrees. However, City Explorer ?station=2 uses FIRE_STATION_TWO in gameplay-systems-1.6.69.js:46-62,96-101: truck 44.335785,-78.316176 heading 153.637 degrees, consumed by app.js:5064 onward. Neither is a verified bay anchor. Consolidate the applicable runtime transform and test all affected consumers; do not mistakenly treat package metadata as the active spawn.
- Portable Blender 5.2.0 LTS was executed successfully from C:\Users\Danny's Ultimate PC\Documents\Geo Guesser Peterborough\peterborough-publish-station1\tools\runtime\blender-5.2.0-windows-x64\blender.exe.

## Acceptance criteria

1. Side-by-side exterior review at street/truck eye height matches silhouette, door count, red framing, glazing, roof and wall materials in completed photos.
2. Blender and re-imported GLB agree on scale, bounds, door pivots, hierarchy and materials. Record triangle/material counts and file size; avoid per-brick/per-prop draw calls.
3. Runtime loads Station 2 without duplicate building geometry, floor discontinuities, console errors or missing asset requests.
4. Both supported spawn/entry flows place the truck inside the correct bay, facing its exit, with no wall/vehicle overlap.
5. Closed-door collision, opening sequence, fully-open clearance, obstruction handling and return drive all work for player and truck. Include side/post clipping tests rather than testing only the truck centre point.
6. Drive from bay to apron to Marina Boulevard and back. Check at truck eye height and exterior view. Preserve authoritative GIS road behavior and other stations.
7. Targeted unit/integration tests for transforms, spawn, doors and collision; browser drive-through verification and relevant existing station tests. Record observed performance with the existing scene; do not claim physical-phone performance from desktop checks.
8. Deliver local editable assets and a runnable integrated preview with known approximations listed. Publishing/uploading is a separate action requiring explicit user authorization.

## Unresolved evidence

Exact as-built footprint/elevations, complete room layout, rear facade photos/door placement, precise slab/site levels and calibrated material colours. Public evidence supports a recognizable exterior and functional bay; it does not support claiming an exact architectural digital twin.

## Independent builder review and resolved design calls

A separate Sol Medium reviewer checked the design against the runtime. The following calls are part of the proposed build:

- Establish the site/bay transform and full truck clearance before detail modeling. Treat way/1022083769 only as a possible obsolete arena proxy; its large extent is not station geometry. Any visual suppression must be tightly scoped and verified against current source evidence.
- Introduce a bounded station floor/apron height sampler that connects continuously to the GIS street. Both truck centre and wheel contacts must use the same surface. Existing gameplaySurfaceAt has no station slab support; there is no supported numerical slab datum in metadata.
- Existing player/truck movement has no building collision. Implement station-local wall/door collision using swept vehicle dimensions and door leaf geometry, with obstruction handling, coupled to successful asset installation. Test sides, rear corners and mirrors, not only centre positions.
- Truck tuning is 10.4 x 2.55 x 3.25 m with 5.65 m wheelbase; the actual GLB and attachments must be measured. Loader acceptance ranges are x=2..3.2, y=2.8..3.5, z=9..10.6 m. Nominal 4.2672 m door dimensions remain unchanged unless a real conflict is surfaced for decision.
- Building batching removes per-building visibility after ingestion. Filter only a verified replacement building ID in both GeoJSON and fallback OSM paths, retaining the centroid index where required for unrelated spatial features. Do not erase surrounding scenery with a broad radius.
- Preserve normal Station 1 appearance when selected; add station-specific model choice and correct station-specific hints. Ensure unloaded/failed Station 2 assets cannot create invisible blockers.
- Rear sectional-door placement and unobserved rooms remain explicitly approximate/deferred. Exact interior fidelity still needs additional evidence. This does not block the recommended exterior and working front-bay scope if the user chooses it.

The user authorized proceeding with documented geometry and disclosed estimates. The complete unverified interior remains unresolved rather than presented as an as-built plan.


## Final scope clarification
The user subsequently requested appearance rather than working door animation. The delivered local game holds the center front bay open and retains closed red glazing on the outer bays. Door controls are omitted. Editable door components remain in Blender.
