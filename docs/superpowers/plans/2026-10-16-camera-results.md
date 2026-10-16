# Driving camera result

Scope: local v1.6.112 checkout; no version bump, commit, publication, physics, coordinate, call, or training-data changes by this task.

## Cause and change

The active desktop wrapper submits `setView(center, speedZoom)` continuously. The satellite guard previously queued that entire operation behind raster readiness (1650 ms timeout), withholding geographic follow along with zoom. Real-tile measurements showed stationary map centres while the vehicle and RAF continued normally. Adjacent zoom prewarming already exists; adding more requests would not address that coupling.

`satellite-map-1.5.6.js` now pans immediately using the current tile level while preserving the existing guarded zoom, coalescing, cache bound, timeout and preloader. `smooth-driving-camera-1.4.19.js` eases world scale over 280 ms at integer tile commits, around the vehicle anchor, and counter-scales only its inner artwork. This avoids fractional Leaflet zoom churn. Native animated zoom, reduced motion, review/detached camera and large jumps bypass additional easing. Rapid reversal retains the current visual scale.

## Comparable evidence

`tools/profile-dispatch-camera.cjs` runs actual Chromium/Esri tile requests at 1440x900 desktop and 390x844 touch. Original camera modules can be served directly from commit `0b2c8dc` with `PTBO_CAMERA_BASELINE=1`; other runtime inputs stay current. Each context follows the same 8.5-second eastward path, crossing its first threshold, stopping, then restarting. A test-only fixed velocity wrapper retains the normal simulation step; collision is disabled to keep the path deterministic. Firestore is blocked; tile requests are unchanged.

| Measurement | Original desktop, first/repeat | Final desktop | Original/final touch |
| --- | --- | --- | --- |
| Longest stationary follow while moving | 1516.6 / 316.6 ms | 16.6 ms | <=16.6 / 16.6 ms |
| Largest centre error | 84.91 / 17.71 m | 0.299 m | <=0.297 / 0.297 m |
| RAF maximum / p95 | 16.8 / <=16.8 ms | 16.8 / 16.8 ms | 16.8 / <=16.8 ms |
| Long tasks | 0 | 0 | 0 / 0 |
| Tile resources | 113 / 113 | 113 | 68 / 68 |

Network/cache variance changed original wait length; it did not change the cause. This fixes a presentation hold, not a measured CPU stall. Final desktop and touch each recorded 46 intermediate eased frames across three integer zoom events, maximum actual marker anchor error 0.0152 px, no page errors. Actual keyboard ArrowUp and CDP touch on the directional thumbstick both held throttle, moved the vehicle, and released cleanly. Screenshots inspected for both layouts.

Evidence: `test-artifacts/camera-profile/{before,before-repeat,after-final}/`; use `after-final` for the completed implementation. Earlier `after-repeat` captured a rejected implementation that scaled Leaflet's positioning transform; its anchor regression was fixed before the final run.

## Verification and limits

- Camera tests: initial red 3 new regressions, then green; later actual-browser anchor check exposed the counter-scale issue, followed by a focused red/green regression.
- `node --test tests/camera-zoom.test.cjs tests/gearbox.test.cjs tests/ems.test.cjs tests/desktop-editor-steering-regression.test.cjs`: **47 passed**.
- Syntax checks on both runtime files and profile script; scoped `git diff --check`: passed.
- Browser profile exits successfully with assertions for follow, anchor, easing and input. Re-run with NODE_PATH pointing at the bundled Playwright dependencies and `node tools/profile-dispatch-camera.cjs http://127.0.0.1:4203`; set `PTBO_CAMERA_OUTPUT` for evidence destination.
- Real tiles and input events, but a controlled synthetic speed/path; no physical phone, constrained hardware/network, live publication or complete Fire/EMS mission journey is claimed. The immediate-settle helper is unit-tested; native/manual zoom and reduced-motion browser journeys were not separately recorded.

Changed files: the two runtime modules above, `tests/camera-zoom.test.cjs`, `tools/profile-dispatch-camera.cjs`, and this report. Shared startup was briefly unavailable during concurrent training-data work; parent restored the missing Peterborough fixture before the successful final run. No shared startup edits were made here.
