# All-city Dispatch Simulator implementation plan

> For agentic workers: use superpowers:executing-plans or subagent-driven-development to execute bounded tasks. Preserve concurrent work.

**Goal:** Complete, verify and publish Richmond Hill-equivalent Dispatch Simulator demos for every registered city.
**Architecture:** Extend the existing shared city-package factory and shared simulator. Supply sourced city data and explicit capability settings; do not fork the gameplay engine per city. Reuse local call pools and existing road assets. Preserve canonical source records separately from modeled access/spawn/driving-area corrections.
**Tech stack:** Static JavaScript, Leaflet, GeoJSON/gzip, Node regression tools, Playwright and GitHub Pages.
**Spec:** User-approved 23-item Richmond Hill parity checklist in this chat, covering map/roads, width/corner handling, bases/areas/spawns/access, controls/camera, calls, dispatch lifecycle, EMS transport, routing/review/history, readiness and release verification.

## Constraints
- H: access only under H:/ChatGPT.
- Reuse current v1.6.170 baseline 4bf2f300; preserve later upstream changes before publishing.
- One focused Luna agent normally. Parent handles integration and shared runtime. Use Sol review only for unresolved high-impact reasoning, not routine inventory.
- No invented facilities, hospital entrances, coordinates or official response assignments. Model training access explicitly and retain provenance.
- Every city must actually run missions; menu/capability flags alone do not establish completion.
- Saved user base edits remain authoritative over changed defaults.

## Tasks
- [x] 1. Build a repeatable all-city inventory (tools/audit-all-city-dispatch.cjs). Record registry/package/manifest capabilities, road assets, active eligible base counts, fitted areas, local call pools and sourced hospital candidates. Output ignored QA JSON for decisions.
- [x] 2. Implement generic all-city dispatch capability configuration with meaningful regression coverage. Enable city-specific road graph loading, response dispatch, correct demo menus and full service lifecycle. Keep selected-city loading only.
- [x] 3. Resolve hospital candidates against source records and connected road access. Configure per-city destinations; support cases needing a destination outside the city extent only with adequate sourced road coverage. Verify every offered EMS call-to-hospital leg.
- [x] 4. Audit and fit all active base driving areas, spawns and exit connections. Reuse existing reviewed records. Use building/parking imagery or suitable source geometry for missing fits; retain evidence and flag unresolved facilities rather than blindly filling default squares.
- [x] 5. Generalize Richmond Hill workflow QA to every city. Check each base's offered calls on the actual directed graph, both services, base area containment/access, real short keyboard/touch input, camera, corner/off-road checks, completion, hospital transition, route review/history and next call. Keep fixture-driven long arrivals distinguished from actual drives.
- [ ] 6. Fix all exposed failures, run related regression/CI checks, review material risks, update release/cache versions, integrate latest upstream, publish and verify live assets and city workflows. Do not mark goal complete while a required city remains unresolved.

## Review focus
Disconnected islands and road components; hospital points outside city road coverage; planned/ineligible bases; generic or incorrect base/parking coordinates; stale city/package capability mismatches; partial gzip load or unsupported decompression; city-scoped user edits; large city startup/memory cost; differences between directed suggested routes and unconstrained driving rules.

## Initial state
Implementation branch codex/all-city-dispatch in the existing clean isolated checkout H:/ChatGPT/Dispatch-Intersection-Parity-20261031. Inventory agent owns only its audit script and ignored QA output. Runtime/data implementation awaits the concrete inventory so changes address actual deficits.
