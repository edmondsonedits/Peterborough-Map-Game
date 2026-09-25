# Peterborough Integrated City Editor Design

## Purpose

Add a polished owner-only editor to the existing Peterborough City Explorer so the owner can create, select, move, rotate, scale, duplicate, hide, replace, and delete visible city assets in the real simulator world. Published edits must persist across devices and deployments, while ordinary visitors retain the current public driving experience.

The editor must use the simulator's existing scene, geographic projection, terrain sampling, camera, and renderer. It must not recreate Peterborough in a separate grid or fork the city runtime.

## Success Criteria

- The public City Explorer includes a visible **Editor** entry point.
- Only the allowlisted owner account can enter edit mode or write changes.
- Editor mode operates inside the same rendered Peterborough scene as driving mode.
- Discrete authored and generated city assets can be selected and edited.
- Generated assets remain reproducible: edits are represented as persistent overrides rather than destructive changes to generated source data.
- Explicit saves create durable, versioned repository snapshots.
- Published edits appear at the existing City Explorer URL after the existing GitHub Pages deployment completes.
- Driving controls and editor controls cannot operate simultaneously.
- A failed save or deployment does not damage the last published city version.
- Previous published versions can be restored through Git history.

## Scope

### Editable

- Editor-authored props and landmarks.
- Existing discrete buildings, vegetation, street furniture, landmarks, and other addressable scene objects.
- Position, terrain-relative elevation, rotation, scale, visibility, editor label, and supported appearance properties.
- Create, duplicate, delete, replace, undo, and redo operations.
- Generated roads and other continuous GIS features through hide, appearance override, or replacement operations where direct transform editing would break connected geometry.

### Protected

- Terrain source geometry and geographic projection.
- Player vehicle, cameras, renderer, controls, collision infrastructure, and gameplay triggers.
- Source GIS datasets and generated source files.
- Unsupported arbitrary uploads or executable asset content.

Protected systems may be inspected for placement context but cannot be modified by the asset editor.

## Architecture

### Shared City Runtime

The editor is an opt-in subsystem of `city-explorer`, initialized only after owner authentication. The existing city build remains authoritative. An `authoredDetailGroup` holds newly authored objects and replacement objects. Generated scene objects receive deterministic editor identities and metadata during city construction.

The editor consumes a narrow runtime adapter supplied by the City Explorer:

- scene, camera, renderer, and canvas references;
- geographic `project` and `unproject` functions;
- `terrainHeightAtWorld` for ground contact;
- the authored-detail group;
- registries of editable generated objects;
- hooks that suspend and resume driving input.

The editor cannot mutate unrelated scene groups directly.

### Public and Owner Experiences

The existing GitHub Pages site remains public and static. It includes an Editor button and all read-only runtime support needed to display published edits.

Selecting Editor begins authentication with a separate protected service. The service completes GitHub OAuth, accepts only the configured `edmondsonedits` account, and issues an HttpOnly session cookie. After authentication, the City Explorer enables edit mode in the same page and scene.

Public viewing never requires the authentication service. If that service is unavailable, driving and published city content continue to work.

### Persistence and Publication

The canonical published scene is a versioned JSON document committed under `city-explorer/data/editor/`. The public simulator loads that same-origin document during city construction.

The browser may maintain a local recovery draft, but local storage is not canonical persistence. **Save Version** sends the full candidate scene document and its expected base revision to the protected publishing service. The service:

1. verifies the owner session;
2. validates schema, asset catalogue entries, bounds, identifiers, and numeric limits;
3. rejects stale base revisions rather than silently overwriting newer data;
4. commits the validated document through a server-held GitHub App or installation credential;
5. returns the commit identifier and deployment status.

Git history supplies immutable versions and rollback. The browser never receives a repository write credential.

## Scene Document

The document is geographic and independent of incidental Three.js object ordering.

```json
{
  "schemaVersion": 1,
  "city": "peterborough-on",
  "revision": "git-commit-or-content-hash",
  "updatedAt": "ISO-8601 timestamp",
  "objects": [],
  "overrides": []
}
```

An authored object includes:

- stable UUID;
- approved catalogue asset key and catalogue version;
- longitude, latitude, and terrain-relative elevation;
- Euler rotation and scale;
- visibility and supported presentation properties;
- human-readable editor label.

An override includes:

- stable deterministic target identity;
- source dataset/type metadata where available;
- operation: `hide`, `appearance`, or `replace`;
- replacement authored object when applicable.

Deterministic target identities derive from a source feature ID when available. Otherwise they use a versioned hash of feature type and canonical geographic geometry. Scene traversal order and transient mesh indices must not be identifiers.

## Generated Asset Editing

Generated content is never rewritten in place. Selecting a generated asset creates or edits an override:

- Delete creates a `hide` override.
- Move, rotate, or scale creates a replacement object and hides the original.
- Appearance changes create a narrow appearance override where supported.
- Restore removes the override and reveals the generated original.

For instanced geometry, the runtime masks the selected source instance and materializes a normal replacement object when transformation is requested. Continuous road or area geometry is not moved as though it were a prop; it can be hidden, restyled, or replaced with an editor-authored asset.

## Editor Experience

Entering edit mode exits pointer lock, stops the vehicle safely, and disables driving shortcuts. Leaving edit mode restores driving input without reloading the city.

The desktop editor provides:

- select tool with outline and hover feedback;
- translate, rotate, and scale gizmos;
- world/local transform choice and sensible snapping;
- asset catalogue placement with a terrain preview;
- duplicate, delete, restore-original, undo, and redo;
- object/layer list with search and visibility controls;
- property inspector with geographic and transform values;
- dirty, saving, saved, publishing, deployed, and error states;
- Save Version and Exit Editor controls.

Keyboard shortcuts are active only in editor mode and never leak into driving controls. Destructive operations remain undoable until a save. Mobile and narrow layouts support selection and property edits, but desktop pointer and keyboard interaction are the primary authoring target.

## Asset Catalogue

The catalogue is an allowlist of known safe assets. Each entry defines a stable key, asset URL or procedural factory, preview, default scale, placement rules, supported editable properties, and catalogue version. Publication rejects missing or unapproved asset keys.

The initial catalogue reuses existing Peterborough simulator assets and simple procedural props. Arbitrary remote URLs and executable content are outside scope.

## Error Handling and Recovery

- Editor initialization failure leaves the public simulator usable and reports a contained editor error.
- Local recovery drafts are namespaced by city and base revision.
- Schema-invalid drafts are preserved for export but are not applied automatically.
- Save conflicts require reloading the latest published version or exporting the current draft; they never overwrite silently.
- Network or authentication failure retains the unsaved draft locally.
- A Git commit failure leaves the previous published document unchanged.
- Deployment status distinguishes “saved to Git” from “live on Pages.”
- Scene loading skips and reports invalid individual entries instead of preventing the city from starting.

## Security

- A query flag, hidden button, or private URL is not authorization.
- GitHub OAuth identity is verified server-side and allowlisted to `edmondsonedits`.
- Sessions use Secure, HttpOnly, SameSite cookies and bounded lifetime.
- State-changing requests require CSRF protection and exact origin validation.
- The publisher validates complete documents and enforces payload, coordinate, scale, and object-count limits.
- GitHub credentials remain server-side with repository-content permissions only.
- Public endpoints expose no write capability.

## Compatibility and Migration

`schemaVersion` controls document migration. The public loader supports the current version and fails safely on unknown future versions. Catalogue keys remain stable across visual asset upgrades. Generated-target identity algorithms are versioned; migrations preserve existing overrides when the source city generation changes.

The existing standalone grid editor is not used as the runtime. Reusable state-management or validation ideas may be ported only when they fit this design.

## Testing and Acceptance

### Automated

- Scene schema parsing, validation, and migration tests.
- Geographic round-trip and terrain-relative placement tests.
- Deterministic generated-asset identity tests.
- Override application and restoration tests.
- Command history tests for create, transform, replace, delete, undo, and redo.
- Authentication, owner allowlist, CSRF, stale revision, and validation tests for the publishing service.
- Static-runtime tests proving published documents load without the editor service.
- Input-routing tests proving driving and editing controls are mutually exclusive.

### Browser and Visual

- Select and edit each supported asset category in the real city.
- Save, reload, and confirm identical placement.
- Hide or replace generated assets, reload, and confirm overrides persist.
- Confirm public visitors cannot activate writes.
- Confirm a failed save retains recoverable work.
- Confirm normal driving remains unchanged when editor mode is inactive.
- Verify desktop and narrow layouts and inspect console/network errors.
- Verify the deployed GitHub Pages asset hashes and live scene after publication.

## Delivery Sequence

1. Extract narrow editor/runtime boundaries without changing public behavior.
2. Add the scene schema, loader, deterministic identities, and override application.
3. Build command-based selection and transform editing with undo/redo.
4. Add the catalogue, inspector, object list, and generated-object replacement behavior.
5. Add local recovery drafts and validation.
6. Add protected owner authentication and Git-backed publication.
7. Add the public Editor entry point, deployment status, integration tests, and visual polish.
8. Publish through the existing GitHub Pages pipeline and verify the live URL.

## Non-Goals

- Editing terrain elevation or geographic projection.
- Editing gameplay logic, vehicle physics, cameras, or internal triggers.
- Collaborative multi-user editing.
- An unrestricted model-upload marketplace.
- Replacing the existing Peterborough generation pipeline.
