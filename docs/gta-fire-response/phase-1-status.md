# Phase 1 Status

Last updated: 2026-08-04  
Version: `0.4.0-phase1`  
Branch: `agent/gta-fire-phase-1-foundation`

## Milestone status

- [x] Baseline implementation inspected and defects recorded.
- [x] Scoped `AGENTS.md` added.
- [x] Named state machine and capped fixed-step simulation added.
- [x] `?debug=1`, `?seed=`, `?call=structure`, and `?test=1` paths added.
- [x] Normalized eight-direction on-foot movement added.
- [x] Safe door-area enter/exit and input edge handling added.
- [x] Direct-stick truck handling, speed-sensitive steering and controlled reverse added.
- [x] Development tuning panel and persisted defaults added.
- [x] Swept nine-point vehicle footprint and intersection-aware road resolution added.
- [x] Cadenced camera, look-ahead, zoom hysteresis and delayed zoom-in added.
- [x] Capped pooled civilian traffic and emergency yielding added.
- [x] Emergency lights, two procedural siren modes and horn added.
- [x] Collapsible/repeatable subtitle dispatch and directional guidance added.
- [x] Flagship structure-fire compartment, hose, extinguisher, aim and suppression loop added.
- [x] Pause, restart, return-to-station and accessibility settings added.
- [x] Final modular JavaScript syntax, HTML parsing, CSS imports, local assets and HTTP serving checks pass.
- [x] Pure unit tests pass: 7/7.
- [x] A deterministic local Chromium smoke journey on the completed runtime reached call completion with zero JavaScript exceptions.
- [x] No-scroll checks passed at 360×800, 390×844, 412×915 and 768×1024.
- [x] Desktop driving was captured at 1366×768; mobile start, driving and on-scene states were captured.
- [x] Twelve accelerated call reset/cleanup cycles returned to three baseline map entities and zero active traffic.
- [ ] A browser rerun after splitting the unchanged tested stylesheet into four imported modules was blocked by the managed Chromium `URLBlocklist` policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). Static import validation and HTTP serving pass, but that final packaging rerun is not counted as browser evidence.
- [ ] Playwright package/browser execution in repository CI is not yet configured; a Playwright spec is included.
- [ ] Real Esri imagery and full Peterborough road-data browser QA must be performed outside deterministic test mode.
- [ ] 1920×1080 manual layout verification remains pending.
- [ ] The requested 20-minute repeated-call soak remains pending manual/runtime QA.
- [x] Production remains unmerged and undeployed.

## Recorded deterministic browser results

- Start button enabled after road loading.
- Eight-direction on-foot movement confirmed.
- Repeated enter/exit flow reached truck mode correctly.
- Direct-stick test reached 82.8 km/h.
- Three civilian vehicles were active during the driving sample.
- The structure-fire equipment and suppression loop completed.
- Result panel displayed.
- JavaScript exceptions: 0.
- Accelerated reset cycles: 12.
- Post-reset entities: 3.
- Post-reset active traffic: 0.

## Current limitations

- Phase 1 traffic follows local connected road segments rather than full routed destinations.
- Traffic yields by slowing/stopping; a full pull-to-curb manoeuvre is deferred.
- The hose is a simple map polyline and does not collide with scenery.
- Non-flagship incident records remain present but do not yet have Phase 4 depth.
- The local automated browser path uses an embedded test network and Leaflet fallback, so it cannot prove real Esri tile performance or real-world road-width alignment.
