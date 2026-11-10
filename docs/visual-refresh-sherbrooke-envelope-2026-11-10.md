# Sherbrooke silhouette corrections

Prepared 2026-11-10 for the next candidate after v1.6.206. This is a bounded correction of five generated building silhouettes, not a visual approval or a measured building survey. Fresh Balanced and Lite cab/oblique captures remain required after runtime integration.

## Evidence and source identity

Opened the original owner photos R141, R142, R143, R144, R157, R158 and R159 from `handoff/extracted/`, plus both original cab and oblique PNGs for all five target sites under `qa-captures/f7d9610/evidence/current/balanced/sherbrooke/`. The capture JSONs identify shared/explorer version **1.6.204**. The review poses differ from the owner camera poses, so pixel size across those images is not a metre measurement. The prior findings are in `visual-refresh-v204-independent-visual-review.md`.

Each profile uses the following adjacent vertices from the current `city-explorer/data/peterborough-osm.json` way. Vertex indices are zero-based, excluding the repeated closing vertex. No source coordinates are edited.

| Photo / source way | Matched street face | Exact start `(lat, lon)` → end | Source indices |
|---|---|---|---|
| R141 / `1006575766` | North wall, southwest Stewart corner | `(44.3004602, -78.325474)` → `(44.3004643, -78.3253949)` | 4 → 5 |
| R142 / `1006594188` | South gable, northwest Stewart corner | `(44.3006282, -78.3256001)` → `(44.3006358, -78.3254326)` | 2 → 1 |
| R143–R144 / `1006575767` | North wall, southeast Stewart corner | `(44.3004521, -78.3251287)` → `(44.3004595, -78.3249834)` | 2 → 3 |
| R157 / `1006594168` | South glazed face, Thrive west of Aylmer | `(44.3007347, -78.3237849)` → `(44.3007443, -78.3236052)` | 2 → 1 |
| R159 / `1006575755` | North wall, southwest Aylmer corner | `(44.3005471, -78.3233108)` → `(44.3005534, -78.3231628)` | 0 → 1 |

R143 looks toward the southeast-corner house from the northwest approach; the house is left of Stewart in that image. R144 looks back toward the same house at photo right. Neither view supports the old ledger wording “southwest across Stewart.”

All five source ways contain only `building=yes`, except R143's `building=house`. Their previous wall heights and roof forms came from deterministic inference in `mappedBuildingDimensions`, not explicit height/storey/roof tags. The existing exact outlines, source ground datum, and source/physics dimensions remain authoritative. A future explicit dimensional tag rejects the visual estimate through the shared envelope resolver.

## Observations and estimated display envelopes

Every value below is a visual estimate. The cap thicknesses are display choices; they are not measurements of real roof construction.

| Source | Observed correction | Previous inferred wall + roof rise | Proposed wall/eave + roof rise | Limits |
|---|---|---:|---:|---|
| R141 | Nearly horizontal north eave above two upper sash; no front triangle | 4.24778 + 2.24198 m, gabled | 4.24 + 0.12 m, flat cap | Conservative front-silhouette simplification. It does **not** assert that the entire physical roof is flat. The visible stepped side/rear volumes and their roofs remain unmodeled. |
| R142 | South-facing gable; upper sash extend into the gable | 5.75801 + 1.81199 m, gabled on wrong axis | 4.10 + 2.50 m, gabled normal to frontage | A 1.5-storey candidate, not two complete wall storeys plus a roof. The central panel remains an incomplete chimney cue; the projecting chimney above the ridge is deferred. |
| R143 | One principal brick wall storey beneath a broad hip | 6.34727 + 1.97105 m, gabled | 3.35 + 1.35 m, hipped | Exact notched footprint retained. Dormer, chimney and hidden rear roof topology remain unresolved. |
| R157 | Flat-topped commercial glazing | 4.22003 + 2.31557 m, gabled | 4.20 + 0.10 m, flat cap | Existing glazing/pier dimensions retained. Separate photographed lettering fields are specified below. Roof-deck details and tree-shaped glass screening remain incomplete. |
| R159 | Flat masonry parapet and cornice over two upper arches | 6.46084 + 1.36572 m, gabled | 6.40 + 0.10 m, flat cap | Existing cornice band retained as an approximation; no hidden deck or rear parapet reconstruction is claimed. |

The source checker independently supported these bounded interpretations, including the R142 half-storey correction. Its early 5.70 + 1.80 m candidate was rejected because it would keep both upper sash entirely below the eave. That candidate is not used.

## Runtime contract

The five opt-ins live only at `appearance.reviewedEnvelope` in `route-sherbrooke-appearances.js`. They use `{datum:'source', wallHeightMetres, roofRiseMetres, roofShape}`. Composition merges these onto the existing observed appearance profiles. They do not set general `height`, `eaveHeight`, `roofRise`, `roof`, or `massing` fields and do not bypass the source-height path.

The shared resolver must first accept the source identity, exact adjacent front edge, full original ring, finite terrain samples and missing explicit dimensional tags. Root owns that app integration. For these records, preserve every source vertex; simplifying the ring can remove the exact reviewed edge.

For the accepted R142 gable, call the existing `appendFootageRoof` with a profile copy using `roof:'gable'` before the generic longest-edge roof path. That helper places the ridge perpendicular to the audited south face and clips its triangles to the actual footprint. It does not add hidden rear projections. Send the resulting wall closure triangles through the reviewed wall material path.

Only an accepted reviewed gable frontage may use `roofTop` as its facade ceiling. R142 retains `detailHeightMetres:5.7`; its actual upper window frames extend from 3.50 to 4.85 m and cross the 4.10 m eave. Every emitted trim/glass/sill/panel corner above the eave was projected onto the original frontage and checked against the actual emitted gable triangles in both Lite and Balanced modes. No corner protruded above the roof. Generic or rejected profiles keep their normal wall ceiling. The chimney panel stops at 5.65 m, below the estimated 6.60 m ridge, and remains explicitly incomplete.

R143 uses the existing clipped hip path over all eight source vertices. Its source edge is slightly skewed against the longest-side roof axis; the calculated street-eave variation is under 0.005 m. The test allows less than 0.01 m, rather than treating that harmless source skew as a large gable end.

## Thrive lettering follow-on

R157 and the more frontal R158 both visibly read **THRIVE HEALTH / PTBO**. This is an observation from the supplied footage, not verification of a current business-directory entry. No current catalogue record or PJ's Diner alias is created or changed.

The profile authors one `appliedLettering` group with `businessName:'Thrive Health'` and three fields. The shared renderer now attaches this bounded group atomically: if any fragment cannot render, partial planes are removed and no group identity is advertised.

| Field | Frontage fraction | Centre height | Maximum width × height | Outset |
|---|---:|---:|---:|---:|
| THRIVE | 0.28 | 2.45 m | 4.30 × 0.60 m | 0.255 m |
| HEALTH | 0.71 | 2.45 m | 4.30 × 0.60 m | 0.255 m |
| PTBO | 0.79 | 1.98 m | 1.45 × 0.30 m | 0.255 m |

All positions, typeface, weight and dimensions are estimates. The maximum fields stay within their respective glass half and avoid the central pier at fractions 0.47–0.53. Their lower edges stay above the green-screen approximation at 1.46 m. White transparent text uses no opaque canvas fill or backing board. The existing glass outer face is at 0.24 m; mullion outer faces are at 0.30 m. An outset of 0.255 m keeps lettering ahead of the glass and behind real structural mullions, allowing their correct occlusion.

The agreed metadata is one `renderedSigns` record only after all three fragments actually attach: exact source `way/1006594168`, frontage index 0, name `Thrive Health`, text `THRIVE HEALTH PTBO`, kind `applied-lettering-group`, exact frontage endpoints and fragment bounds/text-fit metadata. A missing canvas or one failed fragment must not advertise a complete business replacement. No fabricated additional frontage is used for the separate text fields.

`tests/route-thrive-lettering.test.mjs` checks real attached plane bounds, transparency, no downloads, exact aggregate identity, actual-sign-only directory deduplication, no PJ's Diner alias, and unavailable/partial drawing. All three tests now pass, together with the four shared sign-fit tests. These additional seven tests are separate from the 27-test silhouette pass below. Fresh screenshots remain required.

## Terrain and verification

The independent scratch sampler `reid-analysis/sample-source-terrain.mjs` reconstructed production official-DTM sampling, Float32 terrain-grid transforms and triangulated interpolation. It omits hydrography flattening. Its reconstructed ground value matched each of the five local stored v204 cab values exactly. The output is `sherbrooke-envelope-terrain-diagnosis.json` in the workspace root; the five ring sample sets are preserved in the focused test.

All five real ring sample sets passed the envelope guards. Ground ranges were 0.140, 0.215, 0.142, 0.281 and 0.140 m respectively; the highest edge grade was approximately 1.51%. Each keeps the source maximum-vertex foundation datum. No new front-datum drop or guessed terrain pad is introduced.

Focused validation passed **27/27**:

```sh
node --test tests/route-sherbrooke-envelope.test.mjs tests/route-sherbrooke-appearance.test.mjs tests/reviewed-building-envelope.test.mjs tests/sherbrooke-footage-roofs.test.mjs
```

The tests cover the exact five eligible source edges, future measured-tag precedence, source identity, immutable source inputs, real sloping terrain, lower total bounds, R142 ridge direction and full frame containment, R143 exact projected footprint area, flat-cap bounds, and existing facade details at their actual resolved ceilings in both qualities. No Frills, Laundry, Dominion, sign ownership and unrelated source profiles retain their existing behavior.

These results establish data/geometry constraints. They do not establish final screenshot quality, hidden roof accuracy, complete site reconstruction or unchanged live driving behavior. The next candidate must capture all five exact source IDs in cab and oblique views, in Balanced and Lite, and verify that R142's gable material and above-eave windows render as tested.
