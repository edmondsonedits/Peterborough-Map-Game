# Reviewed route pavement correction — 2026-11-10

This module corrects the single municipal parking exclusion beneath the open Ultramar canopy, `way/446339023`. Owner frames R041/R043/R049 and the exact cutout are audited in [visual-refresh-ultramar-plan-2026-11-10.md](visual-refresh-ultramar-plan-2026-11-10.md). It creates no pad, mesh, height sampler, collision object, pump island, or other lot detail.

## Bounded correction

`city-explorer/reviewed-route-surfaces.js` exports:

```js
applyReviewedRouteSurfaceCorrections(collection) // -> { collection, diagnostics }
ULTRAMAR_PAVEMENT_CORRECTION                    // frozen identity/proof descriptor
```

The correction ID is **`ultramar-10-99-open-canopy-hole-2-v1`**. The function accepts a GeoJSON FeatureCollection and requires exactly one feature with ID `10/99`, type `Feature`, layer `parking_surfaces`, and Polygon geometry. Every coordinate of all three audited rings must match, in the existing order and precision:

| Ring index | Stored vertices, including closure | Result |
|---|---:|---|
| 0 | 29 | Entire exterior retained exactly |
| 1 | 7 | Garage exclusion retained exactly |
| 2 | 5 | Audited open-canopy exclusion removed |

It clones only the collection, feature array, target feature, geometry object, and ring array. The exterior, garage ring, properties, IDs, and every unrelated feature retain their values and references. Deep-frozen input works. Any identity mismatch, duplicate target ID, changed coordinate, reordered ring, additional hole, or malformed collection returns the original collection unchanged and reports an unsuccessful reason. A second application cannot remove the remaining garage hole.

Successful diagnostics contain `applied: true`, the correction and source IDs, removed ring index, before/after ring counts, and the exact source/corrected/removed-ring SHA-256 values from the exported descriptor. Geometry hashes use `JSON.stringify({ type, coordinates })` in that key order; the ring hash uses `JSON.stringify(ring)`. The `geometryHashFormat` field is `sha256-json-type-coordinates-v1`. These hashes identify the geometry that was accepted. They do not by themselves establish that a particular road pack has been rebuilt.

## Minimum app and build integration

The current source path is:

1. `loadOfficialRoadSurfaces()` fetches the municipal GeoJSON.
2. `buildOfficialRoadSurfaces()` passes each polygon to both `OfficialDrivableSurfaceIndex` and `appendOfficialRoadPolygon()`.
3. That polygon tessellator emits terrain-following road triangles and indexes the same Float32 coordinates for contact.
4. `finishRoadSurfaces()` conforms the meshes and rebuilds the contact index from the resulting mesh coordinates.
5. The offline build exports those meshes through `exportRoadScene()`, partitions and optimizes them, then writes the packed triangles.
6. Browser packed mode and `loadWorldCollision()` both consume those encoded triangles. The multiplayer export references the same content-hashed road tiles; it does not regenerate municipal polygons.

Call the correction once immediately after validating the fetched FeatureCollection, before either semantic indexing or tessellation, and use its returned collection throughout that source path:

```js
const reviewed = applyReviewedRouteSurfaceCorrections(collection);
collection = reviewed.collection;
state.reviewedRouteSurfaces = reviewed.diagnostics;
```

Include the diagnostics in `__PTBO_ROAD_BUILD__.report()` and carry them into the road-pack manifest. Add `city-explorer/reviewed-route-surfaces.js` to the compiler's canonical source hash list in `tools/build-road-pack.cjs`. The compiler should require the expected successful correction before publishing this candidate. Runtime pack validation should reject or fall back from a pack that lacks the expected correction ID, successful status, and geometry proofs; the new source helper cannot repair an already encoded tile.

Rebuild through the normal full road compiler, including finalization and verification. Do not use a paint-only `--finish-existing` operation for this change: it preserves the original pavement hole. Afterward run the normal multiplayer world export and pinned station-height generation. The world manifest's road-pack build ID and tile hashes must match the rebuilt road manifest. Keep this one geometry correction out of server-specific and vehicle-specific fallback code.

Source-mode review uses `roadPack=0&municipalRoads=1`; the latter retains municipal geometry when checking Lite. Packed-mode review must confirm the new manifest proof and resident tile geometry rather than relying on a source-mode screenshot. Default packed mode bypasses the GeoJSON generation branch.

## Verification completed in this module task

Seven new tests pass; **46/46** focused correction, export, optimization, codec, streaming, and road-finish tests pass. Syntax and diff checks also pass. Tests use the real municipal `10/99` coordinates and execute the current production app's polygon/tessellation functions, rather than a replacement triangulator.

- The original source has no pavement hit at the canopy center. The corrected source has real parking contact at the center and all four proposed support probes in both source quality modes. The garage remains excluded and an outside-lot probe remains empty.
- The increase in emitted plan area equals only the approximately **85.45 m²** audited hole, within 0.01 m² Float32 area tolerance. Both sides of each former cutout edge retain continuous contact.
- A controlled sloped height field confirms that the correction uses existing draping rather than adding a flat pad. It is a test field, not a measurement of the live Ontario DTM.
- The test runs the corrected geometry through `finishRoadSurfaces`, `exportRoadScene`, partitioning, the production optimizer, and the actual packed codec. Exported source positions equal the Float32 mesh positions. The encoded/decoded final positions match exactly.
- A real `loadWorldCollision()` instance reads the resulting hashed, compressed in-memory pack. It is unavailable before prefetch and reports parking contact afterward. Browser packed-index and multiplayer heights match exactly at the center/support probes; source-finished height differs by less than 0.00001 m on the controlled grade. Tile removal clears browser contact. Garage exclusion survives the entire path.

The optimizer may replace coplanar source triangles; source mode and packed mode therefore need not have identical triangulation. Source-mode contact indexes its emitted source faces; browser packed mode and multiplayer share the exact final encoded faces.

## Compiler ground-proof follow-up

The next candidate adds compiler plumbing without activating the canopy. `reviewed-canopy-ground.js` provides shared validation for the source report and the final packet receipt. The compiler now includes that module, `reviewed-route-surfaces.js`, and `recorded-canopies.js` in its canonical source hashes.

The app's source-build report supplies `reviewedRouteSurfaces` and `reviewedCanopyGround`. The latter contains the real source footprint's **25** required samples: four roof corners, the roof center, and each of four support centers plus four support-footprint corners. The app obtains them after `finishRoadSurfaces`, requiring semantic ownership by `10/99` and a finite actual rendered parking triangle with official contact. The shared validator also checks the complete expected coordinate set and the canopy builder's existing grade limits. No height comes from terrain fallback.

`tools/build-road-pack.cjs` rejects missing or invalid source proof before mesh export. After optimization and paint finalization, it decodes the final intersecting tiles, queries the same packed contact index used by gameplay, and writes `manifest.reviewedCanopyGround` with:

- `stage: 'final-packed-triangles'`, the canopy/parking/correction identities, and `roadPackBuildId`.
- All 25 final `{x, z, height, tileId}` samples and their original source samples.
- The contributing raw and compressed tile hashes.
- The actual maximum source-to-packed height difference. The acceptance cap is 0.003 m: the optimizer's 0.002 m limit plus 0.001 m allowance for Float32/interpolation arithmetic.

`tools/verify-road-pack.mjs` requires the receipt for packs whose source list includes the correction module. It validates the record and independently resamples the decoded final packets. A self-consistent copied record with all source and packed heights shifted by 0.001 m is rejected. Older packs without this correction source remain verifiable as their original artifacts; they have no valid canopy ground receipt and cannot authorize canopy activation.

The focused correction, ground-proof, canopy geometry, export, finalization and verifier suite passes **36/36** tests. No complete city road rebuild or live DTM proof has yet been produced by this follow-up. CI must run the full compiler, packet verifier, multiplayer export, and world/road parity checks before the canopy can be enabled.

## Planned runtime consumption

Packed mode can call `validateReviewedCanopyGroundRecord(manifest)` during manifest loading. It validates build identity, correction hashes, coordinates, grade, and contributing tile hashes before returning the checked canopy result. This small record is available before building generation, even when the distant parking tile is not resident. It may position static canopy geometry; it must never supply vehicle contact or make `readyAt` true. Streaming and wheel contact continue to use resident packet geometry.

Source fallback needs a separate ordering step: defer only `way/446339023` while the source pavement is unfinished, then sample the actual finished parking faces and commit that building once. If correction proof, source footprint or ground validation fails, retain the ordinary mapped shell and report the reason. Do not use the packed height receipt with a separately generated source surface, and do not activate the open canopy on an older uncorrected pack. This runtime geometry integration is not part of the compiler-plumbing candidate.

## Remaining release checks

The original bounded module task changed no app, build tool, source data, road pack, multiplayer world, or version. The subsequent compiler-plumbing follow-up adds the source/packet proof described above; it does not regenerate shipped data or activate canopy geometry. Actual DTM grade, forecourt boundary continuity, source/packed height probes, pinned world identity, and streamed reload behavior require verification against the rebuilt candidate. Cab approaches and an ordinary-input under-canopy drive must still check pavement seams and wheel contact in Normal and Lite. These tests do not establish visual approval or an already drivable shipped forecourt.
