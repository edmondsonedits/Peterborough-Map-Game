# Peterborough street appearance audit — 2026-10-10

## Scope and honesty

This pass compares **every packaged renderable OSM road way** with the available Ontario Road Network (ORN) lane events, then corrects confirmed rendering mistakes. It is **not** a claim that every street has been photographed, manually reviewed, surveyed or made perfectly accurate.

The source snapshot contains 5,961 renderable ways, 2,778 public ways and 923 distinct nonblank name strings. These are segments/name strings, not an official count of municipal streets. The complete per-way inventory is `network-audit.json` and the original ORN attribute receipt is `orn-lane-events.json`.

Initial matching results: 2,081 lane-count agreements; 232 conflicts needing review; 64 ways with missing OSM counts and usable ORN evidence; 195 partial/varying matches; 3,389 without a reliable ORN match. Many unmatched ways are service roads or unnamed ways. A data conflict does **not** establish which source is wrong. No 232-way automatic replacement was performed.

## Source evidence

- OSM: packaged `city-explorer/data/peterborough-osm.json`, with original per-way tags. Map data © OpenStreetMap contributors; existing repository attribution remains in force.
- ORN lane events: https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/6 . The receipt fetched 3,213 events for all 3,179 requested ORN road IDs, retrieved 2026-10-10T22:35:07Z. Events retain their historical effective dates; download time is not survey time.
- Ontario aerial references: https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer . Reviewed eight bounded reference exports around Sherbrooke/Station 1, George, Water, Lansdowne West, Chemong, Parkhill West, Aylmer and the Park Street area. The service is a mosaic; no claim that imagery was acquired in 2026. Filenames are not proof that a view covers an entire named street.
- User-provided Sherbrooke corridor and road-comparison images were reviewed as additional visual references. They are not embedded as geographic survey data.
- Ontario MTO pavement-marking conventions: https://www.ontario.ca/document/official-mto-drivers-handbook/pavement-markings . Conventions determine how to interpret paint, not whether a specific segment currently has that paint.
- OSM semantics: https://wiki.openstreetmap.org/wiki/Key:lanes ; https://wiki.openstreetmap.org/wiki/Key:lanes:both_ways ; https://wiki.openstreetmap.org/wiki/Key:divider ; https://wiki.openstreetmap.org/wiki/Key:cycleway ; https://wiki.openstreetmap.org/wiki/Key:overtaking . A separate track/shoulder is not evidence for an on-road bike stripe; passing permission does not uniquely specify a dashed centre line.
- Municipal pavement/curb footprints remain authoritative and unchanged. The City Basedata curb layer description mentions classifications that are not necessarily exposed in its fields: https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/8?f=pjson . This pass does not invent missing curb heights or classifications.

## Confirmed Sherbrooke correction

A bounded reviewed corridor from Park Street toward George Street contains OSM ways `739159886`, `737434011`, `650896572`, `460581459`. Their packaged `lanes=4` values caused the renderer to draw extra same-direction white dividers. Matched ORN lane records support two travel lanes, and the corridor references show one solid yellow opposing-traffic division rather than those additional white through-lane dividers.

The correction is scoped by **way ID, street name and the old four-lane tag**, not by the name Sherbrooke alone. It changes the paint interpretation to two travel lanes and one solid yellow centre line. It does not narrow the actual asphalt, erase parking, move the road, alter dispatch routing, or overwrite OSM source tags. Other sections of Sherbrooke and junction turn-pocket details remain unverified. Planned western Sherbrooke reconstruction is not treated as already-built geometry.

## General fixes applied across the city

1. Respect mapped forward/backward/shared lane allocations. Count a central shared lane once, and do not mistake a partial one-direction count for the total.
2. Correct the side of asymmetric lane boundaries. Shared centre-turn lanes receive yellow borders on both sides (solid outside, broken inside), rather than a white divider on one side.
3. Use explicit divider tags where provided. Do not derive dashed paint from `overtaking=yes`. Unallocated odd counts remain unresolved rather than guessing which direction has the extra lane.
4. Do not add bike stripes for separately mapped tracks, shoulders or shared bus lanes; side-specific exclusions override generic tags.
5. Build thin paint geometry after municipal pavement and Station 1 reconciliation. Sample both sides of the stripe against the final gameplay surface, subdivide it and omit unsupported cells. This reduces floating/buried strips but is not a proof of exact clipping at every sub-metre boundary.
6. Preserve editor visibility/restore/clone bindings when paint changes from instanced boxes to batched surface strips. Preserve driving controls, vehicle dynamics, dispatch, geographic road footprints and existing curb/sidewalk meshes.
7. Keep same-level junction logic separate from stacked crossings and use appropriate opposing-side highway edge colours.

## Reproduce

`python tools/audit_street_lane_evidence.py path/to/orn-lane-events.json` (shapely + pyproj) compares the packaged datasets. It uses NAD83/UTM17N, approximately 12 m samples, matching normalized names, <=8 m offset and <=20° direction difference. A single lane count with >=90% sample coverage is required for a definitive data comparison. Conflicting nearby parallel matches are rejected and ORN event measure ranges are respected. This still is not a substitute for field verification.

`node tools/test_street_marking_evidence.mjs` tests semantics, actual Three.js paint output, surface following, asymmetric offsets, reviewed-way bounds, missing support and existing editor bindings.

`node tools/check-street-paint-comparison.cjs BASELINE_URL UPDATED_URL` captures matched camera views and frame-time/geometry statistics. Software-rendered CI timings are not real Android GPU benchmarks. Existing Station 1 driving and mobile controls QA must also pass.

## Remaining work, explicitly not claimed complete

All other roads remain `visualReview: not-reviewed` in the audit. Eight aerial areas do not validate eight complete roads, much less the entire city. Resolve the 232 conflicts individually against dated imagery/municipal plans/current observations before changing lane counts. Check turn-lane transitions, parking/bike-lane widths, hatching, stop bars, sidewalk gaps, actual curb presence and dropped curbs. Preserve private/service-road distinctions and bridge decks. The current paint defaults are still inferred outside explicit tags or reviewed overrides.

No source terrain, road footprint, lane database or municipal curb geometry is rewritten by this paint release. `network-audit.json` is the review queue, not a certificate of whole-city visual accuracy.
