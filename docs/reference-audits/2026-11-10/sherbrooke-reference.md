# Sherbrooke R133–R200 reference review

Read-only source review against candidate `e3986c3`, current OSM rings, active profile composition, original R133–R200 photos and the old patch. These eight can proceed with bounded facade edits; no roof edits. Heights, colours and fractions remain visual estimates. Game screenshots have not yet been reviewed.

All frontage pairs below are exact adjacent current OSM vertices. Cameras are projected onto mapped Sherbrooke centreline and look toward facade midpoints; runtime drivable/collision/occlusion status is unverified. Bearing is degrees clockwise from north. Requested eye is2.5m, but QA reports fly mode clamps this to5m AGL; genuine cab/driver-height screenshots must use the actual driver camera.

| Feature | Photos | Camera lat,lon / bearing |
|---|---|---|
| `way/1006594206` Dominion frontage, Rubidge NW | R137 | `44.3004911, -78.326638` / 355.8° |
| `way/1006575786` Laundromat, Rubidge SE | R138 | `44.3005075, -78.3262398` / 176.4° |
| `way/1006575766` Pale sidewall, Stewart SW | R141 | `44.3005437, -78.3254416` / 176.4° |
| `way/1006594188` Pale gable-end house, Stewart NW | R142 | `44.3005407, -78.3255083` / 356.4° |
| `way/1006575767` Low red-brick house, Stewart SE | R143, R144 | `44.3005618, -78.3250665` / 176.0° |
| `way/1006594168` Thrive Health storefront west of Aylmer | R157, R158 | `44.3006331, -78.3236848` / 356.0° |
| `way/1006575755` Arched brick block, Aylmer SW | R159, R161, R162, R164 | `44.3006549, -78.3232469` / 176.0° |
| `way/755554888` No Frills separate eastern loading return | R190 | `44.3008214, -78.3189883` / 177.0° |

## way/1006594206 — Dominion frontage, Rubidge NW

Photos: R137. Looking approximately north; south-facing Sherbrooke wall.

`frontLatLon`: `[{"lat": 44.3005673, "lon": -78.3267573}, {"lat": 44.3005774, "lon": -78.3265354}]`

**Observed:** Pale two-storey masonry; three narrow dark-edged upper sash. Tall dark storefront glass with pale piers occupies the eastern/right two-thirds; black fascia with white DOMINION LENDING wording. West ground portion is mostly blank.

**Current gap:** No dedicated current photo profile; generic building rendering. Old patch would populate the west blank ground with retail windows.

**Implementation:** Existing skipGroundWindows plus custom groundWindows, upper grid/overrides and facadePanels suffice. Do not invent an entrance. Sign text DOMINION LENDING is fully legible; end of CENTR… is cropped.

**Estimates / limits:** Upper centres roughly t=.27/.45/.66; eastern storefront t≈.35–1; dimensions/colours are visual estimates. Avoid repeating three storefront bays across whole width.

## way/1006575786 — Laundromat, Rubidge SE

Photos: R138. Looking approximately south; north-facing Sherbrooke wall. Photo right = map west/t=0.

`frontLatLon`: `[{"lat": 44.3004242, "lon": -78.3263008}, {"lat": 44.3004312, "lon": -78.3261648}]`

**Observed:** Grey horizontal siding, three dark upper sash, pale projecting west shop bay, red LAUNDROMAT fascia with pale lettering, large west ground window. Shadowed shop door at west end and separate pale door at east end.

**Current gap:** No dedicated current photo profile.

**Implementation:** Existing skipGroundWindows, groundWindows, entryDoor and facadePanels. Main shop window/sign belong toward t≈.25, not centre/east. Can depict second east door as a simple pale panel; a second entryDoor object is not supported.

**Estimates / limits:** Wall dimensions, upper spacing and bay projection are estimates; source shows readable LAUNDROMAT and COIN WASH. Leave small schedule text out.

## way/1006575766 — Pale sidewall, Stewart SW

Photos: R141. Looking south; north-facing Sherbrooke SIDE wall.

`frontLatLon`: `[{"lat": 44.3004602, "lon": -78.325474}, {"lat": 44.3004643, "lon": -78.3253949}]`

**Observed:** Pale painted masonry, dark green eave, exactly two white-framed upper rectangular windows; ground wall blank. Lower rear/side addition visible to west, black fence behind.

**Current gap:** No dedicated current photo profile. Default house/office facade would add unsupported ground doors/windows.

**Implementation:** blankFacade:true, entryDoor:null, two custom groundWindows placed at upper elevation; eave facadePanel. No roof change and no porch on this side.

**Estimates / limits:** t≈.30/.70; window dimensions and bottom elevation estimated. Only these two wall openings are supported.

## way/1006594188 — Pale gable-end house, Stewart NW

Photos: R142. Looking north; south-facing Sherbrooke SIDE/gable wall.

`frontLatLon`: `[{"lat": 44.3006282, "lon": -78.3256001}, {"lat": 44.3006358, "lon": -78.3254326}]`

**Observed:** Pale grey horizontal siding; two larger lower windows, two upper windows, a tiny upper opening just west of central chimney; narrow warm-grey chimney divides the facade. No street-facing door.

**Current gap:** No dedicated current photo profile. Old patch omitted the tiny fifth opening.

**Implementation:** blankFacade:true, entryDoor:null, custom groundWindows (four main plus one small) and narrow vertical facadePanel. Actual projecting chimney/roof gable retained as known geometry gap; no roof work this batch.

**Estimates / limits:** Main centres t≈.24/.73, tiny opening t≈.41, chimney t≈.52; width/heights estimates.

## way/1006575767 — Low red-brick house, Stewart SE

Photos: R143, R144. R143 looks SW across Stewart; R144 looks S/SW at north-facing Sherbrooke front.

`frontLatLon`: `[{"lat": 44.3004521, "lon": -78.3251287}, {"lat": 44.3004595, "lon": -78.3249834}]`

**Observed:** One principal wall storey of red brick; two windows flank central DOOR; shallow arched heads, dark hipped roof, one small front dormer, garden setback.

**Current gap:** No dedicated current photo profile. Old patch incorrectly makes three arched windows. R144 repeats this corner house at photo right; do not attach it to next parcel5662.

**Implementation:** levels:1 with two custom/override windows, entryDoor at centre; skip central window. Existing arched window overrides can depict window heads. Exact arched door head and dormer are omitted in this no-roof batch.

**Estimates / limits:** Left/right window centres approximately .18/.82; door .5; dimensions/roof pitch estimates. Do not infer a second wall storey.

## way/1006594168 — Thrive Health storefront west of Aylmer

Photos: R157, R158. Looking north; south-facing end facade; NOT the immediate NW intersection corner.

`frontLatLon`: `[{"lat": 44.3007347, "lon": -78.3237849}, {"lat": 44.3007443, "lon": -78.3236052}]`

**Observed:** Two very tall glass fields separated by broad grey central pier, grey perimeter, fine dark mullions, large white THRIVE HEALTH and smaller PTBO lettering on glass; green tree-shaped lower screening. Parking is open on both sides.

**Current gap:** No dedicated current photo profile. Old patch incorrectly contains signBusinessName PJ's Diner and makes a shallow sign board over glass.

**Implementation:** Existing glazing/custom windows plus grey central/perimeter panels and green lower panels give a supported approximation. Omit sign board: real lettering has no separate opaque plaque. Exact transparent text/tree silhouette requires dedicated asset/renderer support.

**Estimates / limits:** Centre pier fraction≈.50, width≈.06; green band about lower third; facade height/mullion spacing estimated. Keep immediately east parking parcel open.

## way/1006575755 — Arched brick block, Aylmer SW

Photos: R159, R161, R162, R164. Looking south/SW; north-facing Sherbrooke end; Aylmer to east/photo left.

`frontLatLon`: `[{"lat": 44.3005471, "lon": -78.3233108}, {"lat": 44.3005534, "lon": -78.3231628}]`

**Observed:** Red brick, two tall upper arched dark openings with pale sills/keystones, two substantial lower rectangular/glass-block fields, grey stone/concrete base, flat/parapet top. No front entry visible.

**Current gap:** No dedicated current photo profile. Old patch's small .85×.91m lower windows undersize visible fields; do not add automatic centre office entry.

**Implementation:** levels:2/windowColumns:2 with two arched upper overrides; skipGroundWindows and two custom lower windows; entryDoor:null; plinth. Thin parapet panel supported.

**Estimates / limits:** Opening centres roughly .25/.75. Lower opening widths around1.6–2m and heights1.6–2m are visual estimates, not measured. Preserve blank mass between openings.

## way/755554888 — No Frills separate eastern loading return

Photos: R190. Looking south/SW; north-facing recessed east return, east of the existing yellow sign facade.

`frontLatLon`: `[{"lat": 44.3006452, "lon": -78.3191107}, {"lat": 44.3006562, "lon": -78.3188414}]`

**Observed:** Long dark/black recessed loading aperture beneath pale corrugated fascia; pale side piers; high concrete retaining edge across foreground. Separate from yellow NO FRILLS west facade.

**Current gap:** Current profile/photo asset only describes western yellow sign-bearing edge; east return is unmodeled pale blank wall.

**Implementation:** Add additionalFrontages using this exact edge with blankFacade and dark rectangle/fascia panels. Set signText:null and facadePanels explicitly to avoid inheriting yellow panel; omit facadePhoto so west badge is not duplicated. Do not infer drivable opening/collision from dark pixels.

**Estimates / limits:** Dark aperture occupies roughly central90% width and lower half/upper-middle wall; exact dimensions, recess depth and retaining-wall position are estimated. Ground context separate from facade.


## Mapping corrections that block wholesale patch restoration

- **R134 office4116:** photograph is the south/Sherbrooke elevation; old edge points west/Reid. South frontage is two consecutive collinear OSM edges, listed below.
- **R135 hall:** western8.92m section has three smaller upper arches/two basement windows. Eastern18m section has larger arches and is cropped. Five equal arches on the east edge are unsupported.
- **R140 retirement:** old front edge points west/Rubidge. Photograph faces the main south edge; two full tiers plus raised basement, six upper sash, lower east wing. Three uniform rows over whole complex is wrong.
- **R144 parcel shift:** current west→east order is5767 low dormer corner →5662 white-porch/two-upper-sash →5663 green metal hip roof →5770 partly treed brick/porch section →5768 gable/attic sash →5769 enclosed white corner porch. R143 andR144 repeat corner5767. Do not attach low-house cues to5662 or green roof to5770.
- **R145 StewartNE4187:** register6.15m edge is just the projecting entry. The west and east shoulders lie behind it. It cannot carry whole-building3-storey window rows.

## Four-corner checks

| Junction | NW | NE | SW | SE |
|---|---|---|---|---|
| Rubidge/Sherbrooke |4206 Dominion, ready|194193065 retirement, corrected south edge; complex mass held|749414219 hall, separate unequal arch groups; full restore held|5786 laundry, ready|
| Stewart/Sherbrooke |4188 gable side, ready|4187 brown brick entry/shoulders, full restore held|5766 pale blank side/two upper windows, ready|5767 low brick/two windows+door, ready|
| Bethune/Sherbrooke |4095 red brick corner house (not infirst8)|open paved corner/Thrive west lot; no corner building|5769 enclosed white-porch brick corner|fenced/overgrown open frontage; no street-edge building|
| Aylmer/Sherbrooke |open parking1529217779; Thrive4168 is farther west|1251 RoyalLePage, existing south profile but west glazing underrepresented|5755 arched brick block, ready|5745 low brick broad porch, already explicit profile|

All abbreviated house IDs above mean`way/100657…` or`way/100659…` as given in the JSON; do not create a new identity from this abbreviation.

## Four further bounded candidates — exact edges, constraints retained

### way/1006594116 — Low office at Reid/Sherbrooke NE

PhotosR134, R136; R134 north, R136 northwest; south-facing frontage.

`frontLatLon`: `[{"lat": 44.3005567, "lon": -78.3273241}, {"lat": 44.3005641, "lon": -78.3271608}]`

Additional adjacent edge: `[{"lat": 44.3005641, "lon": -78.3271608}, {"lat": 44.3005699, "lon": -78.3270325}]`

**Observed:** South-facing Sherbrooke side has low taupe/pale horizontal siding, cream lower band, dark roof, several modest rectangular windows, shrubs/tree masking centre. Lawn and pale ramp are west toward Reid.

**Gap:** No photo profile. Register/old patch incorrectly places all Sherbrooke-side openings on the west/Reid wall. Old six-window count cannot be independently verified through the tree.

**Supported scope / constraint:** Existing panels/plinth and a small conservative selection of visible windows; additionalFrontages can cover the two collinear adjacent south edges. Safe colour/plinth subset possible; do not restore six equally spaced windows. No roof edit.

**Estimates:** Metric dimensions, exact window fractions and ramp extent unresolved. Sign wording too blurred to reconstruct from R134.

### way/749414219 — Hall west of Rubidge

PhotosR135; Looking south; north-facing wall. Image right is WEST.

`frontLatLon`: `[{"lat": 44.3003934, "lon": -78.3269246}, {"lat": 44.3003972, "lon": -78.326813}]`

Additional adjacent edge: `[{"lat": 44.3003866, "lon": -78.3268121}, {"lat": 44.3003965, "lon": -78.326587}]`

**Observed:** Red masonry, broad rough-stone raised basement, dark hipped roof. WEST 8.92m street section has three small upper arches and two lower rectangular basement openings. Longer EAST 18m section shows at least two much larger upper arches; farther east is cropped. All Saints is visible on small west-section sign.

**Gap:** No photo profile. Old patch puts five equal arches on the east edge only. OSM tags building:levels=1; generic mapped mass is too low for a generous raised basement plus large main hall windows, so facade-only heights may be clipped.

**Supported scope / constraint:** Two different face records can express the observed groups. Existing custom upper overrides permit three equal small arches on WEST face; conservative tall arches on east require independently bounded placement/count. No new generic arch renderer is needed, but root no-roof/no-massing pass cannot claim full silhouette fidelity.

**Estimates:** Total hall window count east of crop, actual eave height and stone-course dimensions not measured. Three small west arches/two basement windows are high confidence.

### way/194193065 — Rubidge retirement block, NE corner

PhotosR140, R142; Looking north; south-facing Sherbrooke main front.

`frontLatLon`: `[{"lat": 44.300601, "lon": -78.3261907}, {"lat": 44.3006116, "lon": -78.325946}]`

Additional adjacent edge: `[{"lat": 44.3006161, "lon": -78.3259463}, {"lat": 44.3006261, "lon": -78.3257381}]`

**Observed:** Main south-facing tan masonry block has two full window tiers above raised basement and a large west portion gable. SIX upper sash: four beneath gabled/stepped portion then two to east; lower arrangement differs, with pale door beneath the first east-upper sash. Separate eastern lower pale wing has two short horizontal opening tiers.

**Gap:** No photo profile. Register/patch points to west/Rubidge face and asks for three equal rows/five columns. Uniform whole-footprint mass also ignores low east wing.

**Supported scope / constraint:** Correct south edge can receive a two-tier conservative facade via windowOverrides/groundWindows; additionalFrontages can describe lower east wing only after mass/height treatment is settled. Existing massing zones flatten roofs; existing whole-footprint gable cannot correctly make this local historic gable plus low wing. Do not turn the entire complex into one gabled roof. No roof/massing edits in current pass.

**Estimates:** Main front≈19.56m and low-wing front≈16.65m are mapped edge lengths. Storey/roof heights, gable width and all opening dimensions are estimates. OSM3levels does not mean three equal full window rows on the photographed south facade.

### way/1009651246 — Lower Water long commercial south facade

PhotosR189, R191; North to northeast across Sherbrooke; south-facing wall, right return faces Water.

`frontLatLon`: `[{"lat": 44.3010073, "lon": -78.3195694}, {"lat": 44.3010265, "lon": -78.3191161}]`

**Observed:** Single-level flat-roof building with charcoal upper panels, pale mottled stone lower wall, light-framed paired windows separated by dark panels, a stone-framed entrance, pale thin roof edge. Black open vertical rail fence with stone piers stands in front across its paved forecourt.

**Gap:** Existing profile only details short EAST/Water edge using3columns. Corridor appearance adds0.8m plinth, but long36.24m SOUTH/Sherbrooke edge remains missing.

**Supported scope / constraint:** An additional south face with custom windows/panels is supported. Do not copy3-column Water layout over36m. Full leftmost window group is cropped; preserve observed paired rhythm conservatively. Fence/piers are ground-context geometry, cannot be faked with wall panels without wrong location.

**Estimates:** Window widths/spacing and fence offset are estimates; full count partly cropped. Business wordmark unreadable in supplied pixels; use unnamed commercial descriptor, not caption tenant identity.

### Stewart NE exact entry/shoulder edges

Entry: `[44.3007293,-78.325042]→[44.3007328,-78.3249651]`. West shoulder: `[44.3007453,-78.3250925]→[44.3007475,-78.3250436]`. East shoulder: `[44.300751,-78.3249667]→[44.3007531,-78.3249201]`. All pairs are adjacent current OSM vertices. R145 supports small pale-trim openings and the dark double entry, not a repeated grid on the little entry face.

## Open spaces to preserve

| Photo | Exact current source/context | Verified cue and limit |
|---|---|---|
|R155,R157|OSMparking1529217778; officialparking10/1241; aisle827171390|Open paved lot west of Thrive/Bethune NE. Buses are transient; no invented building.|
|R160,R163,R165|OSMparking1529217779; officialparking10/1701; aisle827171387|AylmerNW is open parking, low concrete edge blocks and grass margin. Kingsford is well behind; Thrive west. No opaque tall wall.|
|R153,R156|Approx44.30048,-78.32386; no foreground OSMbuilding ring|BethuneSE wooden fence/creepers, rear structures set back. Fence path not surveyed.|
|R174|Officialparking10/454; adjacent LCBO194192530|Station1 east open apron/lot; preserve access and reviewed station facade.|
|R176|Officialparking10/449 and10/453|Large northside parking west of GoodNeighbours, white bay lines and narrow sidewalk grass strip. Do not fill foreground from distant buildings.|

The current code already renders officialparking_surfaces as parking pavement. The photo review establishes missing potential edge/line details, **not proof that the mapped lot is absent from the current game**. Runtime screenshots are still required.

## Later route observations kept separate

- R166 RoyalLePage1251 has large reflective glazing on the Aylmer/WEST wall; base profile only covers south. Old extra west edge is an exact current edge and the observed broad grid is plausible, but a full crop/count review is outside first8.
- R172–173 Westland5741 lower front addition has two tall narrow pale window grids and a dark fascia, with readable Westland on the east/right board. Existing house-only front repeats upper architecture down over addition. Needs low-front/high-rear massing-aware treatment, not just generic three columns.
- R177 GoodNeighbours1239 has two visible levels, olive/gray masonry, dark base and a long side wall; current profile already reduced to2levels. Keep eastern drive open.
- R180 Knotanew5731 has irregular upper small windows and mixed storefront doors/windows beneath a continuous pale band; current7equal columns simplify these. Can improve later with individual custom openings; no complete count asserted through tree.
- R184 Village of Thai mural and R169/R171 Station1 already have separately reviewed frontages; preserve them.
- R192 Harvey755554892 lettering is RED on CHARCOAL fascia, orange north/left tower. Current sign is WHITE on RED board. Clear future colour/sign correction; exact tower projection/height not established.
- R195 ribbon office1260 already has three glazed levels; R198 Turner1259 already has5-level profile. Neither is a priority for new guessed detail.

## Verification boundary

All R133–R200 contact sheets were reviewed; listed candidate cues were checked in original680px photos (with crops for small features), not accepted from captions. Every selected building edge in JSON/GeoJSON is asserted against consecutive current OSM vertices. Active base+recording+route profile composition was inspected: the first seven ready IDs have no dedicated profile at e3986c3; NoFrills has only its different western face. This is evidence/code-gap review, not final rendered approval. Root may merge later code independently. No source-code edits made.
