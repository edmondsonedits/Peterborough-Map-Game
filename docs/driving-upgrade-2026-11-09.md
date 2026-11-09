# City Explorer driving upgrade

Implemented locally from `b9847f52` on `codex/driving-upgrade-20261109`. No public deployment or world-data rebuild was performed.

## Controls and features

- **View / C / Settings:** existing chase views plus Cab and Bonnet. Cab uses a lightweight windshield/dashboard frame. The local exterior is hidden only for the attached-camera render and restored afterward. Looking around remains available.
- **Map:** street map by default, with 3D and satellite alternatives. Player and truck markers include the local predicted position and driver names. Enter a truck, open Map, then enable **Drive on map**. Keyboard and the touch joystick operate the same vehicle; the map follows it. Disable the toggle to browse. Find me recentres the map.
- **Training call:** a simulated alarm at the existing Peterborough City Hall landmark. It works from all three halls, shows direction/distance and a destination marker, and completes when a truck stops within 60 metres. Each player's training-call lifecycle is local; the destination is the same for everyone. This does not dispatch a real emergency.
- **Lite:** select Settings → Lite, use `?quality=lite`, or open `city-explorer/lite/`. The same roads, dimensions and collision rules remain in use. Lite reduces render resolution, road/scenery radii, tree counts and background work; it omits optional facade openings, photographic detail, decorative shader detail and rooftop equipment.

## Handling and networking

Pumpers share their handling; the longer Aerial accelerates and turns more slowly, while Medi accelerates and steers more quickly with a 120 km/h cap. Midpoint integration reduces differences between frame rates. These are believable gameplay tunings, not calibration against physical apparatus measurements.

Remote presentation adapts its buffer to delivery jitter, with a bounded extra delay and monotonic render cursors. Fresh local controls now appear in the next rendered preview without waiting for the next 30 Hz network tick or adding network messages. Actual elapsed frame time reaches multiplayer prediction even when visual animation delta is capped.

**Multiplayer protocol is now version 2. Client and server must be released together.** An older server is rejected with a compatibility message rather than silently using different movement rules. World geometry/version remains unchanged.

## Verification

Commands and repeatable browser checks:

```powershell
node --test tests/vehicle-handling.test.mjs tests/multiplayer-client-runtime.test.mjs tests/multiplayer-integration-boundary.test.mjs
node tools/check-driving-upgrade.mjs
node tools/check-multiplayer-driving-upgrade.mjs
node tools/benchmark-driving-profiles.mjs
```

Browser tools use the local static server on 4199 and multiplayer server on 2569. Artifacts are under `artifacts/driving-upgrade`, `artifacts/multiplayer-driving-upgrade` and `artifacts/driving-profile-benchmark`.

The full test run retains three unrelated failures in unchanged source/data: Toronto supplemental-call provenance source hash, and Belleville/Scarborough preview station-roster parity. These must be resolved before claiming a completely green repository release. No expected hashes or station data were changed to conceal them.

Browser emulation is not physical older-phone testing, and localhost multiplayer is not a WAN latency measurement. No claim of zero lag or guaranteed phone frame rate is made.

### Final results

- Full repository suite: **1,504 passed, 3 failed, 1,507 total**. The failures are the unchanged data checks described above; the full output is `artifacts/driving-final-tests.txt`.
- Desktop and 390 × 844 touch smoke: cab/chase switching, all map layers, keyboard/touch map driving, Lite entry point, and starting the same training call from halls 1, 2 and 3 passed, with no page errors. Arrival distance and stopped-vehicle requirements are covered by unit tests.
- Two-client multiplayer smoke: protocol 2, both seats joined, 8 truck markers and 1 on-foot marker, desktop and touch map controls, remote vehicle motion, and restoration of the previous single-player mode passed. No page errors. Tile/analytics requests aborted during page closure are retained in the report.
- Fresh integration review found and resolved the protocol compatibility boundary, attached-camera clipping reset, and distant 3D map scenery focus.
- A final 30-second mobile map check verified the dispatch banner fits the viewport. External OSM imagery could not load in this environment: 0 of 18 requests succeeded, with DNS/offline errors. The existing retry limit and error message worked. Layer switching and overlays passed, but successful online street/satellite imagery is not established by these checks; the built-in 3D map remains available.
- The built-in 3D map fallback was visually checked in Lite at 390 × 844 with map driving enabled: roads, buildings, truck markers, touch controls and the training banner were visible, with no page errors. Screenshot: `artifacts/driving-upgrade/mobile-map-3d.png`.

Settled Station 1 scene, headless Edge, 390 × 844 viewport, identical device scale:

| Metric | Balanced | Lite |
| --- | ---: | ---: |
| Startup to usable gameplay, one run | 19.15 s | 11.96 s |
| Median / 95th-percentile frame | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| Draw calls | 310 | 233 |
| Triangles | 1,885,777 | 1,301,255 |
| Geometry objects | 454 | 276 |
| Textures | 18 | 5 |
| Rendered canvas pixels | 329,160 | 138,644 |

Lite reduced draw calls by 25%, triangles by 31%, and rendered pixels by 58% in this scene. Startup timing is a single local run, not a download or physical-phone benchmark. The profile tool and JSON preserve reproducibility.

### Local preview and release boundary

The local preview runs at `http://127.0.0.1:4199/city-explorer/?multiplayerServer=http%3A%2F%2F127.0.0.1%3A2569`. For Lite, use the same query at `/city-explorer/lite/`. The local multiplayer backend listens on port 2569. The explicit server query matters because the existing public backend uses the prior protocol.

This is a focused driving/multiplayer implementation and related regression pass, not a line-by-line audit of every repository. It remains a local branch, with no public release or upload. A public release needs coordinated protocol-2 client/server deployment and fresh live verification.

## Publication preparation: v1.6.201

The release branch now incorporates main through `0dd33ca3` (v1.6.200), preserving four-seat crews, aerial actions, vehicle selection, Rescue 1, Car 1, the latest solo full-lock steering, and newer call/location changes. Crew identities are included in truck map labels. The server health response and Pages gate now require protocol 2 as well as matching world data.

The merged full suite passed 1,555 of 1,556 tests; the remaining failure is the unchanged Toronto supplemental-call provenance hash check. The additional crew-map regression passed. The latest live pair observed before this release was frontend v1.6.200 and shared world `42e7a6191e02736c34910091` on both Pages and Render. Publication remains pending until the final assets, backend deployment and Pages checks complete.
