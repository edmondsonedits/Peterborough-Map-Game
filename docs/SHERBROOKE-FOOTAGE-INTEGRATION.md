# Sherbrooke footage integration — existing Peterborough Map Game

Release: 1.6.123. Baseline: `40c958fc106f0cfb61cd0e7c5d339d7622c00145`.

This changes the existing `city-explorer/` simulator. It does not create a separate city, substitute a road surface, or replace driving, dispatch, routing, collision or training logic.

## Scope and evidence

The Aylmer-to-George block around Fire Station 1 (210 Sherbrooke Street), both sides, has 19 source-ID profiles. Thirteen receive street-facing details from the owner's Insta360 X4 Air footage. Station 1 retains its stronger existing reviewed massing, five apparatus bays, entry, office, canopy and roof details. Five obscured/inferred buildings retain the existing inferred game appearance rather than losing detail or being labelled accurately reconstructed.

Source records were carried from `Streets3D-Test/site/demos/sherbrooke-reference-v1/` at commit `9167d63f3ae4e3c4c42a08f9d236774011a38e53`. Each profile records the original still name, sequence, trimmed-export time, SHA-256, confidence and caveats. The source was the owner's 168-second stitched street recording. Timestamps are relative to that export; original INSV timing is not asserted.

The profiles are in `city-explorer/sherbrooke-footage-profiles.js`. Heights, colors, floor counts and most openings remain visual estimates. There is no claim of surveyed facade dimensions, solved camera alignment or geographic improvement. Existing GIS footprints, city projection, terrain and foundations remain authoritative. Front lines are converted to WGS84 and then passed through the simulator's own `project(lat, lon)`, not copied from the separate demo's coordinate system.

Only one original JPEG is shipped: the late north-side still used for the BORO mural on the Village of Thai corner. The existing station geometry already depicts the doors well, so it does not receive another photo plane or another facade. The mural's reviewed quadrilateral is mapped onto a stable wall mesh, excluding the nearby traffic signal. Other source-image paths are provenance identifiers, not runtime downloads.

## Rendering and editing

- The existing batched wall/roof builder applies the 13 observed/partial profiles. Flat, gabled and hipped forms stay on their source footprints. The scoped roof helper clips linear roof planes to each original polygon, including concave outlines; gable closures use wall material. It avoids the old four-corner-only pitched-roof fallback.
- A reviewed frontage group supplies glazing, window frames, signs, porches, a balcony and storefront features. Unphotographed side/rear panels retain the existing inferred treatment.
- Generic street-front panels and duplicate decorative frontage trim are excluded where replaced. Roads, sidewalks, poles, wires and unrelated buildings keep their existing rendering paths.
- The source ID links each frontage to its original building. Hide and restore include the detail group. Source-copy replacements deep-copy facade geometry/materials in the original batch's local pivot frame, including when static matrices are frozen.
- The original station facade is also linked to its source building, preventing a hidden station mass leaving a floating facade.
- An editor batch color change affects the original walls/roof; reviewed window/trim/photo materials retain their own colors. This is the remaining scoped appearance limitation.
- The optional mural load settles before published editor replacements load. A 15-second timeout keeps an unavailable photograph from blocking the city; failed or late loads leave the normal wall available.

## Validation and reproduction

Focused tests: `node --test tests/sherbrooke-footage.test.mjs tests/sherbrooke-footage-roofs.test.mjs tests/sherbrooke-editor-link.test.mjs tools/test_city_editor_overrides.mjs`.

Roof tests check nine eligible pitched profiles, exact projected footprint area, vertex containment, nonflat hip/gable peaks, height bounds and closed gable ends. The facade test checks all 19 geographic front lines against the existing footprint outlines, finite geometry, outward normals, conservative missing evidence, four-corner photo projection, source-image hash, deferred image success, failure, timeout and ignored late callbacks. Editor tests cover attached hide/restore, independent copy materials/geometry, frozen transforms, and copying hidden source batches.

Browser check: install/use Playwright, serve this checkout, then run `node tools/check-sherbrooke-footage.cjs http://127.0.0.1:8870 local`. Set `BROWSER_EXECUTABLE` if using an installed Edge/Chrome. It saves street views, a desktop control check, a narrow-screen compatibility check and a JSON receipt under ignored `test-artifacts/sherbrooke/`. It checks original truck movement, all 13 linked frontages, station linkage, successful mural loading, and browser/resource errors. The same script accepts the production Pages base URL for live verification.

Matched baseline/after Station 1 views were also captured locally using the existing capture contract. Browser screenshots support appearance review, not geographic accuracy or physical-phone thermal/FPS certification. No training videos, large splat assets or paid compute are introduced by this change.


## Version 1.6.125 — reviewed building fronts and gardens

The earlier release description above is historical. This revision has 16 linked frontage groups, six additional rectified facade photographs, and ten terrain-following front gardens. Sequential footage review corrects the placement of the red balcony house (S03), distinguishes the adjacent hipped and gabled brick houses, and identifies the blue-sided house (S10). Station 1 keeps its existing five-bay facade.

Six small JPEGs total 245,231 bytes (about 245 KB), with an estimated 6.7 MiB decoded RGBA allocation including mipmaps. Source-frame hashes, crop quadrilaterals and adjustments are recorded in `city-explorer/assets/sherbrooke-frontages/recipes.json` and `manifest.json`. Rebuild with `tools/streetscape/build_frontage_textures.py --frames <original extracted-frame directory>` using Pillow and NumPy. Original source images remain untouched; no generated details or paid processing were used.

The optional facade photographs replace repeated procedural front details after loading successfully. Failed loads keep procedural details. Gabled photos use triangular roof boundaries; side and rear walls remain conventional geometry. These are planar photographs, so projecting porches and partially obscured details cannot provide perfect parallax from every viewpoint.

Reviewed lawn depths, paths, selected driveway bands and a hedge are visual estimates, not surveyed parcel geometry. Terrain-following garden cells are excluded from building footprints, roads and a sidewalk reserve. Garden geometry is combined by material, with at most four meshes per building. Existing roads, collision, gameplay and the multitouch fix are preserved.

New focused tests cover asset hashes and budgets, profile corrections, facade UV orientation, gable boundaries, optional-photo fallback, wide porches and garden clipping. `tools/check-sherbrooke-footage.cjs` checks six loaded photographs, 16 editor-linked frontages, gardens, truck movement, desktop and narrow-screen lite rendering, and browser/resource errors. Narrow-screen desktop testing does not establish physical-phone FPS or thermal stability.
