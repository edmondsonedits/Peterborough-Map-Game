# Chemong archive-to-map evidence review

Independent R001–R068 archive-to-active-map review; first implementation bounded through Mason

Current game visuals remain unverified until QA screenshots are reviewed.

## Decisions that change the old patch

- R059 pale gable has one centered visible upper window, not generic two-column upper row.
- Twin-dormer R056 front is roof slope, while R059 front is gable end.
- R033/R035 business sign wording cannot independently validate exact dental tenant text.
- R061 confirms Mason corner sides/materials; detailed Chemong-front patterns remain unverified.
- DQ R051 roof/gables are major silhouette cues absent from a plain fascia-only treatment.
- Ultramar canopy is open; solid building/collision representation would be incorrect.

## Feature ledger

### 10/1429 — Walmart lot paint and islands

Photos: R008, R012, R014.

southwest of Walmart footprint.

**Visible:** Broad asphalt lot with faded yellow/cream angled stall divisions. R012 directly shows one nearby planted island with deciduous tree, pale curbed edge and brown planted/mulched surface.

**Match:** Walmart building visible in same views. Current parking_surfaces feature 10/1429 wraps corresponding lot and contains mapped island openings.

**Estimates/limits:** Exact observed island-to-hole correspondence not independently proven. Additional trees should be labeled map-backed/inferred, not all directly photo-confirmed. Keep paint clipped to mapped pavement, out of driving aisles/islands.

### way/176908280 — Walmart Supercentre

Photos: R008, R012, R014.

east side of Chemong; photographed from its southwest lot.

**Visible:** Broad dark-blue front wall across a large marked asphalt lot. White Walmart wordmark visible on blue frontage. Long pale/cream wall return to image right/south.

**Match:** Named Walmart façade and large footprint/lot. Lot-to-exit sequence reaches photographed Walmart directory opposite Shoppers.

Mapped main-facade outward bearing: 237.4° clockwise from north.

**Estimates/limits:** Entry glazing and door count are distant and not resolved. Do not duplicate detailed entrance bays based on this archive alone. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### walmart-driveway — Walmart exit directory

Photos: R017, R019, R020, R022, R024, R026.

east side of Chemong at Walmart exit; Shoppers across road.

**Visible:** Two blue upright posts. Top blue Walmart Supercentre panel; middle Pickup/Pharmacy bands; lower red McDonald’s band. Wood fence and evergreens behind; lawn mound between directory and curb.

**Match:** Legible Walmart tenant directory. Same intersection shows Shoppers across Chemong and access-to-left-turn sequence.

**Estimates/limits:** Point 44.323102,-78.335018 is a prior context estimate, not a surveyed exact post center. Roadside object placement/depth/heading requires dedicated pavement clearance QA.

### way/755556771 — Starbucks, 959 Chemong Road

Photos: R026, R028.

west side of Chemong, south of Shoppers.

**Visible:** Single-storey rectangular coffee shop with tall dark front fascia. White STARBUCKS COFFEE text, broad tall glass below. Pale return wall at image right/north in R026.

**Match:** Readable Starbucks sign plus matching named OSM footprint. Immediately south of Shoppers across the same access/parking gap, shown together in R026.

Mapped main-facade outward bearing: 57.7° clockwise from north.

**Estimates/limits:** Exact glass subdivisions and entrance fraction are estimates. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/176908281 — Shoppers Drug Mart, 971 Chemong Road

Photos: R019, R026.

west side of Chemong, north of Starbucks.

**Visible:** Raised red central sign/entrance fascia with white SHOPPERS DRUG MART lettering. Red uprights flank tall glazed entry. Pale single-storey walls continue either side.

**Match:** Readable named sign plus named OSM footprint. Opposite Walmart exit, north of Starbucks in same R026 frame.

Mapped main-facade outward bearing: 55.5° clockwise from north.

**Estimates/limits:** Red sign width, entry glazing dimensions, and post widths are estimates. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446343896 — Chemong Family Dentistry

Photos: R033, R035.

east side of Chemong; southeast corner at Sunset.

**Visible:** Low flat-roof pale masonry building on south side of Sunset. Dark base/trim and narrow green-gray windows separated by pale piers. Pale fascia with separate small left text/logo and larger blue center/right logo/text. Clipped low hedge and lawn between sidewalk and building.

**Match:** Sunset intersection and open landscaped north corner in R033. Continuous movement to broad façade view in R035, matching lone southeast-corner low footprint.

Mapped main-facade outward bearing: 234.7° clockwise from north.

**Estimates/limits:** Exact business wording is NOT reliably readable in these 680px archive views. Historical register label Chemong Family Dentistry does not validate recreating that exact current tenant wording. Use unnamed pale fascia; center/right blue logo text is insufficient to spell without corroboration. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/383393878 — Pizza Pizza and Tim Hortons

Photos: R037, R038.

west side of Chemong, southwest of Highland; two distinct mapped front edges.

**Visible:** One-storey storefront pair, dark charcoal broad fascia and glazing. Pizza Pizza red panel at image left/south. Tim Hortons red lettering at image right/north with pale strip over its glazing. Parking forecourt with separate tall pylon.

**Match:** Both named signs readable. South of Highland on west side; separate Brookdale row visible behind/south in R038.

Mapped main-facade outward bearing: 31.6° clockwise from north.

**Estimates/limits:** Do not spread one tenant across both front edges. Pylon exact location/height not verified by façade geometry. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446339023 — Bellevue Ultramar canopy

Photos: R041, R043, R045, R047, R049.

east side of Chemong; north side of Bellevue.

**Visible:** OPEN canopy over fuel pumps, pale square columns. Dark navy fascia with cyan/light blue edge and white Ultramar text. Separate tall blue pylon on forecourt south side.

**Match:** Readable Ultramar canopy and pylon. At northeast Bellevue corner, opposite broad Brookdale parking lot.

Mapped main-facade outward bearing: 234.6° clockwise from north.

**Estimates/limits:** Must remain open under canopy, not solid building volume. Canopy collision/openness requires dedicated runtime verification; defer if generic shell cannot satisfy. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446339024 — Garage behind Bellevue Ultramar

Photos: R041, R043, R045.

behind/east of Ultramar canopy.

**Visible:** Low pale/gray service building behind fuel canopy. THREE dark glazed service doors, pale posts between. Dark flat fascia over doors; small upper logo/text not transcribed.

**Match:** Behind confirmed Ultramar canopy on same parcel. Unique adjacent mapped service footprint, three doors align across oblique southwest-facing long edge.

Mapped main-facade outward bearing: 218.8° clockwise from north.

**Estimates/limits:** Door heights, widths and spacing are estimated from perspective. Specific garage business name unverified. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/77717331 — Brookdale Plaza

Photos: R038, R040, R048, R050, R052, R054.

west side of Chemong, two long east/northeast-facing segments.

**Visible:** Long continuous one-storey retail row behind broad parking area. Pale fascia, dark glazing and many storefront bays. Bright yellow-green DOLLARAMA text toward north/right end in R038/R048. A distinct blue portal/tower lies to its south/left.

**Match:** Named Brookdale OSM footprint matches very long angled/offset retail row. Opposite Bellevue/Ultramar intersection with Pizza/Tim separate immediately north.

Mapped main-facade outward bearing: 55.1° clockwise from north.

**Estimates/limits:** Exact Dollarama fraction on mapped wall is not verified; photo right edge cropped. Do not add generic tenant names or repeat same sign across the whole row. Individual bay count/width are approximate. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446339099 — Dairy Queen, 828 Chemong Road

Photos: R051, R053.

east side of Chemong, north side of Bennet.

**Visible:** Brown pitched main roof, prominent large triangular glazed central front gable. Two smaller cream-trimmed front gables carrying small DQ marks. Long dark glazing at front beneath pale framing. DQ pylon north/left of Bennet is clear in R053.

**Match:** Readable DQ pylon with distinctive building roof. North side of Bennet across from Little Caesars shown simultaneously in R053.

Mapped main-facade outward bearing: 235.5° clockwise from north.

**Estimates/limits:** Main roof appears hipped/pitched; unseen roof topology not fully proven. A plain flat fascia alone omits the strongest visible silhouette. Gable sizes and exact window divisions remain estimated. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446343895 — Little Caesars, 816 Chemong Road

Photos: R053.

east side of Chemong, south side of Bennet.

**Visible:** Small single-storey pale masonry building with charcoal fascia. Orange Little Caesars letters above broad glazing. Pale north return facing Bennet; paved front/side apron. Separate pylon ahead of façade.

**Match:** Readable sign and mapped named footprint. South of Bennet opposite confirmed DQ in the same photo.

Mapped main-facade outward bearing: 235.1° clockwise from north.

**Estimates/limits:** Entrance fraction and detailed glazing divisions estimated. Pylon placement not verified for this façade-only batch. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/176910551 — 806 Chemong Road storefronts

Photos: R055.

east side of Chemong, north side of Wolsely.

**Visible:** Low flat-roof retail strip, pale parapet/piers. Four broad dark/glazed bays between pale rectangular posts. Multiple dark sign panels; names too small to verify.

**Match:** East side immediately north of Wolsely signals. Between Little Caesars and confirmed KFC along route, matching unique wide mapped retail rectangle.

Mapped main-facade outward bearing: 234.7° clockwise from north.

**Estimates/limits:** Tenant wording unverified. Exact bay widths and openings estimated. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/1002815290 — White twin-dormer house south of Wolsely

Photos: R056, R058.

west side of Chemong, southwest of Wolsely.

**Visible:** Cream/pale horizontal siding, dark steep gable roof with TWO front dormers. Main front ground floor has paired green-shuttered windows either side of near-centered entry. Roof slope faces Chemong; main ridge runs parallel to façade. Driveway at photo right/north; neighbouring red-brick house lies photo left/south.

**Match:** First west-side house south of Wolsely, opposite KFC at same timestamp. Distinctive twin dormer house reappears north/right beside red-brick next house in R058.

Mapped main-facade outward bearing: 56.6° clockwise from north.

**Estimates/limits:** Dormer/roof heights and shutter dimensions estimated. Do not model as front-facing main gable end; dormers face street on roof slope. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446366842 — KFC, 786 Chemong Road

Photos: R055, R057.

east side of Chemong, southeast of Wolsely.

**Visible:** Low pale flat fascia with dark wide front glazing. Red vertical entry accent and portrait panel north/left. Red KFC lettering south/right. Grass verge and separate red KFC roadside pylon.

**Match:** Readable KFC lettering and pylon, matching named OSM footprint. East side immediately south of Wolsely, opposite twin-dormer house at same timestamp.

Mapped main-facade outward bearing: 235.0° clockwise from north.

**Estimates/limits:** Sign width/height, portrait treatment, and entrance fraction estimated. Roadside pylon deferred unless mapped placement separately tested. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/1002815291 — Red brick house south of the dormers

Photos: R056, R058.

west side of Chemong, next house south of 1002815290.

**Visible:** Two-storey red-brick front with pale window trim. Two upper windows visible; reddish roof/canopy bands. Low white wing lies image left/south; tall evergreen partially obscures image right/north.

**Match:** Immediately south of confirmed twin-dormer house, shown together in R058. Mapped next west-side detached footprint before Aberdeen matches width/setback/order.

Mapped main-facade outward bearing: 56.6° clockwise from north.

**Estimates/limits:** Low white wing extends beyond simple main OSM rectangle; do not fabricate its footprint. Exact roof shape and porch depth remain uncertain. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/1002815295 — Pale gable between Aberdeen and Mason

Photos: R059.

west side of Chemong, between Aberdeen and Mason.

**Visible:** Pale-sided steep front gable end above tall hedge. ONE small centered upper/gable window visibly readable. Lower wall/openings largely hidden; reddish entrance partly seen through planting.

**Match:** House immediately south of Aberdeen on west side, after red/dormer pair. Nearer/north of Mason corner pair, with mapped detached footprint and gaps matching sequence.

Mapped main-facade outward bearing: 57.3° clockwise from north.

**Estimates/limits:** Do not infer two-column upper windows from old patch default. Front is gable END facing Chemong; ridge perpendicular to façade. Door fraction and ground openings unverified behind hedge. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/1002815296 — Red brick house at Mason

Photos: R059, R061.

west side Chemong, north side Mason; R061 mostly side elevation across Mason.

**Visible:** Corner house shows red-brick main portion, pale siding/return, white trim and gray gable roof. Garden/retaining edge along north/right side of Mason view.

**Match:** Nearest house on north/right of westward Mason view R061. Current mapped northwest-corner footprint and preceding pale gable order agree.

Mapped main-facade outward bearing: 57.3° clockwise from north.

**Estimates/limits:** R061 does not resolve Chemong-facing front opening rhythm. Old porch dimensions and default window pattern are unverified; material/roof only is conservative. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/1002815324 — Cream house across Mason

Photos: R061.

west side Chemong, south side Mason; R061 mostly north side elevation.

**Visible:** Cream/light siding, steep gray roof and tall red-brick chimney. Small rectangular dark sashes, lawn edge on south/left side of Mason view.

**Match:** Nearest south/left house across Mason from red-brick north corner. Unique current southwest-corner mapped footprint.

Mapped main-facade outward bearing: 59.1° clockwise from north.

**Estimates/limits:** Do not use side-view windows as a detailed Chemong-front pattern. Exact opening counts and roof ridge location unresolved. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.

### way/446365624 — Aji Sai, 667 Reid Street

Photos: R065, R067.

west side Reid, east/southeast-facing frontage.

**Visible:** Charcoal/dark brick front, cream AJI SAI lettering over entrance. Distinct dark tiered eave over one-storey entry bay. Two-storey dark wing to image left/south and low front planter.

**Match:** Readable Aji Sai sign and unique shaped frontage. After Mason/Reid fork and adjacent pale tiered-roof commercial building R065.

Mapped main-facade outward bearing: 106.5° clockwise from north.

**Estimates/limits:** Beyond through-Mason first implementation batch. Exact canopy shape, opening fractions and planter dimensions estimated. All hex colors, material roughness, numeric heights and opening dimensions are estimates. Hidden/rear elevations are not photo-verified.
