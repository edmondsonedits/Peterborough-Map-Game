# Existing-mode refinement implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; one focused reviewer handles the final diff.

**Goal:** Refine all existing modes with verified bug fixes, smoother input/movement, reduced repeated work and clearer layouts.
**Architecture:** Keep existing loaders, directed routing, local data stores, Leaflet and Three.js. Small changes at existing ownership boundaries.
**Tech Stack:** Static HTML/CSS/JS, Node built-in test runner, vendored Leaflet/Three.js/Spark, Chromium/Playwright.
**Spec:** ../specs/2026-10-08-existing-mode-refinement.md

## Global constraints
- Preserve geographic coordinates/heights, road direction/costs, saved data schemas and Fire/EMS progression.
- No new modes or product subsystems; no dependencies added; no publication.
- Route cache: graph identity, objective and node pair; at most 256 entries.
- Audit findings are the task brief; reproduce before fixing logic.

## Review focus
Cancelled multi-touch/blur must not commit actions; stale async completion must not dispose a replacement; storage denial must leave games usable and saves honest; native dialogs must own controller input and restore focus; repeated rounds/routes must not accumulate DOM/layers/cache.

## Tasks
- [x] 1. Shared city selection and Geo Guesser: add failing city/round/storage regressions; honor pinned city, hoist filter reads, cache progress, validate/bound/deduplicate scores; compare and consolidate wrapper bootstraps; use vendored Leaflet; refine existing CSS.
- [x] 2. Route Mapping: browser-reproduce cancellation and obstructed settings; add cancellation/graph-cache checks; native settings dialog, blur/cancel reset, bounded route cache; preserve directed paths and adaptive learning.
- [x] 3. Response/editor: add storage failure regressions; guard steering preference reads/writes, throttle idempotent telemetry; transactional hospital persistence and safe editor text escaping.
- [x] 4. 3D: regressions for large/invalid rings, off-road transition, null elevation, unload/reload async races and modal controller input; fix and remove verified dead legacy mode code.
- [x] 5. Tunnel Break and final gates: reproduce interrupted input/settings failure in decoded game; amend and regenerate current payload/hash; correct capture test schema; normalize canonical release, run suites/compile/diff/browser gameplay, independent diff review, fix material findings, save final evidence.

Pre-flight: shared city selection is consumed by Route Mapping and Geo wrappers; keep explicit pinned city authoritative. Geo wrapper score context is consumed by Firebase adapter; preserve existing fields and add completion/session identity only for validation/deduplication. No road/coordinate/editor-schema interface changes.

Final evidence: docs/audits/2026-10-08-repository-quality.md. All five packets completed locally; integration/publication remains outside this request.
