# Water–Hunter reference review

Base `51da803`; raw R201–R260 contact sheets plus listed originals, current OSM geometry and active facade/bridge code. No source code changed. These six fronts are ready for bounded facade work; unresolved enclosed bay geometry and applied lettering must remain explicit.

All listed frontage pairs are exact adjacent current OSM vertices. Cameras are nearest mapped road centerline, bearing clockwise from north. Use actual cab-seat views: fly altitude2.5 clamps to5m AGL. Runtime visibility/collision is not yet verified.

| Feature | Source photos | Cab review coordinate / bearing |
|---|---|---|
| `way/1006243552` Lime-fronted shop row north of 364 Water | R228 | `44.3051161, -78.3188765` / 87.7° |
| `way/1006243558` Southern cream enclosed-bay building | R231, R233 | `44.3052097, -78.3188818` / 267.7° |
| `way/1006243559` Northern cream enclosed-bay building | R231, R233 | `44.3052866, -78.3188861` / 267.7° |
| `way/1006243553` Six-arch brick shopfront on east side of Water | R232 | `44.3052323, -78.3188831` / 87.7° |
| `way/1006243555` Scotiabank Water return and Hunter corner | R235, R236, R238, R242 | `44.3057337, -78.3189114` / 87.7° |
| `way/1006243541` Smiles to You Hunter storefront | R248 | `44.3060233, -78.3172751` / 175.8° |

## way/1006243552 — Lime-fronted shop row north of 364 Water

Photos R228. Looking east; west-facing Water wall. Endpoint order south to north; photo right is t=0.

`frontLatLon`: `[{"lat": 44.3050673, "lon": -78.3187307}, {"lat": 44.3051732, "lon": -78.3187398}]`

**Observed:** Two-storey red brick with SIX narrow rectangular upper sash. Central lime shop has a blue fascia and lime framing from sidewalk to fascia around its broad window and recessed doorway. Dark shop is immediately south/right; red-and-white shop immediately north/left.

**Current gap:** Current four-column facade drops two upper sash; existing lime panel is only a .6m-high fascia stripe, while actual lime frame surrounds the full lower shop. Generic repeated retail windows do not match three distinct shops.

**Supported scope:** Existing blankFacade/groundWindows/facadePanels/entryDoor can model six upper sash and bounded lower shop fields. Keep the blue fascia and dark adjoining shop separate; omit guessed business names.

**Estimates / limits:** Lime unit occupies roughly t=.37–.72; large window near .59 and door near .42. Fractions, colors and dimensions are visual estimates; business name is not confidently legible.

## way/1006243558 — Southern cream enclosed-bay building

Photos R231, R233. Looking west; east-facing Water wall. Endpoint order south to north; photo left is t=0.

`frontLatLon`: `[{"lat": 44.3051683, "lon": -78.3190059}, {"lat": 44.3052438, "lon": -78.319009}]`

**Observed:** Cream three-storey facade, two flat sash columns on the south/left, and one enclosed polygonal bay at the north/right third repeated on both upper levels. Warm brown/golden cornice. Red central ground entry with arched transom between framed shop windows. NO open balcony or exposed railing.

**Current gap:** Current balconyLevels[1,2] and balconyWidthFraction=.84 produce open railed balconies, the wrong object. Three uniform upper columns also miss the two-flat-plus-enclosed-bay organization.

**Supported scope:** Ready now: remove balconyLevels/false balcony cue, preserve cream, dark framed storefront and red entry; existing custom windows can correct two flat sash columns. Accurate projecting enclosed bays need a dedicated bounded bay mesh/field; do not substitute an open balcony or claim flat windows complete the bay.

**Estimates / limits:** Flat upper sash centers about t=.15/.34; bay about .70–.86; red entry around .5. Bay depth, window metrics and cream/cornice colors are visual estimates.

## way/1006243559 — Northern cream enclosed-bay building

Photos R231, R233. Looking west; east-facing Water wall. Endpoint order south to north; photo left is t=0.

`frontLatLon`: `[{"lat": 44.3052438, "lon": -78.319009}, {"lat": 44.3053222, "lon": -78.3190123}]`

**Observed:** Second contiguous CREAM facade, three storeys. Two flat sash columns left/south and one stacked enclosed bay right/north, matching its southern neighbor. Nearly black storefront with broad dark fields, central recessed entry and a pale mottled base. Brick facade begins beyond its northern boundary.

**Current gap:** Current red-brick color and description are wrong for this footprint; those belong to the next building north. Current three identical upper columns omit the enclosed bay.

**Supported scope:** Ready now: cream render color, dark storefront, remove false brick identity. Preserve three wall tiers. Exact bay geometry needs the same enclosed-bay support as3558. No inferred business name.

**Estimates / limits:** Flat sash approximately t=.10/.32; enclosed bay near .78. Relative division and colors are estimated from oblique view. Narrow boundary passage at south may belong to this parcel or shared division; do not turn it into a guessed shop entrance.

## way/1006243553 — Six-arch brick shopfront on east side of Water

Photos R232. Looking east; west-facing Water wall. Endpoint order south to north; photo right is t=0.

`frontLatLon`: `[{"lat": 44.3051732, "lon": -78.3187398}, {"lat": 44.3052993, "lon": -78.3187506}]`

**Observed:** Three storeys. SIX rounded-arch upper windows and SIX rectangular middle sash, arranged as three pairs between pale vertical masonry strips. Heavy bracketed cornice. Ground has several dark shop fields and doors, not six identical storefront entrances. EAST CITY KNIFE CO is legible on the southern/right ground glazing (corrected after independent implementer recheck).

**Current gap:** Current four columns omit two windows per upper tier. It has archedWindowLevels[2], which is the appropriate tier. Uniform retail lower bays would become six if columns simply increased.

**Supported scope:** Existing six-column upper grid with archedWindowLevels[2] plus skipGroundWindows and conservative custom lower glazing. Do not create six repeated shop doors. Keep ground name off an opaque generic board unless a transparent lettering asset is supplied.

**Estimates / limits:** Upper/middle sash centers can be six evenly spaced fields; exact paired spacing and pale strip widths are estimates. Named lettering is on glass, not a solid signboard. Lower individual door positions are partly obscured.

## way/1006243555 — Scotiabank Water return and Hunter corner

Photos R235, R236, R238, R242. R235/236/238 look east at west-facing Water return; endpoint order NORTH to SOUTH, photo left is t=0. R242 looks south at north-facing Hunter frontage.

`frontLatLon`: `[{"lat": 44.3058618, "lon": -78.3187806}, {"lat": 44.3056137, "lon": -78.3187638}]`

**Observed:** Water facade has broad green-grey divided upper glazing separated by broad pale stone piers; lower glazed storefront. Large RED vertical tower is at SOUTH/right end beside the open lane. White Scotiabank letters sit on stone toward NORTH/left corner. Hunter face likewise has pale stone, grouped rectangular glazing and a separate glassier eastern portion.

**Current gap:** Current additional Water face has signText:null and no red tower; current Hunter sign is red text on a pale opaque board while source shows white applied lettering. Continuous ribbon glazing misses broad stone piers.

**Supported scope:** Ready: Water-specific red full-height facadePanel at south end, pale masonry piers, dark lower glazing. Do not accidentally copy tower to Hunter additional/primary face. Exact white applied letters need transparent text support/asset; an opaque board is not observed. Existing sign renderer only draws an opaque board, so omit a new board rather than imply exact lettering.

**Estimates / limits:** Water red tower occupies about last .16–.20 of edge (t≈.90); white lettering around northern .2–.4. Tower extends a little above main cornice, but height/width are estimates. In facade-only scope use a bounded red panel and preserve massing.

## way/1006243541 — Smiles to You Hunter storefront

Photos R248. Looking south; north-facing Hunter facade. Endpoint order west to east; photo right is t=0.

`frontLatLon`: `[{"lat": 44.3059282, "lon": -78.3173248}, {"lat": 44.3059341, "lon": -78.3172063}]`

**Observed:** One-storey red brick. One broad window, dark door at WEST/right end, and a substantial blank brick area at EAST/left. Single dark fascia; readable smiles to you, with you in turquoise. No three repeated retail bays.

**Current gap:** Current three-column retail profile and black-sign-awnings produce repeated windows/awnings; current frontage has no observed name. Does not preserve the blank eastern section.

**Supported scope:** blankFacade:true or skipGroundWindows plus one custom groundWindow, one entryDoor, one dark fascia panel; remove repeated black-sign-awnings. A single supported signText on dark board is appropriate here because source actually has a dark fascia. Standard text renderer cannot color only you turquoise; white text alone is a documented simplification or use separate asset.

**Estimates / limits:** Door near t=.12, broad window around t=.43–.48; blank eastern third. Fascia height, window dimensions, colors and text fraction are estimated; window poster is temporary and omitted.

## Corner/bridge work still being resolved

364Water1031042883: R221 is the SOUTH/Simcoe face, while R228 shows the WEST/Water return. The blue entry wraps the southwest corner, not north end of the west face. Current verticalGlazing at t=.91 on south-to-north west edge and stone pier at .73 are on the wrong end. Four exact adjacent edges are required to fully show both main faces and both short corner faces; current additionalFrontages supports only two extras. Remove the false north-end bay before attempting full wrap.

R223 red mansard/arched-door building belongs to SOUTHEAST Simcoe corner458496269, corroborated by Colliers intersection photograph, not old register NW1006243563. Pale R216/217 may be another return/volume of the samecompound458496269 footprint. This is a misassigned red face, NOT a proven two-way swap; no pale-face relocation is approved. Current code names and captions are not photo authority.

Bridge12/73 (BR60), current road ways177049271/33954231: R251/253/254 andR258/260 show plain inset solid parapets at approaches; R255/256/257 show green circular motifs in middle section. All visible lamps are slender dark posts on modest bases. Current code adds tall stone pedestal to every lamp and motifs to every panel; these are definite visual errors. Lamp pedestal removal is ready; motif transition chainages remain estimated. R257 heavier feature is a plaque/pier in railing, not evidence that every lamp has a stone shaft.

Orientation corroboration: [Colliers364Water brochure](https://images1.showcase.com/d2/2FCZe2RJXSLXo0TV-eap7NKrMB19JX-EkPnAozpJMiM/document.pdf), first two pages. Local inspected pages are `handoff/extracted/364-water-brochure-1.jpg` and`-2.jpg`. Appearance evidence remains the provided route photos.

## Nordia exact edges and constrained correction

R221/222/225 show the SOUTH/Simcoe main face with blue entry bay at its west/left end. R228 shows WEST/Water main face adjoining lime3552 at its north end; no blue bay at that northern abutment. Broker intersection panorama independently confirms blue glazing wraps the SOUTHWEST corner on both short faces. Three thin upper ribbon rows sit above a broad first-upper-level glass band and a dark ground lobby: five visible wall tiers. Temporary sale board omitted.

Primary west edge runs SOUTH to NORTH but verticalGlazing.fraction=.91 puts blue bay at NORTH end. recording-reference-appearances.js also masks a broad pier at t=.73 with text wrongly calling source left north. Main south face and the two short blue corner faces are absent. glazedLevelHeights[1]=.7 makes first upper band too thin.

Existing fields can clear verticalGlazing from west main, replace incorrectly positioned pier panel and broaden glazedLevelHeights[1]. Full geometry uses four exact adjacent edges, while createFootageFacade currently limits primary+two additional faces to three. Do not use nonadjacent SW-to-NW chord to fit all details. Four-face support or carefully scoped partial correction needed; no roof or collision change.

| Exact adjacent edge | Lat/lon endpoints | Cab review point / bearing |
|---|---|---|
| West main Water face, south to north | `[{"lat": 44.3048752, "lon": -78.3187296}, {"lat": 44.3050673, "lon": -78.3187307}]` | `44.3049672, -78.318868` /87.7° |
| West short southwest corner face, south to north | `[{"lat": 44.3048169, "lon": -78.3187263}, {"lat": 44.3048752, "lon": -78.3187296}]` | `44.3048422, -78.318861` /87.7° |
| South short southwest corner face, west to east | `[{"lat": 44.3048169, "lon": -78.3187263}, {"lat": 44.3048196, "lon": -78.3186508}]` | `44.3047338, -78.3186786` /355.2° |
| South main Simcoe face, west to east | `[{"lat": 44.3048196, "lon": -78.3186508}, {"lat": 44.3048305, "lon": -78.3183448}]` | `44.3047452, -78.3184884` /355.2° |

## Safe bridge lamp scope

All clearly visible lamps have slender dark posts rising from modest feet at parapet cap, with pale globe/lantern heads. West and east approaches have solid inset concrete parapet panels; central panels have green circular motifs. R257 has a broad plaque panel with adjacent wider parapet piers, not evidence of a stone shaft beneath every lamp.

Existing module lines366–375 adds .72m-wide concrete base,1.62m-high concrete shaft and wide concrete cap under EVERY lamp, then a short dark stem. Green motifs are also generated across every supported span.

Smallest safe lamp correction: preserve path stationing, lampMarks, globe positions, source ring, deck, sidewalk, traffic clear width and collision; remove the three concrete pedestal boxes and extend a slender dark stem down to the existing parapet top. A small dark foot on cap is supported. No bridge mesh or road geometry revision. Existing33m station spacing and globe elevation remain estimates.

Exact lamp height, spacing and motif transition chainages are not surveyed. Central motif-only range is qualitatively verified, but no exact metre interval is approved here. Do not turn panels into open holes: photos show inset decorative fields.

| Camera | Current mapped centerline | Bearing |
|---|---|---|
| westSouth | `44.3060742, -78.31605` | 180° |
| quakerNorth | `44.306081, -78.31572` | 0° |
| middleSouth | `44.3059524, -78.3148` | 180° |
| middleNorth | `44.3059524, -78.3148` | 0° |
| eastNorth | `44.3057927, -78.31382` | 0° |

## Withheld list

- way/458496269, way/1006243563 (R216, R217, R223, R224): Red mansard/arched-door facade is misassigned to NW1006243563 in old profile/register. Independent Nordia panorama places that red facade across Simcoe at SE corner458496269. This is NOT a proven two-way swap: paleR216/217 may be a different return/volume of the same compound458496269 footprint. Do not move pale wall toNW or restore either oldcornerprofile until additional matching. Withheld; no source or code move approved.
- way/995887447, way/930494669 (R202, R203, R206, R208): Robinson Place source entrance canopy is curved green roof supported by pale columns. Current simple entryCanopy box cannot capture the curve. Separate OSMroof930494669 is already mapped; avoid adding a duplicate canopy over it. Preserve footprint/open entry court; curved canopy/support audit deferred.
- way/1009651266 (R205): Five upper narrow windows plus ground shop=6visible levels. Current6level profile is consistent; old patch changing to5 would remove a level. No level change recommended.
- way/1009651262 (R201): Showplace upper centre is rectangular double window with a separate semicircular transom above. Existing fully arched opening is only an approximation. Separate transom support/asset needed; low priority, no guessed extra door.
- way/77774650 (R213, R214, R215, R218, R220): Three upper ribbon rows and dark lower service fields already broadly represented. Long compound footprint covers distinct mall faces; do not apply one facade uniformly around corners. No exact new opening layout approved.
- way/1006243554 (R232, R234): Continuous OSM edge contains lower two-storey shops and taller ornate north portion. Ornate high panels in R234 are decorative/blank, not an extra regular window tier. Current uniform seven columns need a full-width stitching/count check. Hold count and height changes; Curate name visible but exact unit fraction requires neighboring-photo registration.
- way/1005975373 (R241, R243): Pale house lies EAST of the open Hunter/WaterNE parking lot; register makes it sound like immediate corner. Its facade is partly cropped and poorly resolved. Do not fill open lot with house or infer porch openings.
- way/1006243532 (R244, R246): Dark enclosed ground glazing with pale curtains and separate side entry visible. Current front spans only one5.6m adjacent edge; next collinear2.4m edge belongs to visible frontage too. Need two-edge treatment or exact single-edge coverage before window count changes. Existing two-level brick/glass cue broadly correct; side entry/curtain geometry held.
- way/472446708 (R245, R249, R250): Mostly blank south wall has continuous narrow central dark/blue stack and low entry canopy. Current .75m discrete sash column is too narrow relative to source wall; source blue stack spans roughly14–17% of16.6m frontage. Exact row count and black lower strip need a dedicated facade layout check. Potential follow-up; current10mapped levels should not be changed from a visual guess.
- way/1005975361 (R250): Red brick house northeast of Sheridan/Hunter has pale quoins and upper porch. Source is oblique/partially cropped; full south opening layout unresolved. No new detailed frontage approved.
- way/1031894168 (R254): Quaker tall west front has THREE ground arches and broad factory glazing above. Current profile skips ground and uses four columns. Existing west/east split endpoint44.30619899258589,-78.31556 is interpolated, not an adjacent OSM vertex; full mapped south edge spans high and low wings. Current8level count also requires recheck against visible rows. Hold facade change until geometry-aware split/height layout is reconciled. No blind three-arches-across-whole-factory placement.

## Open spaces to preserve

- Robinson Place recessed Water entry court — way/995887447, way/930494669 (R202, R203): Open paved forecourt beneath curved canopy and pale columns; keep entrance court open. Preservation context; do not infer drivable clearance from photo.
- East Water open lawn/parking access north of Charlotte — way/458496270 (R210, R212): Broad grass slope, trees, hydrant and municipal parking access/sign visible; main cinema facade not resolved. Current cinema compound footprint is large/set back and map-derived roof/terrain relation requires runtime check. Preserve visible open lawn/access; no speculative facade/blanketgroundfill from caption.
- Northeast Hunter/Water corner — 10/360, way/1005975373 (R241, R243): Broad paved open parking lot with short grass curb strip, a few cars and signs. Pale house starts east of lot; separate tall rear blank building stands north. Municipal parking10/360 identifies lot; no building infill or uniformlawnfill.
- Scotiabank southern lane gap — way/1006243555, 10/1004 (R234, R235): Open narrow paved gap betweenbankredtower andornate brickshopnorthend; large mural on shopsidewall visible. Keep lane open; mural identity/asset outside current facade batch.
- Churchill/Sheridan northwest corner — way/472446708 (R249, R250): Open lawn, broad sidewalk and entrywalk below blank apartment end; trees partly obscure lower face. Preserve setback; no widened facade or fabricated frontage tostreet.
- Hunter bridge river/open views — 12/73 (R251, R253, R255, R258, R260): Open river/trees beyond parapets. Keep existing deck/sidewalk/road clearance during lamp appearance work. No opaque wall raised above current parapetheight.

## Route-order audit

| Photos | Area | Corner disposition |
|---|---|---|
| R201–R208 | Water approach/Charlotte | SW tower1266: sixvisiblelevels preserved; SE RobinsonPlace447: green glazing/curvedcanopy; NW mall77774650 andNE cinema458496270 remain compound/setback contexts. |
| R209–R227 | Water toSimcoe | NE Nordia1031042883 faceorientationcorrected; SE458496269 andNW3563 redfaceassignmentwithheld; SW77774650 returnnotnewlysigned. |
| R228–R243 | Water shoprow/Hunter | Six ready row/business fronts. HunterSE bank3555 ready; NE parking10/360 preserved; NW office7949/7950 andSW Commerce3562 no new detailed layout approved. |
| R244–R250 | Hunter west/Sheridan | Smiles3541 ready; pub3532,Churchill472446708 andhouse5361 held for exactcoverage/count. |
| R251–R260 | Hunter bridge | Lamp pedestal correction ready; approach/centralmotif zoning andQuaker3arches held. Easternexit beyondaboutlon-78.3134 reviewed separately byreid_reference. |

## Inspection limits

AllR201–260 reviewed on contact sheets; only listedoriginals individuallyinspected. Candidate facts cite originals. No currentgame renderapproved. Simcoe redface finding is not a two-way swap. R232KNIFECO transcription corrected after independent review.
