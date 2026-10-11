# Visible road contact correction, 2026-10-11

This is authored regression evidence, not independent review or browser QA.
Independent reviewer is assigned separately. Source geographic geometry, inferred
widths, driving/physics indexes and road meshes are unchanged by this helper.

## Failure and bounded correction

Real retained OSM road ribbons can occlude paint draped solely on municipal ROAD
triangles. The first visible-top candidate eliminated burial by dropping entire
historical strokes when their height refinement encountered a real rendered step.
That removed both Hospital solid borders. It was rejected.

The corrected helper preflights the complete stroke support grid before generating
geometry. Every null or forbidden support probe, including later refinement probes,
still discards the entire stroke. No parking-only, off-footprint, bridge-conflicting
or inferred-only historical eligibility is introduced. The source-specific shared
support wrapper retains the original municipal ROAD eligibility gate.

With continuous valid eligibility, triangle height fits retain the same 1.5 mm
probe tolerance, 0.1 m support-grid bound and eight subdivision levels. Only a
still-unresolved local height-step leaf is omitted. Final Float32 collapsed or
non-upward faces are also omitted, never emitted. These are unresolved **rendered
mesh contact patches**, not evidence of real-world gaps in road paint.

## Geometry results and metric definitions

Combined actual-source tests retain Medical's three solid ranges and five hatches
(after the same true-intersection exclusions as baseline), and both Hospital solids
plus 16 dashes, in desktop and low-power modes. Zero buried/unsupported triangle
probes; maximum lift residuals desktop Medical 1.195 mm, Hospital 1.412 mm;
low-power Medical 0.412 mm, Hospital 1.172 mm. Per-triangle vertices, edge midpoints
and centroids are checked from final Float32 arrays. Finite probes are not a proof
against arbitrarily microscopic unobserved gaps.

Medical has no deliberately omitted local contact patches in this combined fixture.
Hospital's omitted leaf-triangle area is **0.000442497 m²**, with 4,254 patches.
The largest individual triangle span is **0.830 mm**. The maximum merged projection
of those patches onto canonical source station is **50.745 mm**. The API field is
`maxAffectedStationSpanM`, deliberately not "gap length": thin diagonal seams can
project along a substantial station interval without removing the whole stripe.

Independent Shapely planar-union accounting of actual Float32 output versus the
same eligible/intersection-trimmed reference finds Hospital missing area
**0.000627384 m²**, including quantization slivers and local leaf omissions. This
is equivalent to **4.826 mm** of a 0.13 m-wide stripe, distributed across the profile.
The maximum intersection of those missing polygons with a stroke centreline is
**1.348 mm**, not claimed as a full-width interruption. Medical's missing union
area is numerical noise (~1.5e-14 m²). Triangle-area sums and exact polygon-union
areas differ because of overlaps and Float32 refinement slivers; they must not be
presented interchangeably. `quantizationAreaResidualM2` exposes sum imbalance but
is not a union-area calculation. No maximum full-width gap is claimed.

The retained OSM Hospital occluder at the previously reported worst point is way
825436996, raw `highway=service`, `service=parking_aisle`, rendered road-surface-batch
material `parking`. Material name alone does not establish a municipal parking
polygon. It can provide actual Y-only road contact inside an already eligible
municipal ROAD footprint; it cannot expand historical XY eligibility.

## API and reproduction

`renderHistoricalPaintProfile` returns `contact` with omittedPatchCount,
omittedAreaM2, equivalentLengthM, maxAffectedStationSpanM, maxPatchSpanM,
eligibleAreaM2, emittedAreaM2, quantizationAreaResidualM2 and omittedPatches.
Per-stroke ranges carry their own contact metrics. Patch records include kind,
reason, positionsXZ, stationFrom/stationTo, areaM2 and spanM. Apps should expose
summary fields only; full patch coordinates are retained in QA artifacts.
The lower-level `drapeHistoricalStroke` retains its positions-array return API.

Run:
- `node --test tools/test_historical_paint_contact.mjs tools/test_historical_paint_profiles.mjs`
- `node tools/test_historical_visible_road_top.mjs --desktop`
- `node tools/test_historical_visible_road_top.mjs`

For candidate cross-tree testing, set VISIBLE_PAINT_ROOT to the shared app/helper
tree and VISIBLE_HISTORICAL_HELPER_PATH to the historical helper file. Set
HISTORICAL_CONTACT_QA to a local directory to save full eligible/emitted geometry
and contact patches. `tools/plot_historical_contact_qa.py INPUT.json OUTPUT.svg`
creates top-down source-coordinate and magnified local-patch plots without imagery.
`tools/analyze_historical_contact_qa.py INPUT.json OUTPUT.json` uses Shapely >=2
for independent polygon-union and centreline accounting.

Source-space QA SVG/PNG and full data were generated locally under
`/tmp/historical-contact-qa/` for parent persistence. No publication or deployment
was performed by this task. Browser pixels and final whole-tree CI remain parent
integration checks.


## Compact visual artifacts

- `desktop-contact-qa.png`: desktop generated geometry and 6 mm magnified patch.
- `low-power-contact-qa.png`: low-power generated geometry, independently labelled.
- `contact-qa-results.json`: per-mode shape counts, final Float32 probe results,
  helper contact statistics and independent polygon-union measurements.

For reproducible PNG output, call `tools/plot_historical_contact_qa.py INPUT.json
OUTPUT.png` with Matplotlib installed. The same script produces a dependency-free
SVG for an `.svg` destination. Raw-coordinate JSON is retained in checkpoint
artifacts rather than committed as large meshes. Both final mode checks include
zero-area/downward Float32 face assertions and pass on the committed helper.
