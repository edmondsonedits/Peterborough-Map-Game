# Peterborough street appearance audit — 2026-10-10

## Scope and honesty

This pass compares **every packaged renderable OSM road way** with the available Ontario Road Network (ORN) lane events, then corrects confirmed rendering mistakes. It is **not** a claim that every street has been photographed, manually reviewed, surveyed or made perfectly accurate.

The source snapshot contains 5,961 renderable ways, 2,778 public ways and 923 distinct nonblank name strings. These are segments/name strings, not an official count of municipal streets. The complete per-way inventory is `network-audit.json` and the original ORN attribute receipt is `orn-lane-events.json`.

Initial raw numeric categories (interpret only after direction/carriageway compatibility checks): 2,081 lane-count agreements; 232 raw numeric conflicts (see direction-aware triage below); 64 ways with missing OSM counts and matched ORN evidence; 195 partial/varying matches; 3,389 without a reliable ORN match. Many unmatched ways are service roads or unnamed ways. A data conflict does **not** establish which source is wrong. No 232-way automatic replacement was performed.

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

`python tools/audit_street_lane_evidence.py path/to/orn-lane-events.json` (Python 3.12+, shapely 2.0.7, pyproj 3.7.0 and Node.js 22+) compares the packaged datasets. It uses NAD83/UTM17N, approximately 12 m samples, matching normalized names, <=8 m offset and <=20° direction difference. A single lane count with >=90% sample coverage is required for a raw numeric comparison; direction/carriageway compatibility must be checked before interpreting it. Conflicting nearby parallel matches are rejected and ORN event measure ranges are respected. This still is not a substitute for field verification.

`node tools/test_street_marking_evidence.mjs` tests semantics, actual Three.js paint output, surface following, asymmetric offsets, reviewed-way bounds, missing support and existing editor bindings.

`node tools/check-street-paint-comparison.cjs BASELINE_URL UPDATED_URL` captures matched camera views and frame-time/geometry statistics. Software-rendered CI timings are not real Android GPU benchmarks. Existing Station 1 driving and mobile controls QA must also pass.

## Remaining work, explicitly not claimed complete

All other roads remain `visualReview: not-reviewed` in the audit. Eight aerial areas do not validate eight complete roads, much less the entire city. Resolve source compatibility before interpreting the 232 raw conflicts, then review comparable candidates against dated imagery/municipal plans/current observations before changing lane counts. Check turn-lane transitions, parking/bike-lane widths, hatching, stop bars, sidewalk gaps, actual curb presence and dropped curbs. Preserve private/service-road distinctions and bridge decks. The current paint defaults are still inferred outside explicit tags or reviewed overrides.

No source terrain, road footprint, lane database or municipal curb geometry is rewritten by this paint release. `network-audit.json` is the review queue, not a certificate of whole-city visual accuracy.


## Direction-aware triage — 2026-10-11

Regenerated from packaged main `ae711377f46fda285c5b0211f4c0992ddb9b754e`,
using the existing ORN lane-event receipt retrieved on October 10. This is a fresh
computation, **not a fresh field survey or new ORN event download**. Geographic
inputs and the renderer are unchanged.

The raw `status` is preserved for traceability. Do not treat it alone as a usable
lane comparison. The new `comparisonReview` classifies every matched way:

- `source-compatibility-review`: one or more accepted samples have a carriageway
  mismatch, opposite travel direction, unknown direction or ambiguous nearby
  candidates. Resolve this before comparing totals.
- `lane-count-review`: numeric conflict with compatible sampled directions;
  still requires independent dated evidence, not an automatic correction.
- `count-agrees-not-field-verified`: compatible numeric agreement; not certification.
- `missing-count-review` / `insufficient-evidence`: retain uncertainty and coverage.

ORN `Both` describes both traffic directions; OSM one-way lane counts describe
that mapped carriageway. Never halve ORN totals. ORN `Positive`/`Negative` is
relative to ORN geometry, so signed local tangent alignment and OSM `oneway=-1`
are respected. Implicit or conditional OSM direction is conservatively unknown.
See [Ontario's ORN standard](https://files.ontario.ca/tbs-go-its-29-ontario-road-network-orn-en-2022-09-29.pdf)
for direction and lane-count semantics. Compatibility alone does not prove that
two differently represented lines describe the same carriageway.

Current snapshot: all 232 raw conflicts remain recorded. 100 first need source
compatibility review; 132 remain direction-compatible lane review candidates.
Of the latter, four already have the bounded Sherbrooke paint override, leaving
128 without that override. Across all raw statuses, 247 ways need compatibility
review. These counts describe this input snapshot, not acceptance thresholds.

`directionCompatibility` counts accepted samples, `ornTrafficFlows` retains
selected ORN attributes, and `matchedSamples` / `sampleCount` expose coverage.
Historical `visualReview` is independent of `paintOverride`: the latter evaluates
the actual `reviewedPaintTags` guard using current IDs/tags. It means the configured
paint interpretation applies, not that a browser or current street was surveyed.
The four original visual-review records are historical bounded evidence.

`baseline` is the checkout HEAD, not a claim that local files are unmodified.
`hashes` identifies all six input files; `codeHashes` identifies both Python audit
sources. A non-Git checkout reports a null baseline. No timestamps are invented;
the receipt's retrieval and event-effective dates remain distinct.

Regression command: `python -m unittest discover -s tools -p 'test_street_lane_audit.py'`.
The audit also requires `node` on PATH to evaluate the unchanged paint guard. A
missing/failing Node process aborts instead of silently calling paint handled.

## Hospital Drive bounded historical paint review — 2026-10-11

Way `250811912`, approximately **118.05 m**, runs from latitude/longitude
`44.300846,-78.345605` to `44.3011523,-78.3470192`. Ontario imagery shows one
through lane each way and a central two-way left-turn lane, including opposing
turn arrows. The original packaged `lanes=2` remains unchanged. A paint-only
override uses total 3, forward 1, backward 1, shared 1, guarded by exact way ID,
`Hospital Drive`, the old two-lane count and bidirectional status. Explicit no
markings and uncertain/conditional one-way tags prevent application.

The renderer uses its existing shared-turn treatment: yellow solid lines on the
outside, broken lines inside. No arrow positions or stop bars are inferred.
Existing junction trimming and unsupported-surface omission remain in effect.
Road width, footprint, collision, routing, curb meshes and source tags are not
changed. The adjacent roughly 27 m way `123164463` is **excluded**; its transition
needs further review. No claim is made for the rest of Hospital Drive.

Evidence: Ontario Ministry of Natural Resources / Land Information Ontario,
[Ontario Imagery Web Map Service export](https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer/export?f=image&bbox=-78.3477%2C44.3007%2C-78.3454%2C44.3015&bboxSR=4326&imageSR=3857&size=1600%2C1600&format=jpg&transparent=false),
visually inspected October 11, 2026. Service footprint evidence identifies
SCOOP 2023 coverage; nearby stereo frames at `44.3017,-78.345` list April 15,
2023. That frame date is **not verified for every exported mosaic pixel or the
whole corridor**. Historical layout confidence is high; this is not a 2026
field survey. Source imagery pixels are not redistributed in this change.

The refreshed audit records five bounded historical paint reviews (the four
Sherbrooke ways plus this Hospital way). All **232 raw conflicts** and their
source-compatibility classifications remain recorded. Hospital's paint review
is independent of the original lane-count contradiction; neither a paint
override nor historical imagery automatically resolves source data or certifies
current training accuracy. Earlier four-way figures above describe the prior
snapshot. All roads outside these five bounded ways remain visually unreviewed
in the per-way audit.

Verification for this bounded change:
- `node --test tests/*.test.cjs tests/*.test.mjs tools/test_*.mjs tools/test_*.cjs tools/geospatial/test_*.mjs`: 386 passed, one failed. The failure is the pre-existing `tools/test_city_editor_release.mjs` release-cache-key assertion, independently reproduced at unchanged base `2496b157ebeb1d995278373297d5790b60a4150a`.
- The 18 street-marking tests pass, including actual `buildRoadMarkings` Three.js geometry: outer solids/inner dashes, 8 mm surface lift, junction gaps, missing-asphalt omission in both geometry directions, unchanged segment/profile inputs and four Sherbrooke overrides.
- Six Python audit tests, the building-provenance test and four official terrain tests pass with the pinned geospatial dependencies. Regeneration changes only the Hospital row's three paint-review fields; raw statuses and compatibility classifications are identical.
- Independent code review found no actionable defects. Browser visual QA was attempted but blocked before app startup: shell Chromium cannot create its required Unix socket, and the supported cloud browser cannot reach the isolated shell preview loopback. **No browser visual pass, current field verification or real-device performance result is claimed.**

Returning-client cache safety: the HTML loader, its dynamic app import and the
app's changed paint-module import each carry `hospitalPaint=1`. Previously all
three URLs were unchanged, and repository hosting configuration does not
establish a no-cache policy. This narrowly invalidates the changed dependency
chain without changing the global release or authored-bridge module identity.
A regression test executes the loader and checks every cache-key hop. The
paint/audit source hashes remain valid; cache-key edits do not change those
hashed source files or geographic inputs.
