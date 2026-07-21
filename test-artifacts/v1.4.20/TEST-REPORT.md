# Peterborough Map Game v1.4.20 test report

Branch: `codex/test-v1.4.20`

This is an isolated test build. Production was not modified, merged, or deployed. The immutable test URL is generated from the published commit and is supplied in the delivery report.

## Playable inventory and status

| Game / entry point | Modes reviewed | Status | Coverage |
| --- | --- | --- | --- |
| Main menu | Normal and developer mode | Working, fixed | All cards, gating, returns, reopen flow, responsive layout |
| Dispatch Simulator | Desktop, mobile, camera test | Working, fixed | Complete call, three station spawns, camera modes, routes, route comparison, options, controls, recovery |
| Geo Guesser | Open Drill, City Ten, Random Shift | Working, fixed | Complete rounds, every station, guesses, results, filters, scoreboard fallback, restart and exit |
| City Explorer | Map and Fly | Working, fixed, developer-only | Load, search, dialog close, mode switching, sound, responsive controls |
| Dispatch Editor | Search and edit dialog | Working, fixed, developer-only | 135-row load, filter, open/close edit form, desktop/mobile layout, return flow |

## Repairs and improvements

- Fixed first-launch simulator failure caused by the camera checkbox being removed before the legacy animation loop read it.
- Fixed wrapper initialization races that could run against the iframe's initial `about:blank` document or before simulator/Geo Guesser globals existed.
- Fixed mobile route-comparison close behavior, duplicate route-engine loading, compact top placement, unrelated-control hiding, and control restoration.
- Fixed precise timer drift by basing elapsed time on `performance.now()` and stopping stale driving input on blur or page hide.
- Kept Fixed Map and Driving View terminology and verified repeated switching does not change truck coordinates.
- Kept the mobile camera control inside Options; desktop retains the map camera control.
- Reorganized simulator options into Calls & Deployment, Vehicle & Camera, and Map & Diagnostics groups.
- Set lane-centering assistance to 60% and retained Directional mobile steering as the default.
- Corrected Geo Guesser text encoding, station coordinates, exact ten-call Random Shift behavior, timer lifecycle, round cleanup, mobile End Drill access, short-landscape scrolling, and developer-only editor gating.
- Added call-filter reset and robust persisted-filter/score parsing.
- Made Firebase settings merge-safe and retained a usable empty/offline scoreboard state.
- Fixed City Explorer's search-dialog Close action and confirmed cached building, road, terrain, and elevation data load.
- Gated both City Explorer and Dispatch Editor behind developer mode and protected the editor from direct normal-mode access.
- Removed redundant mutation observation and prevented duplicate script/listener installation paths.
- Added a shared v1.4.20 test-build marker, error capture, and the visible `TEST BUILD — v1.4.20` badge to all 11 HTML entry points.
- Updated runtime, cache, analytics, dispatch, camera, collision, route, readiness, voice, and instrument build metadata to v1.4.20. Historical filenames remain unchanged to avoid breaking stable URLs.

## Data validation

- 135 dispatch calls parsed.
- 135 unique IDs; no duplicate IDs or duplicate call identities.
- No missing required fields, malformed coordinates, or out-of-bounds Peterborough coordinates.
- District counts: Station 1 = 69, Station 2 = 27, Station 3 = 39.
- Nearest-station audit found zero district mismatches.
- City Ten contains exactly 10 eligible calls.
- Simulator, Geo Guesser desktop/mobile/online, and Dispatch Editor use the same shared dispatch store.

## Manual browser coverage

- Responsive sizes: 375x667, 390x844, 430x932, 667x375, 844x390, 932x430, 768x1024, 1024x768, 1366x768, and 1920x1080.
- Main menu tested at all ten sizes with no horizontal overflow and no `KM/H` display.
- Simulator tested through a full call and post-call review; all station spawns, desktop/mobile options, mobile controls, route reveal/comparison, camera controls, and ten repeated camera-mode switches were checked.
- Truck latitude/longitude deltas during camera switching were zero; measured screen alignment error remained subpixel.
- Geo Guesser completed Open Drill, City Ten, and Random Shift; filters persisted and reset; all stations appeared; mobile portrait/landscape exit and scrolling were checked.
- City Explorer loaded 6,500 buildings and 63,035 total features, reached a steady 60 FPS after startup, searched for Lift Lock, switched modes, and toggled sound.
- Dispatch Editor loaded 135 records/markers, filtered to a single known record, and opened/closed its edit form.
- Return, reopen, refresh, and developer-mode flows were exercised.

## Automated checks

- `node tools/audit-v1.4.20.mjs`
- `node --check` across all JavaScript files
- JSON parsing/format validation for cached geospatial manifests
- Local-reference coverage for every HTML entry point
- Source encoding/mojibake scan
- Shared dispatch decompression, schema, ID, coordinate, district, and City Ten checks

## Known limitations and review notes

- Native device multi-touch, vibration, and coarse-pointer behavior could not be fully emulated in the in-app desktop browser; responsive touch targets and pointer handlers were inspected and exercised where possible.
- A test score was not written to the live Firebase collection, to avoid polluting production data. Read connectivity, empty-state behavior, and failure fallback were verified.
- Cloudflare Analytics correctly remains idle without a site token; application startup and gameplay remain usable.
- The in-app browser instrumentation emits a source-less MutationObserver error during navigation even on pages with no application MutationObserver. The v1.4.20 error capture records zero application errors on tested pages.
- City Explorer and Dispatch Editor remain experimental/developer-only and need product review before any decision to expose them to players.
- Historical component filenames such as `smooth-driving-camera-1.4.19.js` remain for URL compatibility; their active runtime build metadata is v1.4.20.

No known critical or high-severity application bugs remain in the tested build.
