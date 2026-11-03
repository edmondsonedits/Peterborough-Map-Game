# All-city Dispatch rollout validation

Status: in progress, not published. Local checks are not release acceptance.

## Completed checks (2026-11-02)

- All 33 packages expose local roads, Fire/EMS response, route guidance and a sourced hospital destination. Toronto Island EMS is explicitly scene-only because ferry transport is not simulated.
- All 33 cities have completed desktop and mobile Fire/EMS browser workflows. Checks cover short real-control driving, camera centering, response, EMS transport/handover where applicable, completion, route review/history and Next Call. Long journeys use controlled arrival fixtures, not physical route drives.
- 459 fitted base entries pass continuous collision checks along a real call route to ten metres beyond each yard, with zero blocked moves. These cover Peterborough, Richmond Hill, Ajax, Barrie, Kitchener, Brampton, Burlington, London, Windsor, Mississauga, Ottawa, Waterloo, Oshawa, Pickering, Clarington, Whitby, Toronto, Scarborough, Hamilton, Guelph and Cambridge. Image-based geometry is estimated; canonical coordinates and IDs are preserved.
- Scarborough reuses 29 Toronto fits only after exact service/address/canonical-coordinate matching; its road exits and all assignment routes were independently checked.
- Mississauga Falbourne was corrected from the pond-side source point to the address-matched station building and immediate parking/apron. Official address, OSM-derived named facility point and imagery evidence are recorded in its sidecar. All 36 Mississauga exits and four workflows passed after correction.
- All-city package tests: 33 passed after the latest fits. Earlier focused package/EMS/access/store tests: 137 passed; shared gameplay/camera/corner checks: 40 passed. Full release regressions remain pending.
- Existing dataset identities are preserved; canonical roster fetches use the release cache version.
- Hospital matrix records official destination sources and coordinate provenance. Campus bounds checks do not claim an ambulance entrance.
- Toronto routing reuses collision-validated roads including the approved Island supplement; larger graph searches resolve previously failing long mainland hospital routes. Both Island workflows passed. Full Toronto desktop/mobile workflows passed without page errors or alerts.

## Remaining acceptance work

- Fit and validate the remaining 163 eligible base entries. Workers are reviewing Chatham-Kent/Greater Sudbury and Belleville/Brantford/St Catharines/Milton/Niagara Falls/Oakville. Kingston/Thunder Bay/Markham/Vaughan follow.
- Keep the new complete-base-geometry test as a release gate; it intentionally fails until every eligible base has fitted runtime geometry.
- Review ambiguous facility identity against address and imagery; route checks alone do not establish correct placement.
- Complete regression review, reconcile concurrent upstream changes, version bump, deployment and fresh live verification.

## Evidence limits

Browser JSON lives under ignored `artifacts/release-qa/all-city-dispatch/`; fitted-area evidence is tracked under `docs/validation/base-areas/`. Automated collision traces and browser input are not physical-phone or full-route driving acceptance. Imagery fits are not surveyed parcels, confirmed entrances, or guarantees of current access.
