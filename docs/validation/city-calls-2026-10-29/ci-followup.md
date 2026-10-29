# Publication CI follow-up

Draft PR [#72](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/72) triggered the repository's separate City Explorer checks after the call-catalogue acceptance runs.

The geospatial build passed. Its automatic commit `d47d5e5b4369f9e0a83f2d166b3808060a9a76e5` refreshed four generated timestamps. A parsed comparison confirmed all 43,113 elements in `city-explorer/data/peterborough-osm.json` were identical before and after that commit. No call catalogue, station assignment or simulator code changed.

The initial City Explorer browser job stopped at roughly 32 seconds while the scene was still loading, with no page errors. Its existing smoke test passed `{timeout:65000}` as the second `waitForFunction` argument, which is page-function data rather than timeout options. The correction supplies `null` as that argument and passes the unchanged 65-second limit as the third argument.

A real Chromium probe reproduced the argument-position error: with a 250 ms default and a ready state delayed until 700 ms, the old expression timed out at 251 ms; the corrected expression observed readiness at 701 ms. Local 3D startup passed before and after the correction, in approximately 14 and 17 seconds, so the slow CI startup itself did not reproduce locally. The probe used installed Playwright 1.62.1; CI uses 1.55.0 and remains the verification of its own runner environment. The other four workflow browser scripts already use the correct explicit argument positions.

The repository suite passed again after the metadata refresh and harness correction: **977 passed, 0 failed**. The delivered call/scene runtime hashes remain those identified by the main validation receipts. The smoke correction changes the harness, not the application timeout policy. Current remote results are visible in the [PR checks](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/72/checks).

The subsequent [City Explorer Browser QA run](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/40833885462) passed road startup, authored-scene integration, Station 1 driving, and mobile-controls checks. The multitouch step started at 07:20:51 UTC and reported 11 of its 12 viewport, mode, and touch-order combinations passing by 07:36:34; the 24-minute job limit cancelled it at 07:37:17. The log showed continued progress and no assertion failure, but the last combination and subsequent checks did not complete.

The job limit is raised to 35 minutes, adding 11 minutes for the remaining combination, landscape screenshot, focus-loss, mouse and keyboard checks, and artifact upload on the software-rendered runner. All checks remain enabled. This is a budget adjustment based on the observed run; the next CI run must still establish whether the full job finishes and passes.

The [35-minute-budget rerun](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/40836925041) passed the complete job, including all 12 multitouch combinations and the subsequent checks. The companion [geospatial build](https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/40836925040) passed. These runs tested `feeb7cf6c682bdc398a7f2d50d54111bf502aefd`; its subsequent generated-asset commit `d3c8bd01b75fa13567c0b1ec6320ce41268bd897` was verified to change only four timestamps.

The final [diagnostic-popup correction](popup-followup/README.md) was then independently reviewed and validated with 977 repository tests, both popup paths, all 33 scene cases and two Peterborough transport cases. Its separate publication checks are linked from the PR; the earlier CI success is not claimed as execution of that later HTML change.
