# All-city Dispatch rollout validation

Status: in progress, not published. Local configuration is not release acceptance.

## Completed checks (2026-11-02)

- All 33 packages expose local roads, Fire/EMS response, route guidance and a sourced hospital destination.
- 137 focused package, EMS, access, canonical-store and saved-roster tests pass.
- Existing dataset identities are preserved; canonical roster fetches use the release cache version.
- Hospital matrix records official destination sources and coordinate provenance. OSM campus bounds checks do not claim an ambulance entrance.
- 92 fitted base areas across Peterborough, Richmond Hill, Ajax, Barrie, Kitchener, Brampton, Burlington and London pass continuous collision checks along a real call route to ten metres beyond each yard. Source coordinates are preserved. The image-based fits are estimates.

## Remaining acceptance work

- Finish every-city mobile and desktop workflow checks and resolve failures. Browser JSON under ignored `artifacts/release-qa/all-city-dispatch/` records each scenario; long journeys use controlled arrival fixtures, not physical route drives.
- Fit the remaining 530 Fire/EMS entries and verify continuous exits. Ottawa and Mississauga are in progress.
- Fitted spawns fixed Barrie Fire 2, Brampton Fire 209, Burlington Fire 3/7, Kitchener Fire 2 and London Fire 13. Remaining known origin failures include Mississauga EMS Lorne Park, Ottawa EMS 384, Toronto Fire 121 and Windsor EMS Jefferson.
- Synthetic touch-start failures recorded no parent pointer event. The harness now waits for joystick actionability after closing the tablet; Cambridge, Greater Sudbury and Thunder Bay subsequently passed. This is browser automation evidence, not physical-phone verification.
- Toronto routing now reuses the collision-validated road set (including the approved Island supplement). Larger graph searches resolve the measured long mainland hospital routes; Toronto Island EMS is explicitly scene-only and records no transport. Both Island workflows passed. Shared gameplay/camera/corner regression checks:40 passed.
- Complete regression review, version bump, deployment and fresh live verification.
