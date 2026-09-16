# Peterborough 3D Map Editor workboard

This folder is the development home for a browser-based object-placement editor for the existing `city-explorer` Three.js world. The editor is not intended to replace authoritative GIS, OSM, terrain, road, water, or building generation. It adds a reviewable authored-detail and correction layer that can be imported by the simulator.

The initial `index.html` is deliberately a non-destructive development shell. Complete the sessions below in order. Normal ChatGPT High Reasoning may edit this folder in short sessions; Codex will later review, integrate, test, and finalize the editor against the live simulator.

## Definition of success

An editor user can load the Peterborough world, choose an approved asset, place it, select it, move/rotate/scale it, switch between coarse/fine/free snapping, inspect exact values, undo mistakes, save a local draft, and export a deterministic scene document. The simulator can read that document and recreate the same objects at the same geographic positions and orientations.

## Non-negotiable boundaries

- Preserve static GitHub Pages compatibility: no server, database, secret, or build step is required at runtime.
- Do not edit generated GIS payloads by hand.
- Do not replace the simulator's authoritative terrain, roads, water, or building footprints.
- Keep editor-authored objects in a separate, versioned scene document.
- Store portable geographic coordinates (`lat`, `lon`, and terrain-relative height), not only Three.js world coordinates.
- Use stable IDs and deterministic serialization; reopening an unchanged file must not alter it.
- Treat asset provenance and licence status as data. Only approved production assets may be exported for gameplay.
- Avoid remote CDN dependencies. Reuse the vendored Three.js version in `city-explorer/vendor/`.
- Keep gameplay controls and editor controls isolated. The editor must never activate inside the normal player page accidentally.
- Maintain keyboard accessibility and a usable desktop layout. Mobile editing is not required for version 1.
- Never deploy, merge, delete existing data, or rewrite unrelated files during these sessions.

## Target files and modules

Keep responsibilities separated so Codex can integrate or replace parts safely:

```text
map-editor/
  index.html                 editor page and accessible controls
  styles.css                 editor-only layout and visual states
  app.js                     small composition/bootstrap module
  editor-state.js            selection, mode, settings, dirty state
  scene-schema.js            validation, migration, serialization
  command-history.js         undo/redo command stack
  world-adapter.js           loads city context and coordinate conversion
  asset-catalog.js           approved placeable asset metadata
  object-factory.js          creates preview/runtime Three.js objects
  selection-controller.js    raycast selection and outline
  transform-controller.js    move/rotate/scale and snapping policy
  persistence.js             local draft plus JSON import/export
  tests/                     pure browser-independent module tests
city-explorer/data/editor/
  peterborough-details.json  future reviewed production scene document
```

Names may change when technically necessary, but do not collapse the editor into the already-large `city-explorer/app.js`.

## Version 1 scene contract

Use this as the starting contract. Document any change and add migration logic before altering saved data.

```json
{
  "schemaVersion": 1,
  "sceneId": "peterborough-authored-details",
  "coordinateSystem": "WGS84+terrain-relative-meters",
  "updatedAt": "2026-09-15T00:00:00.000Z",
  "objects": [
    {
      "id": "hydrant-station-1-east-001",
      "assetId": "hydrant-red-standard",
      "position": { "lat": 44.301234, "lon": -78.321456, "heightOffsetM": 0 },
      "rotationDeg": { "x": 0, "y": 92.5, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "surfaceMode": "terrain",
      "source": { "kind": "manual-review", "reference": "", "note": "" },
      "tags": ["streetscape", "fire-service"]
    }
  ]
}
```

Required validation includes unique IDs, known asset IDs, finite numeric values, Peterborough-area coordinate bounds, positive scale, supported surface modes, and a recognized schema version.

## Work that needs to be completed

- [ ] Document the simulator/editor integration seams and coordinate conversions.
- [ ] Define, validate, migrate, and deterministically serialize the scene format.
- [ ] Build a small approved asset catalog with provenance fields and safe primitive fallbacks.
- [ ] Load a read-only city context using the same packaged data and terrain sampling as the simulator.
- [ ] Provide orbit/perspective and top-down orthographic views.
- [ ] Implement raycast selection, visible selection feedback, focus-selected, and deselection.
- [ ] Implement move, rotate, and scale transform modes.
- [ ] Implement coarse, fine, and free snapping with independently configurable translation and rotation increments.
- [ ] Implement automatic terrain contact and an explicit height offset.
- [ ] Add a numeric transform inspector with geographic and world-coordinate readouts.
- [ ] Add object duplication, deletion, locking, visibility, stable names, and an object hierarchy/list.
- [ ] Add an asset palette with search, categories, thumbnails/fallback icons, and click-to-place.
- [ ] Add command-based undo/redo for every scene mutation.
- [ ] Add keyboard shortcuts without interfering with text fields.
- [ ] Add layer visibility/locking for terrain, roads, buildings, vegetation, landmarks, and authored details.
- [ ] Add local draft recovery and explicit new/open/import/export actions.
- [ ] Add validation and a human-readable export report before download.
- [ ] Add dirty-state and destructive-navigation warnings.
- [ ] Add tests for schema, snapping, history, coordinate round trips, ID generation, and deterministic export.
- [ ] Verify desktop usability, resizing, error states, and performance with hundreds of authored objects.
- [ ] Integrate the reviewed scene loader into `city-explorer` behind an explicit feature flag.
- [ ] Document the authoring, review, licence, integration, and rollback workflow.

## How to use the prompts

Run one numbered prompt per normal ChatGPT High Reasoning session. Give ChatGPT access to the `edmondsonedits/Peterborough-Map-Game` GitHub repository. A session should aim for approximately ten minutes of focused work, but correctness and a clean stopping point matter more than the clock.

Before every session, tell ChatGPT to inspect the current repository state because previous sessions may have changed the implementation. After every session it must update the progress table at the bottom of this document with the date, files changed, checks run, result, and next recommended session. It must not claim checks it did not run.

### Shared preamble for every session

Paste this before the numbered prompt:

> Work in the GitHub repository `edmondsonedits/Peterborough-Map-Game` using High Reasoning. Read `map-editor/README.md` completely, inspect the current versions of all files you will touch, and preserve unrelated work. Spend about 10 minutes on only the requested session. Make the smallest coherent implementation that leaves the page loadable. Keep static GitHub Pages compatibility, use the vendored Three.js modules, do not add CDN dependencies, do not deploy or merge, and do not modify generated GIS data. Add or update focused tests when practical. At the end, summarize exactly what changed, what you verified, any uncertainty, and update the progress table in `map-editor/README.md`. If the requested work is already complete, verify it and improve its tests or documentation rather than duplicating it.

## Ten-minute High Reasoning prompts

### Session 01 — Architecture and integration survey

> Inspect `city-explorer/index.html`, `city-explorer/app.js`, `city-explorer/data-loader.js`, `city-explorer/fly-controls.js`, `city-explorer/terrain-heightmap.js`, `city-explorer/semantic-survey.js`, `city-explorer/landmark-models.js`, and the vendored Three.js layout. Write `map-editor/INTEGRATION-NOTES.md` identifying reusable imports, world/geographic conversion functions, terrain-height access, scene groups, data-loading order, input-control conflicts, and the safest editor entry point. Recommend exact interfaces rather than implementing the editor. Flag anything that should be extracted from `app.js` instead of copied. Keep the work scoped to documentation.

### Session 02 — Scene schema and deterministic serialization

> Implement `map-editor/scene-schema.js` as a browser-compatible ES module. Define constructors/defaults, strict validation with useful errors, normalization, schema-version handling, and deterministic serialization for the version 1 contract in the README. Do not silently repair invalid coordinates or unknown assets. Accept an injected set of known asset IDs so the module remains decoupled. Add focused Node tests under `map-editor/tests/scene-schema.test.mjs` and run them if the environment permits.

### Session 03 — Coordinate adapter design

> Using the integration notes, implement the smallest reusable coordinate conversion module needed by both the editor and simulator. Prefer extracting an existing pure calculation to a shared module over copying formulas, but do not refactor unrelated rendering code. Cover WGS84 latitude/longitude to local Three.js X/Z and the inverse, plus terrain-relative Y semantics. Add round-trip tests with representative Peterborough coordinates and document precision expectations.

### Session 04 — Editor state model

> Implement `map-editor/editor-state.js` as a small observable state container for current document, selection, transform mode, coordinate space, snap preset, layer visibility/locking, dirty state, and user-facing errors. Keep Three.js objects out of serializable document state. Define narrow actions and subscriptions; avoid a framework. Add tests for legal transitions, selection cleanup, and dirty-state behavior.

### Session 05 — Command history

> Implement `map-editor/command-history.js` with bounded undo/redo stacks and commands for add, remove, transform, duplicate, and metadata edits. Consecutive drag updates must be coalescible into one undo step. Redo must clear after a new mutation. Keep the API independent of the DOM and Three.js. Add tests covering coalescing, redo invalidation, object restoration, and the history limit.

### Session 06 — Asset catalog contract

> Implement `map-editor/asset-catalog.js` with a small starter catalog of safe procedural/fallback assets already supportable by the repository: tree, streetlight, hydrant, bench, traffic sign, fence segment, and generic prop marker. Each record needs a stable ID, category, dimensions, placement rules, provenance/licence status, tags, and preview metadata. Export search/filter helpers. Do not invent licensed production models or external URLs. Add validation tests for unique IDs and required metadata.

### Session 07 — Three.js viewport bootstrap

> Replace the 2D placeholder canvas behavior with a minimal Three.js editor viewport using the repository's vendored modules. Create a scene, renderer, camera, lights, grid/ground reference, resize handling, render loop, and clean disposal path. Keep composition in `app.js` and rendering setup in a focused module if appropriate. Display a useful in-page error if WebGL or a module fails. Do not load the full city yet.

### Session 08 — Editor camera controls and view presets

> Add desktop orbit/pan/zoom camera controls and explicit Perspective and Top view presets. If the vendored Three.js package lacks a suitable control module, implement only the minimal pointer controls needed without adding a CDN. Add Focus Selection behavior at an interface level even if selection is not implemented yet. Prevent browser context menus or page scrolling only within the viewport. Document controls in the UI.

### Session 09 — Object factory and preview primitives

> Implement `map-editor/object-factory.js` to create editor preview objects for the starter asset catalog. Every created root must carry stable editor metadata and have predictable origin, dimensions, shadows, and disposal behavior. Use original procedural geometry and existing approved internal resources only. Add a visible missing-asset fallback instead of failing silently. Keep serialization data separate from runtime Three.js objects.

### Session 10 — Asset palette and placement mode

> Make the asset panel functional: searchable/filterable catalog, accessible asset buttons, active placement state, pointer ghost preview, Escape cancellation, and click-to-place on a simple ground plane. Generate a stable object ID and route the addition through command history. Do not implement full terrain loading in this session. Ensure selecting UI controls never places an object in the viewport.

### Session 11 — Selection and visual feedback

> Implement `map-editor/selection-controller.js` with raycast selection of authored object roots, empty-space deselection, additive selection only if the state model already supports it, visible outline/bounds feedback, and Focus Selection. Selection helpers must not be exported in scene JSON. Resolve nested mesh hits back to the stable authored-object root. Add tests for the pure hit-to-root resolution logic.

### Session 12 — Transform gizmos

> Add move, rotate, and scale gizmos for the selected authored object. Reuse vendored Three.js `TransformControls` if available; otherwise implement a small equivalent without external dependencies. Support world/local coordinates where sensible, disable camera controls during a gizmo drag, and record the completed drag as one undoable transform command. Prevent negative or zero scale.

### Session 13 — Coarse, fine, and free snapping

> Implement snapping as a pure policy module plus UI settings. Provide named Coarse, Fine, and Free presets with independently configurable translation, vertical, rotation, and scale increments. Apply snapping consistently to gizmos and numeric edits. Show the active increments near the viewport. Add unit tests for positive/negative values, angle wrapping, free mode, and floating-point stability.

### Session 14 — Inspector and precise numeric editing

> Build the inspector for selected-object identity, asset type, latitude, longitude, terrain-relative height offset, world X/Y/Z, rotation degrees, scale, surface mode, tags, source reference, and notes. Use labeled numeric inputs with appropriate precision and validation. Commit one undoable command per completed field edit rather than per keystroke. Clearly distinguish calculated/read-only values from editable values.

### Session 15 — Terrain and packaged city context

> Using `INTEGRATION-NOTES.md`, load the minimum read-only packaged Peterborough context needed for accurate placement, prioritizing the same coordinate origin and terrain-height implementation as `city-explorer`. Add progress and recoverable error states. Snap authored objects to rendered terrain plus `heightOffsetM`. Do not duplicate the full simulator or manually alter terrain data. If extracting shared code is unsafe in ten minutes, implement and document a narrow adapter seam instead of copying a large block.

### Session 16 — Reference layers and layer controls

> Add a layer list for terrain, roads, buildings, vegetation, landmarks, semantic survey references, and authored objects. Provide visibility and editor-lock toggles without mutating source data. Only authored objects may be transformed. Preserve layer choices locally as editor preferences, not in the exported world scene. Ensure locked or hidden layers do not interfere with selection raycasts.

### Session 17 — Hierarchy and object operations

> Build a searchable authored-object list with stable names, type icons/fallback labels, visibility, lock state, selection synchronization, duplicate, and delete. Route mutations through command history and make keyboard Delete safe around text inputs. Implement deterministic duplicate IDs and a small positional offset so copies are visible. Add empty and large-list states.

### Session 18 — Keyboard shortcuts and interaction safety

> Add a centralized shortcut controller for transform modes, snap presets, undo/redo, duplicate, delete, focus selection, save draft, and Escape. Ignore destructive or mode-switch shortcuts while typing in form fields. Display a shortcut-help dialog. Audit pointer capture, camera/gizmo conflicts, accidental object placement, and modal focus behavior.

### Session 19 — Local drafts and recovery

> Implement `map-editor/persistence.js` for explicit New, Save Draft, Restore Draft, and Clear Draft using local browser storage. Validate and migrate on read, surface quota/parse errors, and never overwrite a good draft with invalid state. Add dirty-state navigation protection. Keep autosave conservative and clearly indicate when and where data was saved.

### Session 20 — JSON import and export

> Implement file import and deterministic JSON download export. Validate imported documents before replacing current work, present a concise error report, and require confirmation before discarding dirty work. Before export, report object count, unapproved assets, missing sources, warnings, and errors. Block production-ready export when licence status or schema validation fails, but allow a clearly labeled draft export.

### Session 21 — Production scene loader seam

> Design and implement a small, feature-flagged loader seam for `city-explorer` that can read a reviewed editor scene document and instantiate supported assets through a shared/runtime-safe factory. Keep the flag off by default and make missing/invalid files fail open so the existing city still loads. Avoid editor UI imports in the player bundle. Add a fixture and focused tests; do not enable production gameplay yet.

### Session 22 — Test and fixture expansion

> Review the editor modules and add the highest-value missing automated tests: schema migrations, coordinate round trips, deterministic output, command history, snapping, ID generation, invalid imports, and player-loader fail-open behavior. Add a small valid scene fixture and several intentionally invalid fixtures. Use the repository's existing test style and avoid introducing a heavy test framework unless already present.

### Session 23 — Accessibility and responsive desktop QA

> Audit the editor page for keyboard navigation, visible focus, labels, error announcements, color contrast, dialog focus, reduced motion, and layouts at common desktop and small-laptop sizes. Fix concrete problems found. Mobile authoring is out of scope, but small screens should show an honest unsupported/editor-needs-desktop message rather than a broken interface.

### Session 24 — Performance and lifecycle QA

> Profile or reason through the editor with at least 500 authored objects. Fix obvious per-frame allocations, unnecessary raycast targets, leaked geometries/materials/listeners, and excessive DOM rerenders. Add lightweight diagnostics for FPS, draw calls, triangle count, and authored-object count behind an explicit debug option. Do not prematurely optimize city data outside the editor.

### Session 25 — Documentation and review handoff

> Review all completed editor work without expanding scope. Update `map-editor/README.md` with actual controls, file format, limitations, authoring workflow, licence review, test commands, integration steps, rollback, and known issues. Reconcile the checklist and progress table with repository reality. Produce `map-editor/CODEX-FINALIZATION.md` listing blockers, risky areas, incomplete tests, intentional shortcuts, and the exact steps Codex should take before enabling the editor scene in the simulator.

## Optional later sessions — do not begin before version 1 is stable

- Road-edge, curb, wall, vertex, and object-surface snapping.
- Multi-select, group transforms, alignment, and distribution.
- Path-based repeated placement for lights, trees, barriers, or fence segments.
- Reference-image overlays with explicit calibration and provenance.
- Asset thumbnail rendering and a reviewed asset-import pipeline.
- Front/side orthographic views and configurable viewport layouts.
- Scene review comments, approval states, and diff visualization.

## Progress table

Normal ChatGPT should append one row per completed session.

| Session | Date | Status | Files changed | Checks run | Notes / next step |
|---|---|---|---|---|---|
| Planning scaffold | 2026-09-15 | Complete | `map-editor/index.html`, `styles.css`, `app.js`, `README.md` | Static inspection | Begin Session 01. |
