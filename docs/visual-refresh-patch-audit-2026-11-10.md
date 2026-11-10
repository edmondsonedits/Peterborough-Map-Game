# Included patch audit — 2026-11-10

The supplied patch applies cleanly to its declared old base `52a5f404f622a59a1cbed61af579a3ea13ea9cab` in an isolated temporary Git index. No working files were overwritten. The restored work branch began at `4da1b86` (production v1.6.201 plus plan). The table compares that baseline and candidate `51da803` (v1.6.203) after normalizing only cache-version query tokens.

The ten existing support/test files were still at the old base; none of the five new route modules or four route test files existed. `app.js` and the release normalizer contain newer work and cannot be replaced by the old patch. No complete patched file was already present.

| File | Starting baseline | v1.6.203 candidate |
|---|---|---|
| `city-explorer/app.js` | different/newer | selective/newer changes |
| `city-explorer/business-signs.js` | same as old base (ignoring cache pins) | selective/newer changes |
| `city-explorer/emergency-facilities.js` | same as old base (ignoring cache pins) | selective/newer changes |
| `city-explorer/hunter-bridge-appearance.js` | same as old base (ignoring cache pins) | original base retained |
| `city-explorer/landmark-models.js` | same as old base (ignoring cache pins) | original base retained |
| `city-explorer/recording-appearance.js` | same as old base (ignoring cache pins) | original base retained |
| `city-explorer/sherbrooke-footage.js` | same as old base (ignoring cache pins) | selective/newer changes |
| `scripts/normalize-release.cjs` | different/newer | selective/newer changes |
| `tests/business-sign-renderer.test.mjs` | same as old base (ignoring cache pins) | original base retained |
| `tests/cricket-runtime-integration.test.mjs` | same as old base (ignoring cache pins) | original base retained |
| `tests/emergency-facilities.test.mjs` | same as old base (ignoring cache pins) | original base retained |
| `tests/hunter-bridge-appearance.test.mjs` | same as old base (ignoring cache pins) | original base retained |
| `city-explorer/route-corner-appearances.js` | absent | selective/newer changes |
| `city-explorer/route-landmark-appearances.js` | absent | selective/newer changes |
| `city-explorer/route-open-ground.js` | absent | absent |
| `city-explorer/route-street-appearances.js` | absent | selective/newer changes |
| `city-explorer/route-streetscape.js` | absent | absent |
| `tests/route-corner-appearances.test.mjs` | absent | absent |
| `tests/route-landmark-appearances.test.mjs` | absent | absent |
| `tests/route-open-ground.test.mjs` | absent | absent |
| `tests/route-street-appearances.test.mjs` | absent | absent |

## Selective restoration decisions

- Reimplemented the verified Chemong and Reid subset, keeping current profile composition, release pins and gameplay infrastructure. The route-specific tests replace the broad old route tests for this bounded scope; absent old test filenames do not mean no coverage.
- Added optional glass tint, entry/shutter controls, additional-frontage sign deduplication and Walmart decoration through the current renderer. Existing defaults remain when these options are absent.
- Withheld uncertain or wrong photo matches, unreadable tenant text, inferred Walmart entrance counts and incorrect Mason face details. Refer to the route evidence documents.
- Old parking rows/islands and Reid wall/bridge rail placements need corrected map/clearance matching. They are not imported just because they pass the old coordinate tests.
- Hunter bridge and broader landmark changes remain unreviewed for their later route position.
- Source-photo facade dimensions must be exercised with actual mapped wall heights. Tests that supplied a ten-metre wall concealed collapsed shop fascias; the independent review identified this and the next correction is in progress.

This is a source audit, not visual acceptance. Driver-cab captures and per-batch review remain separate requirements.
