# Character quality release v1.6.183

Prepared on November 5, 2026 from main commit `d1d89584`, preserving the v1.6.181 scenery and geospatial updates and the concurrent v1.6.182 vehicle release. Publication was explicitly authorized by the user. The original checkout remains intact.

The firefighter now uses a weighted 19-bone skeleton with original Idle, Walk and Run clips, corrected fabric albedo and revised uniform materials. The runtime blends phase-aligned clips against accepted movement distance at 1.6 m/s walking and 3.8 m/s running. See [asset provenance and workflow references](rescue-models.md) for sources, rebuilding and limitations.

## Validation

- All 1,263 Node tests selected by the Pages release workflow passed locally after integrating the vehicle release.
- Gameplay systems, fallback junction geometry, rendered pavement and runtime street-paint checks passed.
- The release booted with the v1.6.183 build marker and the rigged character ready.
- Desktop browser checks passed for walking, running, stopping, entering and exiting the truck, with no page errors.
- Touch emulation at 390 by 844 passed for walking, running and stopping. A forced character-asset 404 retained the procedural fallback.
- The interactive model preview passed its Run, Pause and Play checks on the same mobile viewport.
- JavaScript syntax and whitespace checks passed.

Browser evidence is retained locally under `artifacts/character-quality/`, outside the published artifact. Physical-device performance was not tested. The character has no per-foot terrain IK, facial or finger animation, or dedicated turn/stop clips.
