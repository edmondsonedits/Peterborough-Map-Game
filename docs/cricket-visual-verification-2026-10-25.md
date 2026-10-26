# Cricket Place reference continuation — 25 October 2026

Implemented locally in `H:/ChatGPT/Peterborough-Map-Game-Sherbrooke`, preserving the dirty checkout and other agents' work. Nothing was committed, pushed, deployed or published.

## Confirmed identities and retained changes

The user confirmed that the recorded orange-wheeled-toy porch house is **22 Cricket Place**, and that the route crossed Hunter Street East bridge, turned north on Driscoll Terrace, then east on Cricket Place. The [City civic parcel service](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/4) returns parcel 4384 for 22 and parcel 4385 for adjacent 24. The saved narrow GeoJSON and footprint overlay are in `test-artifacts/cricket-visuals-20261025/agent-matching/`; source paths/hashes and matching observations are in `city-explorer/data/outer-recording-review.json`.

- **22: `way/1015118649`** — replaces the generic grey wall appearance with observed red brick, pale trim, two upper openings, a separated ground opening/entry and a simplified projecting porch with dark green canopy.
- **24: `way/1015118651`** — replaces the pale generic appearance with observed brick, pale trim, two upper openings and a simplified porch/entry with darker canopy. Obscured ground windows and railings were not reconstructed.
- `cricket-recording-appearances.js` holds immutable, source-backed defaults. Existing same-ID profiles win. `appearanceOnly` preserves the original footprint simplification, mapped dimensions, building roof geometry/materials, roads, collision and source identity. No photograph is stretched over either porch.
- `porchRoofColor` is an optional setting on the existing shared porch component. Old profiles keep their trim-colour default. The new appearance rules are reusable; the specific values apply to these two houses only. Earlier citywide materials remain in place and were not retuned here.

The source images are existing perspective exports from the user's October 18 recording. They retain experimental camera-calibration and baked-light limitations; dimensions/colours are visual estimates. No original photos, listing photos, parcel data or new image textures are shipped as runtime assets. The existing source/licence manifest and authoring guide were updated.

## Rejected trial and remaining work

The first trial added 4 m garden rectangles and entrance paths. Actual screenshots showed sharp tint boundaries and paths stopping mid-lawn; the independent reviewer agreed this harmed quality. Those additions were removed. `rejected-garden-pilot/` retains the rejected evidence. Existing ground remains unchanged. A later path/landscape treatment needs verified endpoints and coherent ground boundaries.

The pre-existing black/block-like roof volumes do not resemble the photographed gables. They were preserved under the scope limit on roof/massing reconstruction. The porches are simplified, and foliage, railings, attic details and hidden elevations are not faithfully reconstructed. This is an improvement in facade cues, not an exact house model.

The preceding green-gable house (`way/1015118648`) is still only a route-order candidate; ancillary footprint `way/1015118650` has no independent matched facade. Other unconfirmed buildings and the separate 104-image October 19 two-pass collection remain unassigned. **The full image collection is not finished.** This address confirmation resolves two houses, not the whole remaining route.

## Evidence and performance

[Open the local before/after comparison](http://127.0.0.1:8893/test-artifacts/cricket-visuals-20261025/comparison.html#8649-front). Evidence files are under `test-artifacts/cricket-visuals-20261025/`.

The fresh pre-edit baseline contains 25 Cricket views per mode. After the garden correction, the affected set was recaptured: front and oblique views of both houses plus an eastward street view, each at 2.6 m camera altitude. Full is 1500×950 and lite is 430×900; cameras, lighting and resolution match. Night and brief driving checks were also captured in each mode.

The comparison page displays the original pre-edit screenshots. Performance uses a separate **five-view `cricketReferences=off` fallback traversal versus the same five-view final traversal**, avoiding the resource-warming mismatch between the original 25-view traversal and the shorter final check. Raw reports and `performance-comparison.json` record both phases. Nearby 25-view controls were checked during the earlier trial; this is local Cricket verification, not whole-city verification.

| Measurement | Desktop full | Narrow lite |
| --- | --- | --- |
| Maximum draw calls in matched set | 269 → 283 | 178 → 187 |
| Worst per-view draw-call increase | 6.06% | 6.12% |
| Median rAF interval | 16.7 → 16.7 ms | 16.7 → 16.7 ms |
| End-of-traversal texture objects | 13 → 13 | 5 → 5 |
| End-of-traversal geometry objects | 893 → 897 | 352 → 356 |
| Shader programs | 82 → 82 | 46 → 46 |
| Ready time, single observations | 50.893 → 51.009 s | 10.515 → 10.699 s |
| New image downloads / added texture-map storage | 0 / 0 bytes | 0 / 0 bytes |
| Console, page and HTTP errors | 0 | 0 |

Both modes pass the existing limits of at most 10% matched draw-call growth and 20% median frame-interval growth. Total pre-existing texture VRAM was not measured. These are local desktop Chromium/D3D11 observations. Capped rAF is not GPU execution timing or proof of spare GPU capacity; startup measurements are single samples. Narrow lite is not a physical-phone test. The driving smoke confirms entry into driving and movement, not a complete driven-route certification.

## Checks and independent verdict

18 targeted tests passed, including immutable registry/override priority, mapped dimension and footprint preservation, source-ring facade generation in full/lite, finite geometry, and existing photo/arch/fallback behavior. Modified JavaScript syntax and `git diff --check` passed. Both new facade groups are editor-linked and report zero garden meshes. Full and lite fallback checks report neither new profile present and no browser/network errors.

Two focused Luna High workers handled source/parcel matching and the profile/test module; the coordinator owned runtime wiring, captures and documentation. One independent **deep_reviewer / GPT-6 Sol Medium** reviewed the focused diff, source pixels, parcel match, actual before/after screenshots and performance evidence. It required removal of the garden strips, then concluded: **“No blocking finding for the bounded Cricket facade pass.”** Its scoped report is saved in `independent-review.txt`.

## Reproduce and add the next building

The source manifest is `city-explorer/data/city-visual-sources.json`; the recipe is in [city-visual-authoring.md](city-visual-authoring.md#confirmed-cricket-place-reference-appearances). Add a small evidence-backed profile, use shared colours/components, preserve mapped massing, and verify front/oblique/lite views before retaining it.

`?cricketReferences=off` restores only these two previous appearances. `?recordingExpansion=off`, `?recordingReferences=off` and `?visuals=legacy` also suppress this continuation. Earlier photo-failure fallbacks remain unchanged.

With the existing server on port 8893 and Playwright runtime in `NODE_PATH`, set `PTBO_VIEW_NAMES=8649-front,8649-oblique,8651-front,8651-oblique,cricket-street-east`; run `node test-artifacts/cricket-visuals-20261025/capture.cjs final` and then stage `fallback`. Preserve existing directories first: those stages overwrite their captures. Run `node test-artifacts/cricket-visuals-20261025/summarize.mjs` to rebuild the comparison. Do not overwrite the original pre-edit `baseline/`.
