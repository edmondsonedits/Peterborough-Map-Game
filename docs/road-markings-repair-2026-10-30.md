# Map-wide marking repair — v1.6.156

The marking renderer now builds continuous offset paths across compatible road sections. Stroke joins share their cross-sections, and dash/gap distances use actual path length rather than restarting at every GIS segment. A 0.15 m stroke and nominal 4.2 m dash / 6.3 m gap remain consistent through bends and compatible way splits. Closed loops fit a uniform period; real junction cuts remain deliberate.

Connectivity requires an explicit shared source node and compatible lane, direction, cycle-lane, width and grade rules. Reversed one-way sections cannot be joined. Existing reviewed Sherbrooke rules, geographic source IDs, and documented traffic classifications remain authoritative. This repair does not invent stop-bar locations absent from the source evidence.

Paint is clipped against the road's exact contact triangles, excluding parking and unrelated bridge levels. A final offline pass runs after contact-mesh optimization, repairs same-grade overlapping surfaces, and rejects unsupported fragments. Road-contact positions are held fixed during this paint-only pass. The pack and whole-map visible-surface verifier run in both asset and Pages workflows before publication.

Balanced remains the default. It now enables antialiasing with a 1.35 pixel-ratio cap; Low uses 0.85 without antialiasing, and High uses 1.65 with antialiasing. Existing streamed-road residency and shadow settings are retained. The prebuilt tiles keep mesh generation and final projection out of ordinary phone startup.

## Verification and integration

The initial candidate `7cd20aa5f649cfdcaa44` passed 1,270,607 non-tiny paint-triangle surface checks with zero missing-support or clearance failures. All 669 contact-tile hashes and 2,579,249 contact triangles matched its baseline. Phone emulation at 390×720 with mobile/touch input passed Low, Balanced and High checks; the normal chase camera, truck and HUD were visible. Touch input moved the truck 4.87 m and turned it 0.088 radians. Water Street, Charlotte, George Street and reviewed Sherbrooke captures were inspected manually.

Concurrent upstream commits `25dd821` (mobile camera/controls and city demos) and `8b77b1e` (city-data refresh) are preserved. The combined release uses v1.6.156 and a fresh complete road compile against those inputs. The merged full suite passed **1,230 tests**, with no failures or skips. Syntax, whitespace and both workflow YAML checks passed.

Phone validation is Chromium mobile emulation with software WebGL, not a measurement of physical-phone frame rate, battery use or thermals. Thin Charlotte intersection lane stubs also existed in the baseline layout; source-derived street geometry is preserved. The bridge screenshot selector was strengthened to use Hunter Street East's mapped deck rather than an arbitrary nearby bridge-tagged road.

Final pack and live-publication receipts are recorded under `artifacts/road-markings/` and phone captures under `artifacts/road-markings-phone/`; artifacts are excluded from the public site.

## Final merged pack

Fresh build `36b7a55cc7f18125b16e` contains 669 tiles, 4,412,858 total triangles, 75,827,778 compressed bytes and 319,015,588 raw bytes. All 47 source fingerprints and all packet hashes pass verification. The whole-map visible-surface gate checks 1,270,607 non-tiny paint triangles, with zero missing-support, below-clearance or above-clearance failures; the 13,094 triangles below 1 mm² are recorded separately. Measured clearance is 6.17–23.86 mm.

All 669 road-contact hashes match upstream pack `68f98099cd11cd8afdc4` at commit `8b77b1e`: 2,579,249 contact triangles and 1,698 contact groups, with zero changed, missing or new tiles. During final paint projection, 18.94 m² (0.034% of paint area) at unsupported or overlapping boundaries is omitted rather than emitted without valid pavement support.

Final merged phone run `artifacts/road-markings-phone/final-156/report.json` passes every assertion for pack `36b7a55cc7f18125b16e`. Balanced captures all five contexts; Low and High capture Water Street. All seven final PNGs were manually inspected after the normal ready toast expired. Hunter Street East deck is explicitly source-validated as `way/33954231:0` (Ashburnham Bridge, layer 1). Actual onscreen touch entry and joystick input move the truck 4.783 m and turn it 0.0872 radians while remaining on-road. No page, first-party request or road-tile failures occur.
