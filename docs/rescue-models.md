# Reference-inspired rescue actors

The city explorer now loads original Blender-authored assets for the playable firefighter and pumper. Both retain procedural fallbacks when loading or validation fails. City readiness awaits both attempts, so captures do not silently record an unfinished model load. Existing movement, vehicle physics, controls, saved settings and map data are unchanged.

The refined firefighter replaces the primitive head with a shaped CC0 MakeHuman anatomical head, textured skin, eyes, brows and swept hair. The original uniform now has folded garment surfaces, portable fabric color/normal maps, fitted reflective bands, stitching, cargo pockets, reinforced boots/gloves, radio and harness details; both hands are empty. Four shoulder/hip groups use the existing procedural gait. It remains a reference-inspired approximation, not an extremely close photorealistic reconstruction; there is no facial, finger, elbow or knee rig.

The two-axle pumper uses a red/dark cab, chrome grille, pump gauges, silver roll-up lockers, hoses and roof ladder. Four independently rotating wheels include two steering pivots. Four warning lenses use the existing light switch. The rear and opposite side are approximate interpretations. Vehicle markings and UI labels are generic Fire Rescue.

Models are in `city-explorer/assets/characters/` and `city-explorer/assets/vehicles/`, with metadata beside each GLB. The character uses CC0 MakeHuman graphical data, not MakeHuman application code. Source/license records and hashes are in `city-explorer/assets/characters/licenses/`. The pumper and uniform geometry/markings are project-created. No user reference pixels, department insignia or manufacturer logos are embedded. All runtime textures are embedded in the character GLB; it makes no requests to third-party asset hosts.

For the refined character, run `python tools/blender/fetch_firefighter_sources.py`, then Blender 5.2 LTS with `--background --python tools/blender/build_firefighter_v2.py`. This preserves the full-resolution editable `assets-source/characters/firefighter.blend` before reducing the browser mesh and textures. The browser model has 106,674 triangles and a 7.49 MB GLB; this is heavier than the initial placeholder. Physical mobile performance is not certified. Run `render_firefighter_review.py` for the packed studio-review BLEND and actual model renders. The v2 builder depends on the unchanged v1 generator and `firefighter_anatomy.py`.

The public interactive model review is `docs/character-preview/index.html` and includes a head close-up. The source sheet is image-generated, as confirmed by the user; there is no original 3D mesh to recover.

Asset tests cover scale/budgets, no image dependencies, valid limb/wheel pivots, and malformed-rig rejection. Browser checks cover walking animation, actor hiding when driving, entering/driving/steering/lights/reset, saved-setting preservation and forced-404 fallbacks. Tests do not certify physical mobile-device performance.

This release also carries the previously reviewed Station 1 architectural details and preserves the newer production GIS refresh. Roll back by reverting this release commit; do not overwrite the GIS refresh.

