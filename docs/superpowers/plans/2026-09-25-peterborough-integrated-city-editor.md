# Peterborough Integrated City Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-only, versioned asset editor to the real Peterborough City Explorer and publish the resulting city through the existing GitHub Pages URL.

**Architecture:** The existing City Explorer supplies a narrow adapter to an isolated editor subsystem. Authored objects and non-destructive overrides live in a geographic JSON scene document; generated source data remains unchanged. A protected publisher validates and commits scene versions, while public viewing remains static and independent of the publisher.

**Tech Stack:** Browser-native ES modules, Three.js r180 and TransformControls, HTML/CSS, Node.js test scripts, GitHub OAuth/App publishing, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-25-peterborough-integrated-city-editor-design.md`

## Global Constraints

- Preserve ordinary City Explorer behavior when edit mode is inactive.
- Use `project`, `unproject`, and `terrainHeightAtWorld` from `city-explorer/app.js` as the authoritative coordinate and ground-contact functions.
- Never rewrite generated GIS source files or terrain data.
- Never place a GitHub credential in browser code or committed files.
- Only the server-verified `edmondsonedits` account may publish.
- Public viewing must work when the authentication/publishing service is unavailable.
- Store authored positions as WGS84 longitude/latitude plus terrain-relative elevation.
- Use deterministic generated-object identities; never use transient traversal order as identity.
- Preserve unrelated untracked workspace files.

## Review Focus

- Invalid or future-version scene documents must fail safely without preventing the city from loading; Task 1 tests this.
- Rebuilding generated city content must preserve hide/replace overrides through deterministic IDs; Task 3 tests this.
- Pointer, wheel, and keyboard events must never drive and edit simultaneously; Task 5 tests this.
- Network, authentication, conflict, or deployment failures must retain recoverable work; Tasks 4 and 6 test this.
- Instanced/generated assets must become editable without mutating shared geometry or losing unrelated instances; Task 3 tests this.

---

### Task 1: Versioned Scene Document Foundation

**Files:**
- Create: `city-explorer/editor/scene-document.js`
- Create: `city-explorer/data/editor/peterborough-details.json`
- Create: `tools/test_city_editor_scene_document.mjs`

**Interfaces:**
- Consumes: plain JSON scene documents.
- Produces: `createEmptySceneDocument()`, `validateSceneDocument(input)`, `normalizeSceneDocument(input)`, `serializeSceneDocument(input)`, and `makeAuthoredObject(input)`.

- [ ] **Step 1: Write the failing scene-document test**

Test schema version rejection, non-finite transforms, duplicate IDs, coordinate bounds, stable normalization order, and a valid round trip. Import the functions from `scene-document.js` and assert that validation returns `{ ok, errors, document }` without throwing on malformed input.

- [ ] **Step 2: Run the test and verify failure**

Run: `node tools/test_city_editor_scene_document.mjs`

Expected: module-not-found failure for `city-explorer/editor/scene-document.js`.

- [ ] **Step 3: Implement the document module**

Use these public shapes:

```js
export const SCENE_SCHEMA_VERSION = 1;
export function createEmptySceneDocument() {
  return { schemaVersion: 1, city: 'peterborough-on', revision: null, updatedAt: null, objects: [], overrides: [] };
}
export function validateSceneDocument(input) {
  return { ok: errors.length === 0, errors, document: errors.length ? null : normalizeSceneDocument(input) };
}
```

Require UUID-like authored IDs, catalogue keys, finite transform numbers, longitude `[-78.55, -78.05]`, latitude `[44.15, 44.50]`, relative elevation `[-50, 500]`, scale `[0.01, 100]`, unique object IDs, and override operations `hide`, `appearance`, or `replace`. Strip unknown properties during normalization and sort objects/overrides by ID for deterministic commits.

- [ ] **Step 4: Add the initial empty document**

Create a schema-valid document with empty `objects` and `overrides`; do not add example objects to the live city.

- [ ] **Step 5: Run focused verification**

Run: `node tools/test_city_editor_scene_document.mjs`

Expected: all scene-document assertions pass.

- [ ] **Step 6: Commit**

Commit only the Task 1 files with message `Add versioned city editor scene document`.

### Task 2: Asset Catalogue and Authored Runtime

**Files:**
- Create: `city-explorer/editor/asset-catalog.js`
- Create: `city-explorer/editor/authored-runtime.js`
- Create: `tools/test_city_editor_catalog.mjs`
- Modify: `city-explorer/app.js` at the world-group declarations and `buildCity()` completion path.

**Interfaces:**
- Consumes: normalized scene documents and the adapter `{ THREE, project, unproject, terrainHeightAtWorld, authoredDetailGroup }`.
- Produces: `ASSET_CATALOG`, `createCatalogObject(assetKey)`, and `createAuthoredRuntime(adapter)` with `load(document)`, `upsert(record)`, `remove(id)`, `getObject(id)`, and `dispose()`.

- [ ] **Step 1: Write the failing catalogue/runtime test**

Assert that every catalogue entry has a stable key, label, category, default scale, placement offset, supported properties, and synchronous factory. Test that an authored object round-trips between WGS84 and world coordinates while preserving terrain-relative height.

- [ ] **Step 2: Run the test and verify failure**

Run: `node tools/test_city_editor_catalog.mjs`

Expected: module-not-found failure for `asset-catalog.js`.

- [ ] **Step 3: Implement the initial safe catalogue**

Provide procedural entries for tree, hydrant, streetlight, bench, traffic cone, road sign, barrier, utility box, and landmark marker using existing Three.js primitives/material conventions. Each factory returns a new `THREE.Group` so transforms never affect shared instances.

- [ ] **Step 4: Implement authored object materialization**

Convert longitude/latitude with `project`, set `y = terrainHeightAtWorld(x, z) + elevation`, apply rotation/scale, attach `userData.cityEditor = { kind: 'authored', id, assetKey }`, and add only to `authoredDetailGroup`.

- [ ] **Step 5: Integrate the authored group and published-document loader**

Create `authoredDetailGroup` beside existing world groups, add it to `world`, fetch `./data/editor/peterborough-details.json` after base city construction, validate it, and apply only a valid document. Loader failure must log a contained warning and leave the simulator ready.

- [ ] **Step 6: Run focused and existing city tests**

Run: `node tools/test_city_editor_catalog.mjs`

Run: `node tools/test_vertical_slice_quality.mjs`

Expected: both pass.

- [ ] **Step 7: Commit**

Commit Task 2 files with message `Render authored assets in Peterborough city`.

### Task 3: Deterministic Generated-Asset Overrides

**Files:**
- Create: `city-explorer/editor/generated-registry.js`
- Create: `city-explorer/editor/override-runtime.js`
- Create: `tools/test_city_editor_overrides.mjs`
- Modify: `city-explorer/app.js` where building, vegetation, landmark, street-furniture, and road objects are finalized.

**Interfaces:**
- Consumes: editable Three.js objects and normalized overrides.
- Produces: `makeGeneratedId({ sourceType, sourceId, geometry })`, `registerEditableObject(object, metadata)`, `getEditableRecord(id)`, and `applyOverrides(document, adapter)`.

- [ ] **Step 1: Write failing identity and override tests**

Pin identical IDs across object creation order, canonical coordinate rounding, hide/restore, replacement placement, and instance masking that leaves adjacent instances unchanged.

- [ ] **Step 2: Run the test and verify failure**

Run: `node tools/test_city_editor_overrides.mjs`

Expected: module-not-found failure for `generated-registry.js`.

- [ ] **Step 3: Implement stable identities and registry metadata**

Prefer source feature IDs. Otherwise hash a versioned canonical string containing source type plus rounded WGS84 geometry. Store editor metadata on selectable object roots and never derive identity from a scene index.

- [ ] **Step 4: Implement hide, appearance, and replacement overrides**

Hide toggles only the target. Appearance clones material before modifying supported properties. Replacement hides the original and materializes an authored object carrying `sourceTargetId`; removing the override restores the original.

- [ ] **Step 5: Register generated asset categories during city construction**

Register discrete buildings, trees, street furniture, landmarks, and individually addressable props. Register continuous roads as non-transformable targets supporting hide/appearance/replace only. Do not expose terrain, player, vehicle, camera, labels, survey markers, or gameplay trigger groups.

- [ ] **Step 6: Run focused and generation tests**

Run: `node tools/test_city_editor_overrides.mjs`

Run: `node tools/test_city_detail_rules.mjs`

Run: `node tools/test_gameplay_systems.mjs`

Expected: all pass.

- [ ] **Step 7: Commit**

Commit Task 3 files with message `Add persistent generated asset overrides`.

### Task 4: Command History and Durable Recovery Drafts

**Files:**
- Create: `city-explorer/editor/command-history.js`
- Create: `city-explorer/editor/draft-store.js`
- Create: `tools/test_city_editor_state.mjs`

**Interfaces:**
- Consumes: immutable before/after normalized scene documents.
- Produces: `createCommandHistory({ initialDocument, onChange })` and `createDraftStore({ storage, key })`.

- [ ] **Step 1: Write failing state tests**

Test bounded undo/redo, redo invalidation after a new edit, no-op suppression, corrupt local draft quarantine, base-revision mismatch reporting, storage quota failure, and recovery export.

- [ ] **Step 2: Run the test and verify failure**

Run: `node tools/test_city_editor_state.mjs`

Expected: module-not-found failure for `command-history.js`.

- [ ] **Step 3: Implement immutable command history**

Expose `execute(label, nextDocument)`, `undo()`, `redo()`, `canUndo`, `canRedo`, and `current`. Cap history at 100 commands and clone normalized documents at boundaries.

- [ ] **Step 4: Implement draft persistence and recovery**

Use key `ptbo-city-editor-draft-v1`, debounce writes, store base revision and timestamp, return explicit `{ status, document, error }` values, and provide `exportDraft()` and `discardDraft()` without throwing when storage is unavailable.

- [ ] **Step 5: Run the state tests**

Run: `node tools/test_city_editor_state.mjs`

Expected: all pass.

- [ ] **Step 6: Commit**

Commit Task 4 files with message `Add editor undo history and draft recovery`.

### Task 5: Integrated Editor UI and Input Isolation

**Files:**
- Vendor: `city-explorer/vendor/three-r180/examples/jsm/controls/TransformControls.js`
- Create: `city-explorer/editor/city-editor.js`
- Modify: `city-explorer/index.html`
- Modify: `city-explorer/styles.css`
- Modify: `city-explorer/app.js` around `wireEvents()`, mode changes, and animation.
- Create: `tools/test_city_editor_integration.mjs`

**Interfaces:**
- Consumes: the scene, authored runtime, generated registry, document history, draft store, raycaster, camera, canvas, and mode hooks.
- Produces: `createCityEditor(adapter)` with `initialize()`, `enter()`, `exit()`, `update()`, `selectById(id)`, and `dispose()`.

- [ ] **Step 1: Vendor the matching TransformControls module**

Copy only the r180 module from the exact Three.js package version already vendored. Preserve its license and verify that all imports resolve through the existing import map.

- [ ] **Step 2: Write the failing integration contract test**

Parse the HTML/module sources and assert the Editor entry point, panel controls, editor-only keyboard routing, adapter creation, update-loop call, published-document load, and absence of committed secrets. Add pure tests for pointer selection priority and protected-group rejection.

- [ ] **Step 3: Run the test and verify failure**

Run: `node tools/test_city_editor_integration.mjs`

Expected: failures for missing editor controls and module.

- [ ] **Step 4: Add the editor shell**

Add an Editor button, left asset/layer drawer, right inspector, top transform toolbar, bottom status/action bar, recovery dialog, and accessible labels. Keep panels hidden and inert outside edit mode. Use the existing visual language with stronger selection/status contrast.

- [ ] **Step 5: Implement editor entry, selection, and transforms**

On entry, exit pointer lock, safely stop player/vehicle movement, clear pressed inputs, suspend driving handlers, show panels, and attach TransformControls. Raycast registered editable roots only. Snapshot transform state on drag start and create one history command on drag end. Recompute WGS84 and terrain-relative elevation after transforms.

- [ ] **Step 6: Implement creation and object actions**

Place catalogue previews against terrain, click to commit, and support duplicate, delete/hide, restore, translate/rotate/scale modes, world/local coordinates, snapping, inspector numeric edits, layer visibility, search, undo, redo, and Escape to cancel the active gesture.

- [ ] **Step 7: Isolate simulator events**

All canvas pointer, wheel, pointer-lock, touch, and global shortcut handlers must check editor mode. Editor handlers stop propagation only while active. Exit removes gizmos/listeners and restores the prior simulator mode without reload.

- [ ] **Step 8: Update the single animation loop**

Call `cityEditor.update(delta)` from the existing loop; do not create a second renderer or animation loop.

- [ ] **Step 9: Run integration and regression tests**

Run: `node tools/test_city_editor_integration.mjs`

Run: `node tools/test_fly_controls.mjs`

Run: `node tools/test_gameplay_systems.mjs`

Expected: all pass.

- [ ] **Step 10: Commit**

Commit Task 5 files with message `Integrate asset editing into City Explorer`.

### Task 6: Owner Authentication and Git-Backed Publisher

**Files:**
- Create: `city-editor-publisher/package.json`
- Create: `city-editor-publisher/server.mjs`
- Create: `city-editor-publisher/auth.mjs`
- Create: `city-editor-publisher/github-publisher.mjs`
- Create: `city-editor-publisher/scene-validation.mjs`
- Create: `city-editor-publisher/README.md`
- Create: `tools/test_city_editor_publisher.mjs`
- Modify: `city-explorer/editor/city-editor.js`

**Interfaces:**
- Consumes: GitHub OAuth/App environment settings and complete candidate scene documents.
- Produces: `GET /auth/status`, `GET /auth/github`, `GET /auth/callback`, `POST /api/scene/versions`, and `GET /api/scene/versions/:commit/status`.

- [ ] **Step 1: Write failing publisher tests with mocked GitHub HTTP**

Test unauthenticated rejection, non-owner rejection, CSRF/origin rejection, invalid document rejection, stale SHA conflict, successful commit, GitHub failure mapping, rate limiting, and redaction of credentials from logs/responses.

- [ ] **Step 2: Run the test and verify failure**

Run: `node tools/test_city_editor_publisher.mjs`

Expected: module-not-found failure for the publisher modules.

- [ ] **Step 3: Implement server-side owner authentication**

Validate OAuth state, exchange the authorization code server-side, fetch the GitHub login, require exact case-insensitive login `edmondsonedits`, and issue a signed Secure/HttpOnly/SameSite cookie with a bounded expiry. Require exact configured City Explorer origin and CSRF token on writes.

- [ ] **Step 4: Implement validated Git publication**

Fetch the current `city-explorer/data/editor/peterborough-details.json` SHA, require it to match `baseRevision`, validate and deterministically serialize the candidate, then call the GitHub Contents API with a commit message containing the editor timestamp. Return `409` on SHA conflict and never log authorization headers.

- [ ] **Step 5: Connect Save Version and deployment status**

Save first writes the local recovery draft, then posts the candidate. On success display the commit SHA and poll the GitHub Pages deployment status with bounded backoff. Distinguish saved, deploying, live, conflict, auth-expired, and failed states. Failure never clears the draft.

- [ ] **Step 6: Document required deployment configuration**

List exact environment variable names, GitHub OAuth callback, minimum repository permission, allowed origin, health check, and secret-rotation procedure. Include no secret values.

- [ ] **Step 7: Run publisher and client tests**

Run: `node tools/test_city_editor_publisher.mjs`

Run: `node tools/test_city_editor_integration.mjs`

Expected: all pass.

- [ ] **Step 8: Commit**

Commit Task 6 files with message `Add owner-only city version publisher`.

### Task 7: End-to-End Polish, Deployment, and Live Verification

**Files:**
- Modify: `city-explorer/README.md`
- Modify: version query strings in `city-explorer/index.html`
- Create: `tools/test_city_editor_release.mjs`
- Add screenshots under `city-explorer/screenshots/` only when generated by the verified build.

**Interfaces:**
- Consumes: completed editor and publisher.
- Produces: a verified public City Explorer deployment with an owner-only editor flow.

- [ ] **Step 1: Add release assertions**

Verify every referenced module exists, no remote runtime dependency is introduced for public viewing, scene JSON is valid, source maps/secrets are absent, editor assets use pinned versions, and the GitHub Pages workflow still deploys the repository root.

- [ ] **Step 2: Run the full relevant test set**

Run the seven new `test_city_editor_*.mjs` scripts plus `test_vertical_slice_quality.mjs`, `test_city_detail_rules.mjs`, `test_fly_controls.mjs`, and `test_gameplay_systems.mjs`.

Expected: every script exits zero.

- [ ] **Step 3: Perform local browser acceptance testing**

Serve the repository over HTTP. Verify normal drive mode, editor entry, selection, each transform mode, catalogue placement, authored deletion, generated hide/replace/restore, undo/redo, local recovery, save error recovery, exit-to-driving, narrow layout, and zero uncaught console errors.

- [ ] **Step 4: Perform security acceptance testing**

Verify public/unauthenticated writes fail, a forged login fails, stale revision conflicts preserve work, credentials never appear in storage/network responses, and the public city loads with the publisher stopped.

- [ ] **Step 5: Commit release polish**

Commit with message `Polish and verify Peterborough city editor`.

- [ ] **Step 6: Integrate and deploy**

Push the verified commits to the repository branch selected for release, merge or fast-forward to `main` through the repository's normal policy, and wait for the existing Pages workflow to complete.

- [ ] **Step 7: Verify the live URL**

Open `https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/`, confirm the expected versioned HTML/JS/JSON are served, exercise the owner editor path, publish a harmless test object, reload the public city, confirm persistence, then remove the test object through the editor and publish the cleanup version.

- [ ] **Step 8: Record evidence**

Update the README with the owner workflow, recovery/export instructions, published commit SHA, test commands, and known operational dependency on the publisher for writes only.
