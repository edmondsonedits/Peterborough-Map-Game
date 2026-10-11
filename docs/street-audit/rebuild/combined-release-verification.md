# Combined release verification — 2026-10-11

The simulator visible-contact candidate was independently reviewed at local `82431fda8bc7e881e9115d318ac8e05f99f32959` and published with identical tree as `c794c9b890dd626877e9bb5f99474a7aa1731a94`.

During release preparation, main advanced to `859ba17f18d5b3a26840c593638dc4d1165fd566`, the owner's separately published Route Mapping live tracing/junction work. Its seven files were merged without conflict or changes to its production runtime. Six failing legacy test fixtures were updated to exercise the actual live queue, pause-on-cancel, continuation, invalid perpendicular departure, Undo and submission lifecycle. No production implementation was reverted or adapted to obsolete test APIs.

The combined runtime/test head is `7f92f96`; `210eabb08d061968738c5ec7afb46969d2988ee8` additionally preserves the three timestamp-only files from geospatial bot head `e3e03d26bb643b18aedcf8fd5cb441d78fdcc376`. All `route-mapping/` bytes match main `859ba17`; simulator runtime bytes match reviewed `82431fd`.

Verification:
- Full combined Node aggregate: 522 passed, zero failures or skips.
- Python audit/terrain/tracker suite: 20 passed; deterministic tracker has no hash drift.
- Separate production-normalized worktree: all 326 repository Node tests passed after `scripts/normalize-release.cjs`.
- CI runs all Route Mapping CJS suites before simulator browser checks, and Pages explicitly runs the new live-route/junction suites alongside its existing regressions. A red-to-green workflow contract guards this coverage.
- Geospatial run 38166687100 passed; its only source-branch changes were three generation timestamps.

Actual corrected browser startup and authored integration passed during run 38166687103, but that run is intermediate: final combined publication-head browser/pixel evidence remains required before merge. Browser screenshots, real phone performance and deployment are not certified by local Node tests. The inherited bounded Hospital bumps, finite contact sampling, historical evidence limits and tiny paint-contact omissions in the main verification reports remain applicable.

## Final production-order candidate

Subsequent actual browser pixels exposed stale source/editor vertex ranges after pavement reconciliation. The metadata-only repair and actual assembly-order regression are described in [reconciled road provenance](reconciled-road-provenance.md) and [production-order QA](../historical-profile-rebuild/PRODUCTION-ORDER-QA.md). Earlier reversed-order composed-surface reports are explicitly superseded. Final reconciliation geometry is byte-identical; source ranges/editor bindings now follow the replaced buffers. Both historical profiles retain all expected strokes without contact-patch omissions in the corrected scene. The final oracle includes foundations, and stale ranges fail closed.

Main subsequently advanced to `8da0e813be80f46e7a592f654f61ec8a3b029765`, independently repairing the same Route Mapping legacy fixtures. Its stronger real-trace-core fixtures and Pages workflow are preserved byte-for-byte instead of replacing that concurrent approved work. Its Pages deployment run `38167274611` succeeded independently; that did not deploy the simulator candidate.

At combined runtime/test head `9203138737c62172355ebe7a309d47e452d4ef63`, the full aggregate passes **532/532**, with zero failures or skips. Python remains **20/20**, tracker hash drift is empty, and the dependency contract checks **62 modules**. Explicit desktop production-order geometry also passes. Independent review cleared the repair, both exact historical XY unions, the latest-main merge and its 327 repository tests.

Browser QA now reuses each ready scene across all eight historical/compound camera views: one before/after pair for desktop, another for low-power. This reduces six cold starts to four and adds actual low-power historical pixels. Screenshot capture has an explicit 90-second budget because the unchanged desktop baseline previously exceeded the implicit 30-second limit; startup readiness limits and pixel assertions are unchanged. Every report records exact baseline/candidate hashes and asserts its effective profile. Fresh final-head CI/pixels and normal deployment remain pending at this documentation checkpoint.
