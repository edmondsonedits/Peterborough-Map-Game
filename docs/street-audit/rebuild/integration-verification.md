# Approved simulator batch: rebuilt integration verification

This is a newly reconstructed batch based on PR54 commit `f8818548ad903b14b22ee5a48a88f3abcd92f582`. It is not recovery of the lost earlier implementation. Source data and all 5,961 original raw audit lane/comparison fields are unchanged.

## Local verification, 2026-10-11

- Full Node aggregate: **461/461** passed using `node --test --test-concurrency=2 tests/*.test.cjs tests/*.test.mjs tools/test_*.mjs tools/test_*.cjs tools/geospatial/test_*.mjs`.
- Python audit/tracker: **20/20** passed with the existing pinned Shapely 2.0.7/PyProj 3.7.0 environment; deterministic tracker check reports no hash drift.
- Explicit desktop fallback runtime check passed, including **401,450** independent raw rendered-top probes with zero missing or hidden paint. The aggregate includes the corresponding mobile check (**401,506** probes). Both retain all **185** mapped arrow candidates.
- Entry-point/cache regression resolves **61** local modules, preserves shared CitySplatLayer identity and checks all changed runtime imports. App syntax and whitespace checks pass.
- No source geospatial assets, road-network physics module, gameplay systems, licensing UI, or CALLBACK files changed.

## Evidence and limits

Historical Medical and Hospital paint is bounded and partial. Eligibility is distinct from actual mesh emission; the audit does not certify final support, current conditions, or complete appearance. The queue contains 5,961 ways, 91 explicitly scoped evidence records and 5,870 unreviewed ways. Current-condition certifications and resolved source conflicts remain zero. Parkway paint remains blocked on adequate independent evidence.

The Hospital repair is bounded; substantial inherited outer-window bumps remain. See the surface and curb reports for before/after contact traces and residuals. Historical strokes require actual municipal road triangles. Explicit mapped service arrows may use actual parking pavement; default-lite mapped arrows use actual rendered fallback road tops without changing gameplay support or road geometry.

Support checks use finite spatial probes and adaptive triangulation, not universal exact clipping. The fallback deck-selection policy and source-fixture omissions are documented in `fallback-arrow-support.md`. CPU and attribute-byte reports are local measurements, not browser startup, GPU memory or phone performance claims.

Actual browser screenshots and pixel-visibility checks are configured in CI for the exact triggering head, with a recorded before-baseline commit. Browser artifacts and physical-phone behavior have not been verified locally. Publication to the existing draft PR is authorized; this report does not authorize merge or deployment.

## Browser-discovered follow-up

The first published tree (`8bc319d`) passed local geometry tests but browser CI found two genuine gaps in verification. The smoke test accidentally passed its 65-second timeout as page data, resulting in a 30-second default wait. Its corrected API call has a red-to-green regression, fails even if readiness appears only after a timeout, and records exact `f881854` baseline/candidate startup reports with opt-in phase timings.

The Hospital service arrows were emitted but hidden by retained OSM road ribbons above municipal pavement. Independent combined-mesh review found the same risk for historical paint. The shared support now keeps municipal footprint/class eligibility mandatory, while final Y follows the compatible actual visible road top on the same deck. A mapped service/parking-aisle road ribbon can supply Y inside an eligible municipal ROAD footprint; parking-area polygons cannot establish historical eligibility. No source geometry, road meshes or gameplay contact indexes are changed. This is paint presentation, not repair of competing pavement heights.

Historical strokes still fail wholly on missing/forbidden XY support. At valid visible-height discontinuities, only minimal unresolved local contact triangles are omitted; the complete long borders remain. The detailed contact report distinguishes omitted triangle area, Float32 polygon-union missing area, equivalent length, affected-station span and centreline interruption. These are rendered-mesh gaps, not observations of real road paint. Before/after actual-source regressions cover both terrain profiles and preserve source/physics immutability.

Fresh corrected-tree aggregate: **485/485 Node tests**, **20/20 Python tests**, all extra desktop/mobile source/site cases and deterministic audit/tracker checks pass. All 5,961 original raw audit fields remain unchanged. The only source-asset changes inherited after publication are the geospatial bot's three generated timestamps (`19aefbac`).

Browser QA now isolates each historical stroke's vertex range for pixel attribution, checks both expected paint kinds, deliberately selects synthetic desktop capabilities versus explicit low-power, and asserts the effective renderer profile. This corrects the first run, where both nominal modes automatically selected low-power. `ready_for_review` triggers browser checks on the final bot-updated head without causing another geospatial timestamp refresh. Corrected browser artifacts and live deployment remain pending at this commit; previous failing artifacts are not acceptance evidence.
