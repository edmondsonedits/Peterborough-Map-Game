# Station 2 independent review

27 October 2026. Read-only code review of the Station 2 Blender model contract and game integration, followed by targeted verification of the runtime fixes. This review does not claim browser driving or visual acceptance; those are separate root checks.

## Original findings and resolution

1. **Rear door closure could ignore an occupant.** `city-explorer/station-two-runtime.js` previously returned `false` immediately for rear-door obstruction. A rear sectional door could close through a truck or player even though `stationRearDoorObstructed` existed in core. The current runtime now converts both occupant positions to station-local coordinates and calls `stationDoorObstructedForSide` for front and rear doors (runtime lines 132-140). The resolver dispatches to `stationRearDoorObstructed` (core lines 263-267). **Resolved in current source.** The regression in `tests/station-two.test.mjs` lines 80-87 checks the same resolver and state transition for both a truck and player. It does not instantiate `createStationTwoRuntime` or load the GLB, so it is a resolver-level rather than a full adapter integration test.

2. **Heading wrap could create a false swept collision.** `sweepStationTruck` previously interpolated raw headings, treating a small crossing of the -pi/pi boundary as almost a full turn. At local `(4, 9)`, headings `pi - 0.01` and `-pi + 0.01` had clear endpoints but reported a blocked sweep. The current core computes the shortest angular delta with `atan2(sin(delta), cos(delta))` and interpolates it (core lines 205-213). `tests/station-two.test.mjs` line 69 reproduces this boundary case. **Resolved; focused test passes.**

## Targeted follow-up

- The front folded-leaf polygons now participate in truck/player collision (core lines 128-152 and 180-183). The test at lines 59-61 confirms the centered open doorway clears the truck while a shifted truck hits the folded stack. No critical mismatch was found in this bounded check.
- `nearestStationDoor` considers front and rear openings by distance within 12 m (core lines 62-74); the runtime uses it at lines 166-176. The tests at lines 41-43 cover the truck spawn, rear threshold, and out-of-range location. No critical reach defect was found.
- `node tests/station-two.test.mjs` passed in the current checkout. Model pivot and rear panel translations are checked against the GLB in that test. Browser drive-out, road connection, visual match, and Station 1/3 behavior remain for the root's planned browser checks.

**Code review verdict:** the two reported defects are fixed in current source. The focused tests cover their core behavior; rear closure still lacks a full runtime/GLB integration regression.

## Additional visual defect found and resolved
The generated arena source was restored by the asynchronously loaded editor document: applyOverrides restores all generated records before applying the published overrides, which are empty. Root now routes all three application override paths through applyCityOverrides, then hides the exact obsolete arena source if Station 2 is installed. The GLB-ready callback covers the opposite ordering. The final browser test delays the editor document to reproduce this load order and checks the resulting appearance.
