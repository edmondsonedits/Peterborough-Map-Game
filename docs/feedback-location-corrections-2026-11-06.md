# Peterborough geographic corrections — 2026-11-06

This record contains public geographic decisions and source evidence only. It intentionally contains no account information, conversation identifiers, browser metadata, messages, or private report exports.

## Catalogue decisions

The canonical shared catalogue remains 200 unique addresses with 100 easy, 50 medium and 50 hard exercises. All stable canonical IDs, difficulty classifications and legacy source links are preserved. Eighteen records change: the 17 geographic exercises reviewed for this release plus the redundant hotel slot reconciled below.

Thirteen submitted full recognition circles are applied exactly. Thomas A. Stewart receives the submitted 96 m radius with its existing centre retained. The older Ravenwood suggested circle is superseded by the later approved real-address replacement at 1735 Ravenwood Drive with a 60 m recognition radius.

The former 1140 Lansdowne exercise becomes Quality Inn Peterborough at 1074 Lansdowne St W with the approved hotel centre and 65 m radius. The existing separate Quality Inn slot becomes Art Gallery of Peterborough at 250 Crescent St. Canadian Tire at 1200 Lansdowne was considered for that redundant slot, but the catalogue already contains Summit Plaza at that exact civic address. Keeping Summit Plaza and selecting the gallery avoids creating a duplicate address or retaining the unwanted 1140 exercise.

The former 1030 Water exercise becomes Peterborough Retirement Residence, 1039 Water St. Canadian Tire at 1050 Lansdowne is explicitly labeled a gas station. Lansdowne Place includes Mall in its label.

## Primary civic and venue evidence

City address layer: https://citymaps.peterborough.ca/arcgis/rest/services/Aerial_Context_Labels/MapServer/0

The layer was queried directly on 2026-11-06/07 using `/query`, `outSR=4326`, `returnGeometry=true`, and exact civic-address predicates. All replacement addresses returned active (`STATUS=ACTV`) records. The municipal geometry values below are retained at their returned precision for the new addresses. The hotel uses the separately approved recognition centre rather than claiming the municipal civic point is the building centre.

| Civic address | City OBJECTID | Type | Latitude | Longitude |
|---|---:|---|---:|---:|
|1074 Lansdowne St W|8211|P|44.28222501904105|-78.34671286003977|
|1200 Lansdowne St W|11336|P|44.28129995833535|-78.3519447923251|
|1039 Water St|17579|P|44.32918481812732|-78.31616960122571|
|1735 Ravenwood Dr|25669|P|44.3042528468656|-78.36497815958737|
|250 Crescent St|25258|S|44.29463433497778|-78.31778322195797|

Reproducible predicates: `ADDRESS IN ('1735 RAVENWOOD DR','1039 WATER ST','1200 LANSDOWNE ST W','1074 LANSDOWNE ST W')` and `ADDRESS = '250 Crescent St'`. The layer comparison is case insensitive. `P`/`S` are the returned municipal primary/secondary address types; the gallery point is an active secondary civic-address record.

Venue sources:

- Quality Inn property: https://www.choicehotels.com/en-ca/ontario/peterborough/quality-inn-hotels/cn290
- Art Gallery of Peterborough: https://agp.on.ca/ — official gallery address 250 Crescent St.
- Retirement residence: https://peterboroughretirement.ca/contact/ — official residence name and 1039 Water St address; also https://www.rhra.ca/en/register/homeid/697dfcd49f82f/.
- Canadian Tire gas station: https://www.canadiantire.ca/en/store-details/on/peterborough-on-1741.html — 1050 Lansdowne Street West, Gas+, Gas Bar and Pit Stop.
- Canadian Tire retail store: https://www.canadiantire.ca/en/store-details/on/peterborough-on-81.html — separate store at 1200 Lansdowne Street West.

## Cross streets and road approaches

Road geometry: `city-explorer/data/osm-roads.geojson`, the direct local OSM road extract already used for canonical cross streets. Existing public provenance is pinned to https://github.com/edmondsonedits/Peterborough-Map-Game/blob/a2be43b7753e80a953bfad3b435cfab4da5b7805/city-explorer/data/osm-roads.geojson.

Replacement cross streets were checked against shared road vertices, not inferred from nearby street labels:

| Destination road | Cross street | Shared intersection latitude, longitude | Source ways |
|---|---|---|---|
|Water Street|Mill Street|44.3276957, -78.315277|33939868 / 33945408 and 33941743|
|Water Street|Langton Street|44.3300987, -78.3159723|33963141 / 33965425 and 33944954|
|Ravenwood Drive|Parkhill Road West|44.3053667, -78.3651571|177042769 and 941162796 / 586108333|
|Ravenwood Drive|Fair Avenue|44.3033296, -78.3642547|177042769 / 177042770 and 177042735|
|Crescent Street|Lake Street|44.2943099, -78.3180729|33959540 / 489241808 and 33952976|
|Crescent Street|Perry Street|44.2946952, -78.3181107|489241808 and 531285102|

The 1735 Ravenwood civic point lies roughly 118 m from Fair and 125 m from Parkhill by straight-line local projection, near the middle of this section; the original 1757 point lies near Parkhill. This replaces the address rather than moving the old address to a false location.

Every corrected/reconciled row now stores a separate modeled public-road approach on its named civic street and a 60 m driving arrival tolerance. The recognition circles remain the approved building/landmark scoring areas. An approach is a perpendicular nearest point on the relevant mapped named road; it does not claim to be a verified entrance, driveway, parking bay or operational access route. Source way, road name and `verifiedEntrance:false` are explicit. Larger campuses can be hundreds of metres from their civic road frontage, so using the recognition radius for driving arrival would cause premature arrival. Small storefront scoring circles must likewise not make driving arrival impractically precise.

## Runtime road geometry reconciliation

The driving simulator consumes `city-explorer/data/osm-public-roads.geojson` (2,775 features), while cross-street verification uses the fuller `osm-roads.geojson` (5,962 features). The shipped public extract is pinned at https://github.com/edmondsonedits/Peterborough-Map-Game/blob/f2b0c0deaacde6acb6b2f0f9f1be4161d49db1cb/city-explorer/data/osm-public-roads.geojson. A named road in the full extract is not sufficient evidence that an approach is drivable in the shipped network.

Release integration caught one mismatch: the initial James Strath approach used OSM way 430047956, a `highway=service` school loop named Brealey Drive. It exists in the full extract and is absent from the shipped public extract. The initial point at 44.2867019, -78.37723326 was 45.3075 m from the real public driving network, exceeding the runtime's 20 m access validation limit.

James Strath now approaches from the main public Brealey Drive, `highway=secondary`, way 460581475. The corrected point, 44.28683041160024, -78.37669312196262, is the closest projection of the school recognition centre onto that shipped road using the actual collision runtime's coordinate metric. It is about 97.493 m from the recognition centre. Its recognition centre and 80 m scoring radius are unchanged. The provenance on this approach explicitly points to the public driving extract.

All 18 approaches were audited with the actual `response-simulator/road-collision-core.js` against both road datasets. The other 17 were already within 0.001 m of shipped public-road centreline geometry and needed no coordinate changes. After correction, all 18 points are themselves drivable, their source ways are present in both extracts, and the actual incident-arrival resolver accepts each with the existing 20 m access-validation limit and separate 60 m driving arrival tolerance. No access tolerance was widened and no roadway was added.

## Changed canonical records

| Stable ID | Destination / address | Recognition centre (latitude, longitude) | Radius m | Road approach (latitude, longitude) | Source way |
|---|---|---|---:|---|---|
|ptbo-location-834713d4dd402b|Del Crary Park / 100 George St N|44.29533459772756, -78.31773521913112|106|44.29527371, -78.3192777|way/759024592|
|ptbo-location-8d5de3e709a34b|Thomas A. Stewart Secondary / 1009 Armour Rd|44.3309442, -78.3099086|96|44.33055271, -78.30861369|way/33964111|
|ptbo-location-4ab2e83a0adbe9|Peterborough Retirement Residence / 1039 Water St|44.32918481812732, -78.31616960122571|60|44.32924671, -78.31573855|way/33963141|
|ptbo-location-0a91934bcce034|Canadian Tire Gas Station - Lansdowne / 1050 Lansdowne St W|44.2821096, -78.3462346|60|44.28171658, -78.34603974|way/58425635|
|ptbo-location-43baa97ede192d|General Electric / 107 Park St N|44.29516564984372, -78.3300518366313|206|44.29609843, -78.32659025|way/56938891|
|ptbo-location-2d19279bc7af07|Art Gallery of Peterborough / 250 Crescent St|44.29463433497778, -78.31778322195797|60|44.29461826, -78.31810315|way/489241808|
|ptbo-location-e9b5c1759b3e50|Quality Inn Peterborough / 1074 Lansdowne St W|44.2824014528922, -78.34677814238762|65|44.2816181, -78.34656472|way/1340162026|
|ptbo-location-7d7426b218ffff|Portage Place / 1154 Chemong Rd|44.32954295935968, -78.33893534644824|143|44.32860679, -78.34076751|way/460007925|
|ptbo-location-b53711e5e3c867|James Strath Public / 1175 Brealey Dr|44.28656434204066, -78.37785999035896|80|44.28683041160024, -78.37669312196262|way/460581475|
|ptbo-location-76f794f5c89fad|Quaker Foods City Square Park / 215 Charlotte St|44.30283664719648, -78.32237005233765|52|44.30333349, -78.32241082|way/454960675|
|ptbo-location-1299391522eb1a|Market Hall Performing Arts Centre / 336 George St N|44.303677409425326, -78.31966638684924|35|44.30366789, -78.3198981|way/40793460|
|ptbo-location-44b0d4956a5571|Costco Wholesale Peterborough Warehouse / 485 The Parkway|44.27180093429314, -78.33986878155372|98|44.2727912, -78.3416633|way/364843838|
|ptbo-location-fcb0f7dc19933c|Lansdowne Place Mall / 645 Lansdowne St W|44.28290843889817, -78.33136085530941|245|44.28510181, -78.33250119|way/550182200|
|ptbo-location-c69c2c9145c1c0|Wellness Centre / 775 Brealey Dr|44.27359855790262, -78.37366459596444|70|44.27417431, -78.37125557|way/758783583|
|ptbo-location-ac5bdbdeeb0516|Tim Hortons / 898 Monaghan Rd|44.28682164170232, -78.3295583485264|24|44.28670632, -78.33007701|way/531130756|
|ptbo-location-28e577488958e2|Little Lake Cemetery / 915 Haggart St|44.29396759342578, -78.30848699600733|210|44.29342818, -78.31080939|way/489240865|
|ptbo-location-6727facfb31979|Walmart Supercentre - Lansdowne St W / 950 Lansdowne St W|44.28396833482003, -78.34344149115287|89|44.28258154, -78.34271847|way/460579796|
|ptbo-location-cb32b00a0b6464|1735 Ravenwood Dr / 1735 Ravenwood Dr|44.3042528468656, -78.36497815958737|60|44.30432711, -78.36466365|way/177042769|

## Validation boundary

The focused data checks cover exact approved circles, correct replacement civic coordinates, unique addresses and counts, labels, real Geo practice radius boundaries, and road approach points lying within one metre of their named source geometry. A further regression runs the actual collision core on the shipped public driving extract and checks all 18 approaches through the real incident-arrival resolver, including the existing 20 m access-validation limit. Generated payload propagation, existing-cache migration, all-mode runtime behavior, release version and public deployment are validated separately at release integration.
