# Reviewed brick: R058 and R083

Candidate for the next integration after v1.6.205. This file records a diagnosed material mismatch and an opt-in calibration, not a city visual approval. Root owns the app integration, version and release.

## Evidence and diagnosis

Inspected the owner images `handoff/extracted/R058.jpg` and `R083.jpg`, and exact v1.6.204 (`f7d96109db18058c425a767976899a5f34a5f55c`) Balanced captures:

- `qa-captures/f7d9610/evidence/current/balanced/chemong-south/chemong-r058-1002815291-eye.png`
- `qa-captures/f7d9610/evidence/current/balanced/reid-controls/reid-r083-1002680800-cab.png`
- `qa-captures/f7d9610/evidence/current/balanced/reid-controls/generic-commercial-eye.png`

The photos support red brick and visible horizontal masonry detail. The exact bond, brick dimensions, mortar thickness, reflectance and construction relief cannot be measured reliably from these oblique recording frames. R058 is partly screened by trees; R083 gives a clearer front. No new opening, roof, massing or vegetation inference is part of this change.

| Source | Reviewed wall color | Bare-wall sample in 1280×800 capture | Unique RGB values | Luminance standard deviation |
| --- | --- | --- | ---: | ---: |
| R083 / `way/1002680800` | `#8a5549` | x600–684, y375–447 | 5 | 0.170 |
| R058 / `way/1002815291` | `#825449` | x610–684, y430–494 | 4 | 0.324 |
| R058 adjacent generic brick | Generic palette/source map | x225–291, y430–509 | 1,637 | 8.716 |
| Generic commercial control | Generic palette/source map | x760–829, y455–491 | 1,892 | 19.867 |

Luminance is the weighted sRGB byte sample `0.2126R + 0.7152G + 0.0722B`, not physical reflectance. These bounded wall regions exclude openings and prove the visible contrast difference; they are not a target contrast specification or a controlled lighting comparison.

The actual paths explain the difference:

1. Reviewed profiles select `footage-wall-<sourceId>`, retain their supplied color, and use white vertex tint. They intentionally bypass `station2-wall-brick` and its shared Bricks101 photograph. This prevents the generic source from replacing the reviewed palette.
2. Their existing `installCityMaterialDetail` brick recipe has a nominal scalar range of 0.955–1.025. Balanced is a low-power profile and reports `cityVisuals.quality: lite`; strength 0.52 narrows that range to 0.9766–1.013 before derivative filtering, illumination and output quantization.
3. The old mortar term is darker than the brick body. It cannot supply the lighter joints seen in the photo/source controls. Existing smoothstep filtering further suppresses these very small differences at street distance.
4. Actual Lite skips `installWorldSurfaceDetail` entirely through `optionalScenery === false`, so reviewed walls have no procedural detail there.
5. Both source maps report successful load and readiness in the capture receipts. The generic texture is visible in the same R058 frame; this is not a texture loading failure.
6. The reviewed recipe uses world coordinates, not the generated texture UV attribute. The `[1,1]` fallback repeat on reviewed batch UVs is therefore not the cause. `cloneCityMaterial` preserves its compile hook and program key; existing tests exercise the real Three r180 shader anchors and clone behavior.
7. Balanced disables the sun's shadow map and receiving shadows, so cast-shadow occlusion is not the cause. The east/northeast fronts receive less direct daylight than the south-facing commercial control, which helps explain their darker overall color. It does not explain the same-frame generic/reviewed texture split.
8. The measured frontage distances are approximately 20.6 m (R083) and 23 m (R058). At 800 pixels high and 68° FOV, a 75 mm course spans about 2.2 and 1.9 pixels respectively before viewpoint effects. Mortar is subpixel, so filtered coverage is required. Inflating courses to make them visible would change the apparent construction scale.

Conclusion: this is deliberate but insufficient procedural surface contrast, compounded by the quality gates. No evidence supports changing the reviewed base colors, generic source maps, source loading, UV repeat values, or global lighting.

## Bounded implementation

`installReviewedBrickDetail(material, {id, quality})` in `city-material-library.js` opts one explicitly reviewed brick material into a separate shader recipe. Existing material families remain unchanged unless this helper is called.

- It uses the existing 0.24 m horizontal module and 0.075 m course estimates, plus an explicitly estimated 0.008 m mortar width. These are rendering parameters, not measurements of either house.
- The horizontal coordinate is projected onto the normalized wall tangent. Diagonal Chemong walls therefore retain the same module width as cardinal Reid walls. Heights remain in world metres.
- Analytic box coverage integrates both alternating row interiors and head joints. It retains mortar area through subpixel sampling and tends toward the average appearance with distance.
- Lighter mortar and restrained per-brick variation use a scalar multiplier. Mortar modulation subtracts its geometric mean coverage, preserving the mean linear RGB over a full repeat domain. Finite-frame sampling, small zero-expectation brick variation and tone mapping can still change the measured screen average slightly. The supplied material color itself remains unchanged.
- The same bounded recipe runs in full and lite material quality. It adds no image, normal map, bump map, texture instance, material instance, mesh or draw call. The reviewed variant has a distinct shader-program key; source IDs share that key within a quality tier.
- This is albedo detail. It does not claim to reconstruct mortar depth or change actual wall geometry.

App integration is restricted to `profile.reviewedWallMaterial && profile.wallSurface === 'brick'` in improved visuals. Install this helper at reviewed wall material creation before the optional-scenery early return; retain the existing path for every other material and legacy visuals. Do not apply both recipes to one material. The original opt-out, white reviewed vertex tint, source height, roof and footprint behavior remain intact.

## Verification and remaining acceptance

The new tests first failed on the absent export, then passed after implementation. They cover explicit opt-in, unchanged base color, no texture allocation, full/lite equivalence, diagonal wall scale, negative-coordinate filtering, integrated mortar area across subpixel footprints, distinct/shared cache keys, batch cloning and safe missing-anchor fallback. The existing material-library tests pass.

An independent comparison compiled all ten generic families in full and lite against `f7d9610`. All 20 default shader pairs, cache keys and supplied colors were byte-identical. The comparison record is `reviewed-brick-diagnostic/generic-shader-equivalence.json` in the task workspace.

Local actual-WebGL launch was attempted and failed before page creation with Chromium `socket() failed: Operation not permitted`. This is an environment limitation, not a shader result. An isolated diagnostic script was prepared at `reviewed-brick-diagnostic/render-proof.cjs`; the working CI capture path is responsible for actual rendering.

Required before acceptance: exact v205-before/current R058 and R083 cab/eye/oblique A/B in Balanced and Lite, plus generic commercial/residential controls. Check actual shader compilation, bounded mortar visibility at street distance, stable course scale on the diagonal front, no visible crawl with camera movement, no conspicuous checkerboard or excessive lightening, unchanged generic controls, and render/program/texture counts. Unit tests and mathematical coverage checks do not establish those visual results.

| Source | Mapped road-centreline camera | Bearing toward frontage | Target frontage midpoint |
| --- | --- | ---: | --- |
| R083 / `way/1002680800` | 44.311993, −78.328353 | 267.3° | 44.3119843, −78.3286115 |
| R058 / `way/1002815291` | 44.316678, −78.3292056 | 234.58° | 44.3165585, −78.32944045 |

Use the actual gameplay cab for driver-height approval. The existing `eye` fly capture requests 2.5 m but is clamped by runtime clearance to 5 m above ground; its receipt correctly records that difference.
