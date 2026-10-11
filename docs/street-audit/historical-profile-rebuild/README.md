# Historical paint profiles: new rebuild, 11 October 2026

This is a **new implementation** on base `f8818548ad903b14b22ee5a48a88f3abcd92f582`.
The lost prior reviewed filesystem was not recovered. No exact recovery, current
street accuracy, browser QA, deployed result, or training certification is claimed.
The helper does not change OSM data, road width, physics, curbs, or routing.

## Source and evidence archive

- Packaged `city-explorer/data/peterborough-osm.json`: original two-point Medical
  way 250810393 and seven-point Hospital way 250811912. © OpenStreetMap contributors.
- Ontario Ministry of Natural Resources / Land Information Ontario imagery mosaic:
  https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer
- Fresh bounded mosaic exported and visually inspected on 2026-10-11. Exact request,
  SHA-256, timestamp and interpretation limits: `source-receipt.json`. Actual returned
  EPSG:3857 extent: `ontario-export-receipt.json`; the service adjusted the requested
  aspect ratio. No Google Street View assets, measurements, or screenshots were used.
- The Ontario catalogue explicitly lists SCOOP 2023 among open imagery releases:
  https://data.ontario.ca/en/dataset/open-ontario-imagery . Catalogue API receipt
  retains the SCOOP resource and licence link. Licence:
  https://www.ontario.ca/page/open-government-licence-ontario . Contains information
  licensed under the Open Government Licence – Ontario.
- The actual mosaic pixels' collection dates were **not independently established**
  in this rebuild. The 2023 label in earlier records is historical context, not a
  verified date for every export pixel. Retrieval time is not acquisition time.
  Source image pixels are not redistributed here; this archive retains provenance,
  source geometry, interpretation, executable checks and a reproducible export URL.

Fresh visual inspection supports the Medical yellow taper/hatching and Hospital
shared-turn arrangement qualitatively. The numeric traces below were supplied as
approved historical measurements; they were rebuilt, not independently remeasured
at centimetre accuracy. Unknown imagery-to-OSM registration remains additional
uncertainty. `currentVerified` is always false.

## Geometry and uncertainty

Project original coordinates at centre latitude 44.3091, longitude -78.3197 using
x = delta longitude × 111320 × cos(44.3091°), z = -delta latitude × 110540.
This produces Medical length **46.253885771 m** and Hospital **117.790521497 m**.
Earlier 46.546 / 117.8758 m estimates are not canonical app-projection lengths.
Geometry guards compare every original projected vertex, in either order, within
0.00001 m numeric tolerance; added, missing, changed or resampled vertices reject
application. `way/ID:piece` loader names are accepted only with full geometry.

Medical: yellow boundary from south offset 2.1 m to offset 1.78 m at fraction
14.83 / 46.546 of the actual projected length; branches end at north offsets
1.32 and 3.32 m. Hatches every 3 m are generalized, inset, unsurveyed positions.
Interpretation uncertainty is at least 0.6 m, plus unknown registration.
No white dividers, arrows or stop bars are inferred.

Hospital: pair-centre trace (canonical source chainage, left offset, right offset):
(10,-2.4,2.8), (20,-2.6,2.4), (30,-2.8,1.8), (40,-2.9,1.4), (50,-2.8,0.7),
(60,-2.7,0.7), (70,-2.2,1.0), (80,-1.6,1.4), (90,-1.5,1.8).
All offsets are positive driver-left in canonical source order. Only **10–90 m**
is traced; untraced ends are not historical evidence. Solid outer strokes and
inner dashes sit 0.12 m either side of each pair centre. Dashes are generalized
4.2 m on / 10.5 m period in canonical station coordinates. Interpretation
uncertainty is ±0.35 m plus unknown registration. Existing inferred 6.7 m road
width is untouched; these absolute offsets never derive from that width.
Original source corners and measured stations are shared miter joins, not
independently capped resampled pieces.

Guards preserve Medical's original optional 2/2 directional lanes and
left|none directional turns. Missing optional sparse tags are accepted. Changed
lane/shared/turn/conditional/direction tags, positive or conditional bridge/tunnel,
roundabouts and explicit no-markings reject the historical profile. Hospital
has no directional/turn allocation in the source, so newly supplied allocations
are rejected. Other unrelated tags, including width, do not move paint.

## Integration API

`historicalPaintProfile(sourcePointsXY, rawTags, lineId)` must run before any
resampling or filtering. Returns null or `{id, sourceReversed, evidence,
currentVerified:false, uncertaintyMetres, registrationUncertainty,
coverage:{from,to,sourceLength}, strokes}`. Stroke points have x,z and canonical
source `station`; width is 0.13 m and colour is yellow. Persist this object per
source way, not a recomputation from fragments. Do not fall back to the old
Hospital tag-only override if whole-source validation fails.

`renderHistoricalPaintProfile(profile, renderedPavementIndex,
{referenceHeight:null, excludedStationIntervals:[]})` returns flat triangle
`positions`, emitted `strokes` ranges (startVertex, vertexCount, kind, from, to),
and `reviewed`. Run once per original way after final ROAD triangles are indexed.
Intervals are canonical source chainage: for a reversed input convert source c
to sourceLength - c. Derive junction trims from original source endpoints and
apply exclusions over the whole line, even when resampling creates short pieces.
A validated profile replaces generic paint on that way, including untraced ends.
Count a historical review only when `reviewed` is true (vertices actually emitted).
Generic cycle edges or arbitrary tag differences are not historical emission.

`drapeHistoricalStroke(stroke,index,referenceHeight)` is the strict lower-level
helper. It only accepts `road_surfaces` hits with `rendered-pavement-triangle`
height provenance, excluding parking and bridge layers. It samples left edge,
right edge and interior at ≤0.1 m longitudinal and transverse spacing; any missing
sample omits the **entire stroke** (or entire remaining stroke interval after
junction clipping). Shared miter sections have identical vertices on both sides
of each join. Surface lift is 0.008 m. There is no terrain fallback.

This is finite sampling, **not exact polygon clipping**. Sub-0.1 m holes may escape
sampling. The index's barycentric inclusion tolerance is 1e-8 and stores float32
triangles; it is not a zero-tolerance mathematical containment proof. Larger
holes and edge overhangs are regression tested with real RenderedPavementIndex
triangles. Treat the documented limit as a limit, not as a field accuracy claim.

## Verification

Run `node --test tools/test_historical_paint_profiles.mjs`.
Tests cover raw packaged geometry/tag semantics, reversed and malformed geometry,
full-loader IDs, changed vertices, strict ROAD/parking/bridge support, missing
edges and holes, corner join equality, width independence, interval trimming and
review counts only after actual geometry. Integration app/browser checks belong
to the integrator and are not claimed by this helper-only rebuild.

Final helper-tree verification (2026-10-11): 9/9 focused tests passed. Full
`node --test tests/*.test.cjs tests/*.test.mjs tools/test_*.mjs tools/test_*.cjs tools/geospatial/test_*.mjs`
reported **397 tests: 396 passed, 1 failed**. The failure is
`tools/test_city_editor_release.mjs`, assertion “the app entrypoint must have a
release cache key”; this helper-only change does not edit the HTML loader or app.
The same pre-existing cache-key assertion is recorded in the base audit README.
`node --check city-explorer/historical-paint-profiles.js` and `git diff --check`
also passed. No Python or browser checks were run for this helper-only commit.


## Float32 interior-drape correction

Independent tests against the actual terrain-derived ROAD triangles found that
support-only probes plus interpolated edge heights left a Medical interior probe
at 5.134 mm lift instead of 8 mm. The rebuilt helper now quantizes XZ before
sampling (matching final Float32 attributes), validates rounded vertex heights,
and recursively tests emitted triangle edge midpoints and centroids. A triangle
is emitted only with lift residual <=1.5 mm at those probes. Refinement is bounded
to eight levels; unresolved height/support causes whole-stroke omission. The
original <=0.1 m edge/interior support grid remains. Missing pavement terminates
immediately, without recursively exploring an empty region (regression: one
query for a wholly unsupported 100 m stroke). Finite probe spacing is still not
an exact polygon-clipping or continuous error proof.

A failing synthetic ridge test reproduced 6.5 mm interior error with real
RenderedPavementIndex triangles. It now passes after final Float32 conversion.
Actual Medical/Hospital production geometry tests (desktop and low-power) pass:
maximum lift residuals respectively 1.492/1.123 mm and 1.417/1.172 mm, with zero
unsupported probes. Medical desktop triangles increase from 1792 to 1858 (3.7%).
Those tests inspect vertices, edge midpoints and centroids, current source guards,
partial junction exclusions, and emitted-only review counts. These are automated
geometry results, not browser screenshots or current street verification.

Audit metadata now distinguishes `longitudinalPartial` from `partialAppearance`.
Both profiles have partial appearance evidence even when Medical's longitudinal
trace covers its whole source way: white dividers, arrows and stop bars are not
established here, and hatch/dash cadence is generalized. `profileId` identifies
the historical interpretation. Final pavement emission remains unevaluated in
the offline eligibility audit.
