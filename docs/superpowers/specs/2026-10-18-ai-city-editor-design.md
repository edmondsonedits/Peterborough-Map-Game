# AI city editor tools

Goal: make existing City Explorer editing precise and economical for an external coding agent, without an embedded AI service or arbitrary JavaScript console.

Use the existing editor entry policy. Expose a versioned `window.PTBO_CITY_EDITOR.run(command)` interface and a compact Tools drawer accepting the same JSON. Help and status are available before entry; scene access, camera changes and writes require active editor mode and no unresolved recovery prompt or transform drag.

Discovery returns bounded, paginated summaries with stable IDs, source metadata, geographic placement and truthful edit capabilities. Inspect includes properties and current overrides without exposing Three.js objects. Search supports name, ID, source ID, type and proximity.

Edits accept batches of at most 50 target patches, validate every patch before changing anything and enter the existing command history once. Generated connected roads and landmarks remain transform-protected. Generated discrete assets may become existing source-clone replacements. Material batches and instances support colour only; discrete meshes and authored objects also support opacity. Authored appearance persists in properties.editorAppearance. Unsupported properties are rejected, never silently ignored. Optional expectedRevision rejects stale edits.

Camera tools focus selections, travel to geographic points, save named views and restore exact camera poses and orbit targets. Views are separate local workspace data, bounded to 20 and included in context exports. Storage failures must be reported honestly. Scene edits use the existing draft store and export/publication workflow.

The drawer includes scene search, inspect/focus selection, named views, JSON commands, status/results and copy context. It is closed by default, accessible, and usable in portrait and landscape without adding normal gameplay UI. Context contains units, current version/revision, camera, selected feature, renderer metrics and supported operations. No automatic publication or external messages.

Verification: strict command validation, atomic failure, undo/redo, stale revision, transform protection, source-clone round trip, authored appearance persistence, camera and view round trip, storage errors, inactive/recovery gates; existing editor tests; real WebGL browser workflows at desktop and mobile sizes. No claim of faster editing until separately measured.
