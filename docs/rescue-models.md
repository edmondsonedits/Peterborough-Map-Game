# Reference-inspired rescue actors

The city explorer now loads original Blender-authored assets for the playable firefighter and pumper. Both retain procedural fallbacks when loading or validation fails. City readiness awaits both attempts, so captures do not silently record an unfinished model load. Existing movement, vehicle physics, controls, saved settings and map data are unchanged.

The firefighter wears charcoal turnout clothing, yellow/silver reflective bands, gloves, boots, a radio and harness, and carries a generic helmet. Four shoulder/hip groups use the existing procedural gait. The face is a stylized original interpretation, not a photorealistic scan; there is no facial, finger, elbow or knee rig.

The two-axle pumper uses a red/dark cab, chrome grille, pump gauges, silver roll-up lockers, hoses and roof ladder. Four independently rotating wheels include two steering pivots. Four warning lenses use the existing light switch. The rear and opposite side are approximate interpretations. Vehicle markings and UI labels are generic Fire Rescue.

Models are in `city-explorer/assets/characters/` and `city-explorer/assets/vehicles/`, with metadata beside each GLB. Original generators are in `tools/blender/`; run with Blender 5.2 LTS using `--background --python <script>`. Generators save editable files into `assets-source/` and export runtime GLBs. No source photographs, downloaded models, external textures, department insignia or manufacturer logos are embedded. Geometry and markings were created within the project.

Asset tests cover scale/budgets, no image dependencies, valid limb/wheel pivots, and malformed-rig rejection. Browser checks cover walking animation, actor hiding when driving, entering/driving/steering/lights/reset, saved-setting preservation and forced-404 fallbacks. Tests do not certify physical mobile-device performance.

This release also carries the previously reviewed Station 1 architectural details and preserves the newer production GIS refresh. Roll back by reverting this release commit; do not overwrite the GIS refresh.
