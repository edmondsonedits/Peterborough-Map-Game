# All-city Dispatch rollout validation

Status: locally verified v1.6.175 release candidate; publication/live verification pending.

## Current evidence

- 33 cities expose local roads, Fire/EMS response, route guidance and a sourced hospital destination. Toronto Island EMS is explicitly scene-only because ferry transport is not simulated.
- All 33 cities completed desktop and mobile Fire/EMS browser workflows: 132 surface/service cases. Checks cover short real-control driving, camera centering, response, EMS transport/handover where applicable, completion, route review/history and Next Call.
- All 622 eligible bases have fitted areas and pass continuous route-based collision checks beyond the yard, with zero blocked moves. The final audit compares recorded centers, dimensions, rotations and spawns against current geometry; it rejects stale evidence.
- All 32 canonical geo datasets retain every source field outside the modeled drivingArea. Historical preview aliases are checked against a fixture extracted from the pre-rollout packages, including runtime exposure.
- Mississauga Falbourne and Markham EMS27 were recentered onto address-confirmed buildings rather than their inaccurate canonical station points. Markham's official YorkMaps address point lies inside York's 2023 building footprint; the matching image supports building/parking/apron sizing. Canonical points remain unchanged.
- Scarborough reuses 29 Toronto fits only after exact service/address/canonical-coordinate matching; road exits and local routes were independently checked.
- The independent runtime review found no important correctness/security issue. Its historical-ID coverage concern was addressed.
- The final complete-base geometry, all-city package and Ontario-data test run passed 43 tests. Wider final release regressions are recorded separately under ignored artifacts.
- Mobile route-review overlap was reproduced, fixed and checked for both services, including restoration of controls. Newer upstream station-switching/mobile-picker and bay-camera/manual-door fixes are preserved.

## Release gates

- Final v1.6.175 checks passed: 1,260 tests across 17 groups, five road geometry/asset checks and the four Richmond Hill desktop/mobile Fire/EMS workflows.
- Publish through GitHub Pages and verify fresh live assets and city startup/playability.

## Evidence and limits

`all-city-dispatch-release.json` records all 33 cities and 132 workflows. `base-areas/` records facility-specific fit provenance; `all-city-dispatch-hospitals.json` records hospital sources. Raw browser/exit evidence is under ignored `artifacts/release-qa/`.

The geometry is estimated, not surveyed parcel or verified entrance data. Long mission legs use controlled arrival fixtures; short driving uses actual keyboard/touch input. Browser tests are not physical-phone or full-route driving acceptance. See `dispatch-city-rollout-checklist.md` for the reusable 23-item city checklist.
