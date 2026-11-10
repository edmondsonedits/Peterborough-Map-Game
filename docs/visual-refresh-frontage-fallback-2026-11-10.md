# Frontage asset policy and overlapping fallback openings — 2026-11-10

The actual v1.6.204 Balanced control capture `reid-controls/sherbrooke-cab.png` showed a window sill crossing the central door of S10, source `way/1006575702`. Its receipt also showed `graphicsQuality:'balanced'`, `visuals.quality:'lite'` and `photoStatus:'not-needed'`.

Two separate causes were reproduced:

1. Balanced uses the existing low-power geometry budget (`cityVisuals.quality:'lite'`). The new optional-photo stripping had used that same `lite` flag, unintentionally removing reviewed facade photos in Balanced. The app's graphics policy still allowed optional scenery.
2. The procedural house fallback emitted three ground windows, then placed its existing central door over the middle window. S10's central sill was at approximately 0.6872 m above the base, with an outward center of 0.28 m; the door was centered 0.24 m outward. The sill therefore remained visible across the door. This is an inferred-grid conflict, not evidence of a photographed extra opening.

The renderer now separates `optionalAssets` from its `lite` geometry cap. `optionalAssets` defaults to `!lite` for existing callers, but the app can explicitly pass its actual optional-scenery setting. This flag governs the facade photograph, mural patch and front garden only and is passed to additional frontages. Thus Balanced can retain its eight-column budget and load reviewed photos; true Lite can avoid those downloads.

The fallback grid now excludes only an inferred ground window whose actual rectangle overlaps the existing implicit house/office door. A door between separated windows does not remove a neighboring window. Explicit window overrides, custom `groundWindows`, explicit door records and `entryDoor:null` retain their existing behavior. No new opening is introduced.

`tests/sherbrooke-opening-clearance.test.mjs` first reproduced four failures on the previous code. The corrected tests inspect the actual S10 source/profile instance geometry, centered and offset doors, an even-column door gap, explicit transoms, and photo-loader behavior with low-power geometry. They verify that both reviewed frontage photos settle loaded and hide their procedural fallbacks when optional assets are enabled, and that disabled assets produce no photo or garden calls independently of geometry quality.

Root still owns passing `optionalAssets:graphicsQuality.optionalScenery!==false` at app call sites. Actual Balanced/Lite recaptures and independent visual review remain required; unit tests alone do not establish that all photo placements look correct.
