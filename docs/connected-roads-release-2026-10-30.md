# Connected roads release - 2026-10-30

Release: v1.6.153. Source base: a105632703a88917789e936b71a59654b3351224. Road pack: b7790afc289c024c2519.

## Result

The existing GIS simulator is retained. Generated roads now use connected clipped ribbons and shared junction polygons, a common triangulated height field and terrain-safe approach heights. Municipal pavement boundaries and holes remain authoritative. Bridges, tunnels and distinct source levels retain separate surfaces. A shared terrain envelope checks the intersections of the road and terrain triangles, preventing terrain or the grass overlay from covering pavement between height samples. Vehicle contact uses the same finished Float32 faces as rendering. Curbs follow the finished pavement.

White/yellow longitudinal paint, dashes, mapped arrows and crossings are flat and draped onto final pavement. Source semantics and genuinely unmarked roads are preserved. The renderer supports stop bars, but the current source contains no explicit stop-bar locations; these were not guessed. Inventory: 185 source arrows, 183 mapped crossing features, four reviewed Sherbrooke way corrections. This is not a survey of every physical lane marking. Twenty-seven ambiguous source junction clusters retain conservative source geometry instead of forcing an unsupported union.

## Graphics and delivery

Graphics settings offer Low, Balanced and High; Balanced is the default. Each profile uses the same road geometry, contact and physical terrain grid. Canonical ground uses 56 m target spacing with at most 340 segments; resolution, visibility and shadows supply the graphics quality differences. Pixel density, visibility, shadows and resident tile radius vary. This reserves resources for later detailed buildings, doors, windows, textures and grass; those future additions are outside this road release.

| Profile | Pixel ratio cap | Road load / retain radius | Shadows |
| --- | ---: | ---: | --- |
| Low | 0.85 | 650 / 1000 m | Off |
| Balanced | 1.10 | 900 / 1350 m | Off |
| High | 1.65 | 1450 / 1950 m | On |

Road geometry is compiled offline into 669 content-addressed compressed tiles. The browser loads nearby tiles with three concurrent requests, pins the truck region, disposes evicted geometry/contact data and waits at an unloaded tile boundary. Three later asset failures trigger source-mode recovery with the stopped truck pose preserved. Pack/source identity mismatches use the source renderer. The small manifest is fetched fresh so returning browsers can accept a newer valid pack even when their static build hint is cached. Large tile URLs remain content-addressed and cached.

Pack totals: 58,900,639 compressed bytes; 259,127,768 raw packet bytes; 3,580,760 triangles across the whole region. Coplanar municipal fragment optimization removed 3,345,183 of 6,925,943 input triangles (48.3%). Seven ambiguous buckets retain original geometry. These are road-only figures, not total application memory. Actual resident sets depend on camera movement, retention and the pinned truck region; final profile measurements are recorded in the browser QA report.

## Verification

- Full related automated suite: 1,174 passed, zero failures/skips; saved at artifacts/road-rebuild/full-tests-final.log.
- The pack fingerprints 42 road/terrain/compiler/data inputs. Road-pack verifier decodes every tile and checks raw/transport hashes, exact counts, conservative bounds, source identities and version module.
- Both previously occluded Sherbrooke points pass in the decoded final packets: 0.213416 m and 0.207253 m above the canonical ground; packet/source height differences below 0.0000001 m.
- Exact before evidence uses detached source base a105632 with matched overhead and truck-eye views: artifacts/road-rebuild/baseline-exact/report.json.
- Final visuals: 21 matched views across Low/Balanced (430x900) and High (1500x950); loading overlay hidden and actual camera pose checked. Root inspected repaired truck-eye and intersection captures; High road shadows are visible.
- Graphics controls: Balanced default, all three choices, Apply/restart and saved preference passed.
- Driving: named Lansdowne Street West, Ashburnham Drive, Parkhill Road West, Hunter way 177049271, a physical T-junction and a physical four-way. Valid components total about 934 m, all four tires on pavement and zero unloaded-tile frames. Straight-road departure <=0.216 m; both turn departures <=2.267 m. Turns use a bounded 4 m source-spine gate because the fire truck has a finite turning radius; the controller was corrected before accepting the full crossings.
- Two obsolete tile-prefetch cancellations during route teleports are recorded separately; no unexpected first-party HTTP errors or page exceptions. The external Firebase analytics 403 is outside road loading.
- Postboot three-404 recovery passed: preserves X/Z, heading and driving mode, snaps height to source pavement, removes the resume parameter, and dismisses the overlay. A reporting-only variable-scope error occurred after navigation; all terminal observations were preserved and independently requalified by raw-report SHA-256. The observer also exceeded its short readiness wait under software rendering; no recovery latency or physical-phone performance claim is made.
- Live deployment commit, workflow and fresh response hashes are recorded by the publication receipt at artifacts/road-rebuild/publication-receipt.json.

Desktop Chromium software WebGL and narrow viewports do not establish physical-phone frame rate, thermal behavior or peak memory. Physical-phone measurements remain unperformed. This release preserves source geographic uncertainty instead of moving roads or inventing lane evidence.

Final local qualification: artifacts/road-rebuild/final/report-final-composite.json; all gates passed. The hidden loading overlay uses display:none so a stalled transition cannot obscure a completed recovery. A real-browser paused-transition regression failed before this CSS fix and passed afterward.

## Maintenance and rollback

Run tools/build-road-pack.cjs against a local server after a road source change, then tools/verify-road-pack.mjs. The geospatial refresh workflow rebuilds and verifies the pack before committing refreshed data. Pages CI verifies the pack and excludes test/tool/diagnostic artifacts from publication. A successful main geospatial workflow completion deploys the latest main commit, including bot-generated pack updates. Compiler-owned prior compressed packets are pruned only after their saved transport hashes match.

The normal URL loads the new roads. Diagnostic legacy rendering is available with ?roadSurface=legacy&roadPack=0&roadAppearance=legacy; use quality=high to request the former full graphics budget. The isolated development checkout and exact before checkout are preserved under H:/ChatGPT.
