# Publication CI follow-up

Draft PR [#72](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/72) triggered the repository's separate City Explorer checks after the call-catalogue acceptance runs.

The geospatial build passed. Its automatic commit `d47d5e5b4369f9e0a83f2d166b3808060a9a76e5` refreshed four generated timestamps. A parsed comparison confirmed all 43,113 elements in `city-explorer/data/peterborough-osm.json` were identical before and after that commit. No call catalogue, station assignment or simulator code changed.

The initial City Explorer browser job stopped at roughly 32 seconds while the scene was still loading, with no page errors. Its existing smoke test passed `{timeout:65000}` as the second `waitForFunction` argument, which is page-function data rather than timeout options. The correction supplies `null` as that argument and passes the unchanged 65-second limit as the third argument.

A real Chromium probe reproduced the argument-position error: with a 250 ms default and a ready state delayed until 700 ms, the old expression timed out at 251 ms; the corrected expression observed readiness at 701 ms. Local 3D startup passed before and after the correction, in approximately 14 and 17 seconds, so the slow CI startup itself did not reproduce locally. The probe used installed Playwright 1.62.1; CI uses 1.55.0 and remains the verification of its own runner environment. The other four workflow browser scripts already use the correct explicit argument positions.

The repository suite passed again after the metadata refresh and harness correction: **977 passed, 0 failed**. The delivered call/scene runtime hashes remain those identified by the main validation receipts. This follow-up changes the smoke harness, not the application or its timeout policy. Current remote results are visible in the [PR checks](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/72/checks).
