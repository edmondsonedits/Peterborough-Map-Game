# Connected Peterborough Roads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Ship connected, smooth, attractive, phone-efficient Peterborough road surfaces and paint to the live simulator.
**Architecture:** A pure connected-surface builder owns clipped road ribbons, junction faces and shared approach heights. A common draped marking layer uses final pavement. A versioned tile pack precomputes expensive geometry and streams nearby meshes/contact data with bounded resource lifetime.
**Tech Stack:** Existing Three.js r180, ES modules, Node tests, Playwright, GitHub Pages.
**Spec:** docs/superpowers/specs/2026-10-30-connected-roads-design.md

## Global Constraints
- Preserve GIS XY, IDs, widths, lane/source semantics, bridge levels, stations, input and editor bindings.
- Keep all H: access and all new project files under H:/ChatGPT.
- No invented location-specific lanes, turns, crossings or stop bars. Retain missing evidence explicitly.
- Actual rendered Float32 surface owns tire contact. No cosmetic collision bumps.
- Preserve concurrent upstream edits; never force-push. Physical-phone evidence is distinct from desktop lite.

## Review Focus
- Short source segments and close junctions cannot over-trim ribbons or open holes.
- Same-XY bridge/tunnel nodes cannot merge or select a wrong deck.
- Tile edges, fast turns and asset failures cannot remove pavement beneath the truck.
- Markings cannot float above final pavement or bridge unmapped islands/holes.
- Source data refreshes cannot silently reuse a stale baked road pack.

### Task 1: Connected geometry and shared approaches
**Files:** city-explorer/connected-road-surface.js, tests/connected-road-surface.test.mjs; optional focused road-network.js changes.
**Interfaces:** buildConnectedRoadSurface(roadLines, options) returns line surface/foundation triangle batches, junction polygons, mouth trims and diagnostic counts. Pure data; no scene or app mutations.
- [x] Write failing tests for T/skew/four-way, continuation/bends, very short chains, width transitions, grades and stacked crossings.
- [x] Implement deterministic shared-mouth clipping and matching boundary heights; retain source IDs and coordinates.
- [x] Verify topology, area coverage, finite triangles, shared seams and existing road tests.

### Task 2: Unified draped markings
**Files:** city-explorer/road-paint-geometry.js, tests/road-paint-geometry.test.mjs; street-paint.js if needed.
**Interfaces:** pure symbol/strip projection helpers accept final pavement sampler; triangle arrays are grouped and carry stable source identity.
- [x] Write failing tests for arrows, combined arrows, crossings, stop bars, dashes, sloped surfaces and missing support.
- [x] Implement flat draped geometry with consistent offsets and bounded subdivision; preserve existing evidence policy.
- [x] Verify geometry on actual indexed triangles and existing paint/source rules.

### Task 3: Integrate canonical roads and prebuilt tile loading
**Files:** city-explorer/app.js, city-explorer/road-tile-pack.js, city-explorer/road-tile-stream.js, tools/build-road-pack.cjs, generated city-explorer/data/road-pack/*, tests/road-tile-pack.test.mjs.
**Interfaces:** versioned source-hashed manifest plus per-tile Float32 geometry/metadata; runtime loader owns tile contact and GPU lifetime.
- [x] Test roundtrip, tile seams, readiness, bounded eviction, failed loads and stale-data fallback before implementation.
- [x] Integrate connected geometry before ribbons; register the same triangles for driving and paint and retain editor identity.
- [x] Integrate all paint after final pavement, record available/missing evidence counts.
- [x] Generate deterministic citywide road tile assets offline, use same pack in full/lite and retain diagnostic legacy fallback.
- [x] Verify runtime startup, valid drives/turns and overhead/truck-eye screenshots in full/lite; record telemetry.

### Task 4: Review and live release
**Files:** relevant regression tests, docs/connected-roads-release-2026-10-30.md, shared/build-version.js, normalized release markers, .github/workflows/deploy-pages.yml where required.
- [x] Run relevant road/GIS and release-critical tests, syntax and whitespace checks.
- [x] Independent architecture/code and visual review; resolve blocking findings with targeted regression tests.
- [ ] Refresh upstream, preserve ancestry, bump/normalize release and push authorized finished change.
- [ ] Verify Pages workflow success and fresh live build/pack hashes plus browser smoke. Record physical-device and geographic evidence limits honestly.
