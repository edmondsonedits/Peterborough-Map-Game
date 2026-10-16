# City training and driving release v1.6.113

## User benefit

- Geo Guesser keeps Next Call available during practice and after a miss; Try again retains the missed address. Skips never count as correct/completed answers, and rapid duplicate advances are guarded.
- Driving camera follows the vehicle while the next integer tile level warms. Zoom presentation eases for 280 ms without adding tile requests or moving Leaflet's vehicle anchor. Duplicate incident notices no longer obscure the phone map; the build badge uses the actual release.
- Ontario MOHSERLO long-term-care records are prioritized for EMS in eligible Geo, Route Mapping and Dispatch pools. The shared policy normally chooses the care-home group with 70% probability when both groups are available, avoids immediate repeats where possible, and retains general practice. EMS Geo includes care homes at every recognition tier with their true difficulty labels. Fire's existing catalog is preserved.
- Route Mapping supports all 33 listed cities, using selected-city roads, bases, projection and saved progress. All loading failures have a retry path. Care-home metadata and script loading are bounded and retryable.

## Geographic contracts

The 32 new road extracts retain OSM way IDs, geometry, access and one-way direction from the Geofabrik Ontario snapshot dated 2026-09-27. Peterborough retains its existing periodically refreshed public-road asset and source manifest. Visual tiles are separate from routing and training data. Attribution and source checksums are retained. Extract bounds are training extents, not municipal boundary polygons.

There are 329 city-scoped long-term-care records (some overlapping city entries refer to the same facility), sourced from Ontario MOHSERLO on 2026-10-16. Matching canonical civic addresses within 100 m retain their original identity, coordinates and difficulty; additional homes are EMS-only. The snapshot is not a complete or real-time inventory.

Directed coverage checks cover 606 selectable bases: 604 have a reachable eligible destination. Ten driveway-access failures now select a connected public-road start 12.2–48.2 m from the original spawn, within the existing 260 m limit. Exact segment anchors remain consistent through scoring and drawing. No station coordinates changed.

Toronto Island Fire 335 and EMS 59 have no reachable destination in the current catalog. They are labelled and disabled for Route Mapping; no mainland connection is invented. Continuous practice falls back to a usable station with an explanation if the previous arrival cannot reach another call.

The route comparison is labelled “Shortest mapped route”: it honors mapped one-way travel but does not model OSM turn-restriction relations, temporary closures or operational emergency routing. Existing dispatch availability remains unchanged: Peterborough supports the complete dispatch/hospital workflow; six other cities offer base-driving previews with calls unavailable; other cities do not advertise dispatch. Belleville and Scarborough currently have Route Mapping but no Geo mode.

## Verification

- Main behavioral suite: 455 passed. Editor/geospatial Node checks: 111 passed. Python geographic/terrain checks: 6 passed. Syntax and diff checks passed.
- Real Chromium: Fire and EMS Route Mapping in every city, 66/66 journeys, using disclosed reference-trace fixtures and actual Submit/Next/settings controls. Separately, actual mouse and emulated touch drawing, submission, next and clear passed in Peterborough and Toronto; deliberate road-request failure and Retry passed.
- Directed base coverage: 606 origins; 138 production A*/trace-finish routes passed; exactly the two documented Island origins are unavailable. Barrie repaired access and Toronto disabled-origin UI passed browser inspection.
- START/CALL framing measures visible overlays and reserves a 30 px gutter. Full marker bounds cleared all panels at 390x844, 667x375 and 1280x800 for initial, Next and terminal-arrival fallback states; the map refits on resize.
- Geo: all 30 additional city demos, both services and recognition tiers, five viewports; seven desktop/phone/online Next/Try Again and keyboard journeys passed.
- Dispatch: Fire and EMS drive/input/release and call completion passed. Care-home-only filter journeys selected sourced homes and completed pickup/hospital transport on desktop and emulated phone. Arrival positions were set by the test. Six existing base-preview cities passed service/spawn and availability checks.
- Desktop/narrow editor, 3D truck entry/exit and flight controls, local dispatch editor persistence and Tunnel gameplay passed their separate browser journeys. The local editor check emulates its approved hosting origin.
- Sol Medium independently reviewed shared EMS/data loading and directed route access; actionable findings were resolved. The terminal-arrival regression passed independent recheck.
- Commercial readiness audit passes with eight existing guarded-provider warnings. The audit reads Geo's extracted app module and excludes unpublished test artifacts; Route Mapping uses the exact public-demo OSM tile endpoint.

Camera's comparable controlled browser path reduced the desktop's longest stationary map follow from 1516.6 ms (316.6 ms in a repeated baseline) to 16.6 ms. Desktop/phone RAF maximum was 16.8 ms, with no long tasks. Tile requests stayed 113/68 and marker anchor error stayed below 0.016 px. The integrated v1.6.113 retest reproduced those results. This measures a presentation freeze, not a CPU stall. Physical devices, constrained mobile networks and operational response suitability are not certified.

## Evidence and release

Local receipts and screenshots are under `test-artifacts/city-expansion/`, including `all-routes-final`, `toronto-pointer`, `geo-focus-final`, `care-dispatch`, `camera-integrated`, `base-coverage-fixed`, `city-final` and `final-journeys`. The comparable baseline is under `test-artifacts/camera-profile/`. These are intentionally excluded from publication.

Release target is GitHub Pages from `main`, using canonical v1.6.113. Publication is authorized; fresh deployed checks and source hashes are recorded separately in `test-artifacts/city-expansion/live/`. The separately hosted 3D editor is unchanged by this release and retains its own deployed version.
