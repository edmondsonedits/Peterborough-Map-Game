# Repository quality audit — October 8, 2026

Baseline: GitHub main `4ff6f32c5e3954b64e9620f607249a2518cb248a`, production marker 1.6.98.
Implementation checkout: `repository-quality-audit`, branch `codex/refine-existing-modes`.
Other local checkouts and their uncommitted work are preserved.

## Purpose and scope
Refine the existing municipal street-learning and Fire/EMS training games. Preserve dispatch states, adaptive route learning, scoring, road authority, geographic coordinates, editor documents, provider attribution and licenses. No additional modes, training systems, engine replacement or publication. Relevant Codex/ChatGPT project history was consulted for purpose and architecture, then checked against current source.

## Coverage and baseline evidence
- Inventory: all 532 tracked files grouped by subsystem, exact duplicate hashes, local HTML resource references.
- Compile checks: all 290 JS/CJS/MJS files (including vendored code), 23 inline HTML scripts; 37 JSON/GeoJSON files parse. Zero syntax/data-parse failures or missing static HTML resources.
- Tunnel Break: all 13 current compressed chunks reconstructed; SHA256 matches its loader, 125256-byte HTML, all four inner scripts compile.
- Source review: launcher and shared startup/city/data/analytics authority; Geo Guesser round/filter/local+online-score paths and wrappers; directed Route Mapping graph/search/snapping/adaptive learning/input/settings; response startup/physics/steering/camera/dispatch/EMS; dispatch edit/export/base/hospital persistence; 3D active import-map/gameplay/surface/editor/splat/animation paths; compressed Tunnel Break input/session/loading.
- Independent focused reviewer inspected 3D driving/editor/resource ownership. Editor previews correctly clone geometry/materials before disposal.
- Raw Node suite: 155/167 pass. All 12 failures expect canonical release normalization (including the visual tutorial assertion); deployment already performs this prep.
- Tools suite: 66/67 pass. The surface-material test incorrectly requires perspective-only fields on orthographic capture definitions.
- Chromium baseline screenshots and startup receipts: launcher, Route Mapping, Geo Guesser core+desktop wrapper, response desktop+mobile, Dispatch Editor, 3D loading, Tunnel Break.
- Startup smoke is not a completed gameplay journey. 3D is still constructing the city at the baseline screenshot. Full journey checks follow implementation.
- Inventory/compile coverage does not mean every line has been manually reviewed or every possible game state is proven correct.

## Findings and decisions recorded before implementation
| ID | Area | Evidence and intended refinement |
|---|---|---|
| Q01 | Shared dispatch | Explicit script city parameter is ignored; Route Mapping pins Peterborough in its URL but a previously selected city can override it. Honor explicit script city selection. |
| Q02 | Geo Guesser | Timer calls rebuild progress HTML ten times/sec; filter selection reparses storage for every location. Cache progress by round/mode and read filters once per pool. |
| Q03 | Geo Guesser | Local scores accept malformed records and unlimited repeated saves; online upload re-enables Save after success. Validate local records, bound retained rows and prevent duplicate uploads per completed session. |
| Q04 | Geo Guesser | Three wrappers repeat their bootstrap; external Leaflet duplicates an already vendored dependency. Consolidate identical wrapper logic if comparison confirms equivalence; use local Leaflet. |
| Q05 | Route Mapping | pointercancel invokes onDrawEnd and snaps an interrupted stroke; cancelled/blurred drags retain state. Separate cancellation, release pointer ownership and restore map dragging. |
| Q06 | Route Mapping | Settings section lacks native modal keyboard/focus behavior; pinned notice covers the settings button. Use a native dialog and reserve control space. |
| Q07 | Route Mapping | Identical directed path searches recur during scoring, snapping and previews. Add a bounded per-graph route cache without changing graph topology, costs or learning. |
| Q08 | Response | Steering preference storage read/write can throw and prevent instrument readiness. Guard optional preferences. Frame loop repeatedly queries/writes telemetry even while idle. Cache nodes and update changed visible text at a modest rate. |
| Q09 | Dispatch editor | Hospital area updates memory and saves the base before persisting the area; a second storage failure leaves partial state. Validate and persist with rollback; preserve staged draft on failure. Correct quote escape and avoid double render on mode switch where safe. |
| Q10 | 3D driving | Crossing pavement at 27.5m/s clamps to 11.5m/s in 16ms. Apply bounded off-road deceleration without adding acceleration above the limit; preserve braking and reverse. |
| Q11 | 3D controls | Gamepad polling/actions run behind native dialogs. Neutralize gameplay controls and pause simulation while modal UI owns input. |
| Q12 | 3D surfaces | 150000-point ring throws from spread Math.min/max; four temporary coordinate arrays. Validate every ring and calculate bounds in one pass. Current data max ring 531, so not a current boot failure. |
| Q13 | 3D splats | Async unload nulls controller while load continuation reads it; stale completion can overwrite newer ownership. Capture controller, check identity after every await, dispose only owned resources. Null datum converts to 0 instead of terrain fallback. Current pilots have no approved assets, so dormant defects. |
| Q14 | 3D cleanup | setModeLegacy has no callers. Remove this superseded movement implementation. Preserve compatibility loader URLs whose removal could break cached pages. |
| Q15 | Tunnel Break | First-person keys survive focus loss; pointercancel can place a card; settings save throws when storage is blocked. Fix decoded source, repackage deterministically, update integrity digest and retain old cached chunk payloads. |
| Q16 | Capture tests | STATION_VIEWS includes baseView/orthographic definitions. Resolve inherited view and verify projection-specific bounds; preserve substantive camera assertions. |

## Existing strengths retained
Fixed-step response simulation; Fire/EMS handover lifecycle; directed routing and adaptive decisions; local editor/export authority; 3D instancing/tiling/LOD; independent road/terrain data; optional splat fail-open behavior; analytics privacy gate; licensing/provenance records.

## Verification and release boundary
Final evidence will record actual commands/results, named gameplay journeys, screenshots, measured work/resource changes and remaining external checks. Local improvements do not constitute a published release, physical-phone certification or a subjective 9/10 rating.

## Findings added during verification
These were recorded when the extended browser/retry/profile checks exposed them, then fixed with targeted regressions.
| ID | Area | Verified refinement |
|---|---|---|
| Q17 | City startup | All six alternate-city wrappers throw once because package creation runs before its parser-inserted factory. Shared station loader now preloads the factory; direct package fallback queues creation after it. Both paths preserve parser-time configuration. |
| Q18 | Cache delivery | Static pages and nested loaders used different historical cache tokens. Normalize active surfaces to local build 1.6.99 and inherit that token for changed nested dependencies; retain runtime protocol identities (especially response 1.6.17). |
| Q19 | Score retries | An uncertain Firestore write followed by retry could create another document. Retain one generated document reference per session, with a 100-session bound. Late completion retains the newer game's screen/button ownership. Tested with a mock, without production writes. |
| Q20 | Editor assets | Local Leaflet CSS references missing marker/layer images. Added the five official 1.9.4 distribution images under the existing license; editor browser requests now resolve locally. |
| Q21 | Desktop driving startup | The drivetrain frame callback reads velocity before the replacement iframe initializes it. Guard uninitialized state; real desktop startup and movement now pass. |
| Q22 | 3D repeated work | Idle HUD rewrites recreate prompt nodes and lose station identity; low-power resize raises its initial pixel budget. Update changed values only, preserve prompt children and active station label, retain 1.2 low-power cap. |
| Q23 | 3D render performance | Profiler and browser attribution found 13,144 invisible editor proxy submissions among 13,664 total draws. Keep picking layer on the raycaster, remove it from the render camera, and keep the 41,832 pick-only proxies outside the render tree with initialized world matrices. Picking/selection/hide/restore still use registry roots. |
| Q24 | Geo preferences | Guarded storage writes prevented a crash but discarded selected filters when storage was denied. Keep the selected filters for the current session and reset them correctly; persistent storage remains optional. |
| Q25 | UI overlays | Training notices obscured Route settings, Geo controls and the 3D city header. Reserve surface-specific space while retaining the existing notice and link. |

## Implemented refinements by mode
**Geo Guesser:** shared wrapper bootstrap replaces three copies; local Leaflet; clearer existing panels/buttons, visible focus and touch/safe-area handling; one filter read per call pool; progress DOM changes only when the round changes. Local score records are validated, capped at 100 and saved once per completed timed session. Optional online failure leaves practice usable. Retry-safe online saving and stale-session handling preserve the existing score schema.

**Route Mapping:** native settings dialog restores keyboard focus and Escape behavior; settings remain accessible. Interrupted drawing, lost capture and focus changes release input without snapping/committing. Directed path results use a 256-entry LRU scoped to graph identity and objective, with defensive result copies. A delayed snap cannot overwrite a newer exercise. The road graph and adaptive training decisions are preserved.

**Dispatch/response and driving:** Fire completion and EMS pickup/transport/handover are preserved and exercised. Optional steering preferences survive storage denial; telemetry nodes update at 100ms and only changed text is written; desktop reload startup no longer reads an uninitialized velocity. Existing fixed-step physics and desktop/mobile control contracts remain intact. Six base-training cities load through their existing shared wrappers without the factory exception.

**3D City Explorer/driving/editor:** off-road forward/reverse transitions use bounded deceleration; native modal UI pauses actor movement and latches held controller actions; large/invalid pavement rings are validated in one pass; stale splat requests cannot dispose replacements and missing elevation uses terrain. Removed the unused legacy mode function. HUD updates are idempotent and resize preserves low-power limits. Editor picking proxies are excluded from drawing and per-frame scene traversal while keeping exact source geometry, editing identity and transforms.

**Dispatch Editor:** hospital/base saves persist together with rollback on failure; runtime state changes only after successful persistence and staged drafts remain recoverable. Correct text escaping, avoid duplicate mode rendering and use the complete vendored Leaflet distribution. Edit/reload persistence was checked in an isolated browser context.

**Tunnel Break:** readable original game source now lives in tools/tunnel-break/game.html, with deterministic scripts/build-tunnel-break.cjs packaging and LF source line endings pinned in .gitattributes. Cancelled board pointers do not place cards; focus loss clears movement/joystick state; native dialogs own input/focus; denied settings persistence still applies settings for the session. New v311 chunks match the new integrity digest; original v31 chunks remain byte-identical so cached old loaders keep working.

**Shared/launcher/data/tools:** preserve explicit city selection, canonical release/cache delivery, provider attribution, geographic/dispatch data and analytics authority. Versioned compatibility forwarders remain because cached clients reference them. No extra mode, training subsystem or dependency was introduced.

## Final verification
Local build: **1.6.99**. Required checks passed against the final implementation:
| Check | Result |
|---|---|
| Node gameplay/analytics/release/asset tests | 195 passed, 0 failed |
| Editor/rendering/geospatial JavaScript tools suite | 72 passed, 0 failed |
| Python terrain tests | 4 passed, 0 failed |
| Whole working-tree inventory/compile | 568 files; 303 JS/CJS/MJS + 27 inline scripts compile; 37 JSON/GeoJSON parse; 0 missing static HTML resources |
| Release normalization and Tunnel Break rebuild | Byte-idempotent; current integrity digest matches readable source; original cached v31 payloads retain their original digest |
| Diff whitespace validation | git diff --check passed |
| Independent focused reviews | Active 3D/resource ownership, async/save/cache/bootstrap and final detached picking-group changes reviewed; no unresolved material findings |

Chromium journeys passed for launcher; real Route Mapping pointer drawing, cancelled stroke, settings/focus, submit/review and next call; complete 10-round desktop and mobile Geo sessions with local save deduplication; all three Geo wrappers with optional Firebase failure; desktop Fire and mobile EMS control movement; Fire completion and EMS pickup/transport/handover; editor edit/reload persistence and tabs; Tunnel board cancellation, maze focus loss and native modal Escape. Response arrival/hospital positions were set by the test to exercise lifecycle transitions, so this is not a claim of manually driving every road.

All six existing alternate cities passed direct parser loading, outer/inner city identity and Fire/EMS spawning at **65 bases**: Oshawa, Belleville, Scarborough, Pickering, Markham and Toronto. These remain base-training packages with dispatch deliberately unavailable.

Existing 3D station-driving and mobile portrait/landscape control checks passed; authored-scene reload produced no duplicates and missing/corrupt input used its fallback. Full-profile search dialogs paused movement and controller actions, and closing the dialog did not trigger a held action. Building and road picking, selection, hiding and restoration passed with mocked local owner authentication after proxy removal. Renderer attribution confirms **0 proxy draws and 0 per-frame proxy-group updates**, while preserving initialized world matrices.

### Measured 3D improvement
Same scripted station driving/modal scenario, Chromium headless with ANGLE D3D11, NVIDIA RTX 2070 SUPER, 1440×900 CSS pixels, device pixel ratio 1, full rendering profile, 10-second sample:
| Metric | Before picking-proxy fix | Final |
|---|---:|---:|
| Median FPS (uninstrumented timing) | 14.99 | 59.88 |
| p99 frame time | 83.4 ms | 16.8 ms |
| Draw calls at the stationary station pose | 13,664 | 520 |
| Editor proxy draw calls | 13,144 | 0 |

Final CPU-profiled full and lite samples both reached 59.88 median FPS / 16.8ms p99, with 520 and 480 draws respectively. This measurement covers this scene/device; it is not a universal frame-rate guarantee. Original geometry, detail, shadows and texture settings remain intact. No visual-quality reduction was used for the improvement.

Other deterministic work reductions: 100 unchanged Geo timer ticks produce one progress DOM render; an eligible-call pool reads filters once; repeated identical directed paths reuse the cached result and return independent arrays; 100 unchanged 3D HUD frames produce no additional text/HTML writes. These are targeted regression measurements rather than invented whole-application speed percentages.

### Reproducing the evidence
Start the local preview with `node tools/serve-quality-preview.cjs 4188`. Browser tools require Playwright/Chromium (the configured workspace runtime supplied them during this audit).
```powershell
node scripts/normalize-release.cjs
node scripts/build-tunnel-break.cjs
node --test tests/*.test.cjs tests/*.test.mjs
node --test tools/test_*.mjs tools/geospatial/test_*.mjs
python tools/geospatial/test_official_lidar_terrain.py
node --experimental-vm-modules tools/audit-repository.cjs
git diff --check
node tools/check-quality-journeys.cjs
node tools/check-quality-base-cities.cjs
node tools/check-quality-render-groups.cjs
node tools/check-quality-city.cjs
node tools/check-quality-performance.cjs
```
Browser screenshots, JSON receipts, profiles and logs are under ignored `test-artifacts/quality-audit/`. The render-group diagnostic exposes scene objects only through a test response override; production source does not expose those diagnostic globals. Its owner-auth response is a local fixture, and it performs no external publisher writes.

## Remaining validation boundaries
- Changes are local on the isolated branch; nothing was pushed, merged or deployed. The public GitHub Pages build is not represented as fixed by this local audit.
- Physical-phone testing and human recruit playtesting were not performed; mobile results are Chromium viewport/touch tests.
- Real Firebase writes/scoreboard permissions and authenticated publisher deployment were not exercised. Firebase API compatibility uses the existing collection/schema and documented [v8 CollectionReference.doc](https://firebase.google.com/docs/reference/js/v8/firebase.firestore.CollectionReference#doc); behavioral retry tests used a mock.
- Optional provider requests can fail: existing 3D driving QA recorded noncritical external HTTP 403 console messages while packaged city data and movement stayed usable. No critical runtime/request failure was recorded by those checks. This does not certify every live provider.
- Splat ownership fixes use controlled async fixtures because the current pilots have no approved live splat asset. They are not a claim of asset approval or live splat validation.
- No finite audit proves every possible state or assigns an objective 9/10 rating. This delivery is grounded in documented defects, focused fixes, complete automated suites, actual gameplay journeys and measured rendering improvement.
