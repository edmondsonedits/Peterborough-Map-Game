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
