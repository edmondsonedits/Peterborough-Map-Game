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
- [x] JavaScript syntax and HTML parsing checks pass.
- [x] Pure unit tests pass.
- [x] Deterministic local Chromium smoke journey completes the structure-fire call without JavaScript exceptions.
- [x] No-scroll checks pass at 360×800, 390×844, 412×915 and 768×1024.
- [x] Twelve accelerated call reset/cleanup cycles return to three baseline map entities and zero active traffic.
- [ ] Playwright package/browser execution in repository CI is not yet configured; a Playwright spec is included.
- [ ] Real Esri imagery and full Peterborough road-data browser QA must be performed outside deterministic test mode.
- [ ] The requested 20-minute repeated-call soak remains pending manual/runtime QA.
- [x] Production remains unmerged and undeployed.

## Current limitations

- Phase 1 traffic follows local connected road segments rather than full routed destinations.
- Traffic yields by slowing/stopping; a full pull-to-curb manoeuvre is deferred.
- The hose is a simple map polyline and does not collide with scenery.
- Non-flagship incident records remain present but do not yet have Phase 4 depth.
- The local automated browser path uses an embedded test network and Leaflet fallback so it cannot prove real Esri tile performance.
