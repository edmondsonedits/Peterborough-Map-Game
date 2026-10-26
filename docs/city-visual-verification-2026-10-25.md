# City visual integration — local verification, 25 October 2026

Implemented in `H:\ChatGPT\Peterborough-Map-Game-Sherbrooke`, branch `codex/sherbrooke-existing-city`. Existing concurrent changes were preserved. No commit, push, deployment or publication was performed for this work.

## What changed

- Ten original procedural material families, shared palette assignments and six deterministic building presets extend the existing Three.js runtime. Brick, stone, render, roof, metal roof, asphalt, concrete, glass, grass and water have centrally recorded physical scales and fallback behavior. These are lightweight procedural color details and material-response settings, not a new set of photographic PBR maps.
- Material cloning now preserves shader hooks. Metre-based grain and joints no longer disappear when materials enter building and road batches. The camera-space normal error found in review was corrected using Three's world-space conversion helper and regression-tested across camera rotations.
- The broad diagonal bands reproduced in the baseline were mainly a shadow projection problem. A controlled identical-view shadow-off / close-shadow comparison isolated it. Street-level shadow coverage now uses a tighter extent with adjusted normal bias; distant/map views retain wider coverage.
- Reusable facade plans supply framed glazing, shallow layered panels, sills, entries, cornices and trim through the existing batching path. Existing roof/parapet, sign and porch helpers remain in use. Their dimensions, spacing, materials and eligibility come from shared presets and appearance overrides.
- Neutral daylight and a shared procedural sky reflection improve glass. Full mode uses a small PMREM environment with restrained daytime reflection and much lower nighttime intensity; lite retains a low-cost fallback.
- A reviewed display override for 219 Sherbrooke (S03) clips the photo at its visible roof boundary, brings adjoining wall color closer, and aligns estimated porch/posts/balcony geometry with the existing crop. Original photograph bytes and source identity are unchanged. No new external photo was redistributed.

## Citywide integration and limits

Shared palette materials apply wherever the existing runtime uses their eligible materials. Presets and batched facade components run beyond the pilot, with deterministic sampling and per-tile/global budgets. The full capture reported 2,488 decorated building parts in 57 tiles and 130,159 panels; lite reported 510 parts in 42 tiles and 28,774 panels. Parts are not unique addresses, and these counts do not establish coverage of every wall. Loaded source-building counts were 35,888 full and 30,564 lite, reflecting existing mode-specific data loading.

Specific source/profile overrides retain priority. Footprints, source identity, addresses, roads, collision and gameplay are not rewritten by the new appearance rules. Whole-city visual quality is not verified: the Rutherford captures still show plain building walls. The shared system makes subsequent supported building profiles cheap to add; it does not manufacture evidence for unknown architectural details.

## Measured comparison

Evidence is in `test-artifacts/city-visuals-20261025/`. Open `comparison.html` through the local server. `comparison-metrics.json` gives the per-view values; `baseline/`, `final/` and `legacy/` retain screenshots and raw reports.

| Measurement | Full desktop | Narrow lite |
| --- | --- | --- |
| Viewport | 1500 × 950 | 430 × 900 |
| Matched original baseline views | 8 | 8 |
| Final views + night/driving checks | 12 + 2 | 12 + 2 |
| Draw-call change, eight matched views | -4.7% to -0.2% | -1.5% to +0.3% |
| Median rAF interval, before → after | 16.7 → 16.7 ms | 16.7 → 16.7 ms |
| First-view texture objects, before → after | 13 → 15 | 4 → 4 |
| Added reflection GPU-memory estimate | 688,128 bytes (~0.66 MiB) | 0 |
| Ready time, one sample before → after | 50.099 → 50.709 s (+1.2%) | 9.767 → 10.425 s (+6.7%) |
| Encoded JavaScript, before → after | 2,380,015 → 2,417,778 bytes | same |
| New image downloads | 0 | 0 |
| Browser/console/HTTP errors | 0 | 0 |

Budget set before integration: at most 10% draw-call growth and 20% median frame-interval growth in matched views; no added image downloads, no unique shader per building, no per-window mesh in the generic path. The measured views pass these budgets. The capture uses local Chromium with D3D11. rAF is display-capped here: it is not GPU execution time, and unchanged intervals do not prove spare GPU headroom. Existing texture VRAM was not fully measured; the memory figure above is the incremental reflection allocation estimate. Loading samples include existing heavy city preparation and are not statistically established timings.

Cameras, resolution, day mode and capture procedure are matched. Daylight calibration itself intentionally changes between versions. Most street views use 2.6 m camera altitude; pavement and roofs have dedicated lower/elevated views. Coverage includes the Station 1/Sherbrooke pilot, S03 front and oblique, Cork & Bean/George storefront, camera turns, Little Lake-area commercial surfaces and Rutherford residential views. The original residential view 07 is obstructed; 09/10 add clearer coverage. Additional before images use the tested legacy switch; they were captured after implementation and are labeled accordingly. Their different asset-warming sequence should not be used for direct texture-count comparisons.

The final smoke test entered driving mode, accelerated the truck briefly and confirmed the driving state. Narrow lite is a desktop browser viewport, not a physical phone. No device, deployment or complete driving-route certification is implied.

## Verification and independent review

33 focused tests passed across material hooks, appearance rules, photo overrides, facade assets, source-frontage compatibility and existing web/video/route profiles. Building-archetype, legacy vertical-slice quality and site-surface-material checks also passed. Modified JavaScript syntax and `git diff --check` passed. The material workshop was checked in full, lite, legacy and storefront modes without page errors.

Three Luna High specialists handled materials, facade/preset helpers, and the preview/source pipeline in bounded assignments. Root integrated and tested the runtime. An independent Sol Medium reviewer initially withheld approval for incorrect world-normal conversion and pale storefront glass. Both findings were fixed and recaptured. The final verdict was: **approved for the tested local visual integration**, with no remaining blocking regression in that scope. This approval does not establish whole-city facade quality, physical-device performance or deployment readiness.

Known visual limits: S03 white rails/posts partly duplicate features baked into the photograph; lower vegetation, photographic perspective and baked shadows remain. Sharper original source and separate wall-plane rectification are needed for a larger improvement there. Generic world-axis projection is an approximation on diagonal walls/slopes. The library currently adds restrained surface color and response rather than physical micro-relief. Plain residential cuboids and building-specific roof/frontage evidence remain future individual work.

## Reproduce and continue

Use `city-explorer/material-preview.html` for shared material/component authoring and [city-visual-authoring.md](city-visual-authoring.md) for the recipe and source-manifest rules. `?visuals=legacy` restores the previous game appearance paths; `?visuals=lite` disables full reflection detail; `?lite=1` also selects the existing lightweight renderer.

The capture script uses Playwright from the existing runtime dependencies. With the local server running on port 8893, set `NODE_PATH` to the bundled node_modules, then run `node test-artifacts/city-visuals-20261025/capture.cjs final`. This overwrites that evidence directory, so copy it first if preserving this review. For legacy comparisons use stage `legacy`; `PTBO_VIEW_NAMES` can restrict the comma-separated view names. The saved original baseline cannot be recreated by running stage `baseline` against changed code; use the preserved screenshots or the explicit legacy switch.

For the next building: inspect usable reference pixels, record their observations and rights, tie a small appearance override to its stable feature ID, use shared materials/components, then inspect front and oblique views at 2.6 m plus lite fallback. Leave footprint, address, collision and unsupported architectural claims unchanged. Prefer a shared preset correction when the same problem appears on many buildings.
