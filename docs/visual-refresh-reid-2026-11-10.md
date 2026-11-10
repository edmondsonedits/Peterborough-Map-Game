# Reid photo appearance batch — 2026-11-10

Candidate implementation based on `e3986c3` / v1.6.202. This continues the southbound photo route with six independently matched source buildings between Parkhill Road and the Dublin approach. Source photos are R073–R083 from the supplied October 18 drive. R069–R132 were reviewed for route and intersection context in `reid-reference.md`; the accompanying `reid-next-batch-plan.geojson` supplies exact current source rings, ring-adjacent frontages and estimated QA poses.

The initial six-source batch changed bounded appearance records only. A later v1.6.206 candidate, described below, adds two explicitly reviewed visual-envelope corrections after v1.6.204 cab captures exposed an oversized inferred bungalow and a remote foundation datum. Source footprints, source/physics dimensions, collision, roads, terrain and gameplay remain unchanged. The existing route composition adds the records only when recording references and expansion are enabled. Browser/cab visual approval remains a separate gate.

## Match and observation ledger

The vehicle travels south on Reid. Lens 0 predominantly looks west, and lens 1 east. West-side buildings face east toward Reid; east-side buildings face west. All six selected main facade segments use exact adjacent vertices in the current OSM ring. Precise source coordinates do not imply surveyed facade dimensions.

| Current source | Evidence and location | Observed cues used | Explicit approximation or omission |
|---|---|---|---|
| `way/446339087` | R074, R076, R078; Edinburgh northeast | Pale service-building wall; dark red fascia; readable Jiffy Lube name toward its south end; two garage bays on the north part of the west face; red entry zone farther south | Only two broad garage panes on the mapped west edge. Fine grid bars are not supported by the current renderer and are deferred. The separate south-return garage bay is not copied to this face. No apron or roadside sign objects added. |
| `way/1002680974` | R073; first west-side house south of Parkhill | Sage color, white trim, two upper narrow sashes, lower window and northern entry beneath separate low gray awnings | Numeric openings/fractions are estimates. One shallow entry canopy and one thin over-window trim approximate the awnings. Existing gable geometry retained. |
| `way/1002680975` | R073, R075; next house south | Pale siding color, one upper/attic sash, enclosed pale-framed porch glazing, red-brown lower porch wall | The porch is represented by bounded flat panes/base panels, without creating a new volume. Default open porch posts and a guessed centered door are explicitly disabled. Pane subdivision is estimated. |
| `way/1002680782` | R077; Edinburgh northwest | Tan bungalow, dark shallow roof color, broad pale-framed window group, rough gray-brown lower entry wall | Single broad window and entry cues; no extra openings at the shrub-obscured north end. Simple lower-wall color band does not claim exact stone construction. Follow-up estimated visual eave/hip rise corrects its oversized untagged source silhouette; source/physics dimensions remain intact. |
| `way/1005415712` | R078; Edinburgh southeast | Raised reddish-brick main house, pale visible upper trim, pale enclosed/screened porch and gray base | Trees obscure much of the wall. Only one upper opening is retained on the main mapped front, plus restrained porch panes. Default open porch and guessed entry are disabled. Follow-up front-edge visual datum removes the remote rear-corner lift. No new full-ring gable or upper openings on the lower south return. |
| `way/1002680800` | R083; west side north of Dublin | Red brick, two narrow upper sashes, broad low dark porch roof, pale posts, two pale doors and one lower dark sash | Two bounded opaque door panels replace the single default entrance. No door animation or collision opening implied. Porch depth/post spacing and the hip-like roof description are estimates, not a surveyed roof plan. |

All decimal dimensions, colors, material roughness and frontage fractions are estimates recorded in each data record's `estimated` field separately from its observations. The two service bays and two duplex doors are directly observed counts. Unseen elevations are not verified. Pale-sided buildings use the existing `render` material recipe as a restrained painted-wall treatment; this is not a horizontal siding-board reconstruction.

## Corner coverage and deliberately excluded matches

This batch covers the Edinburgh northwest bungalow, northeast service building and southeast raised brick house. It does **not** claim all four corners are verified. The old R079 assignment to `way/1002680794` is unresolved; `way/1002681002` is a stronger candidate for the photographed blue-gray house farther south but is not included.

R081's `way/1005416166`/`way/1005416163` light-house assignment remains unresolved. Official source `6/20155` conflicts with the recorded open lot north of Jiffy Lube and is not suppressed here. The open lot, broad forecourt, Edinburgh retaining wall, Reid bridge parapets, Kirk porch/main-wall segmentation, later Reid intersections and Aji Sai are outside this six-source batch.

The lower south return inside `way/1005415712` remains in its existing source representation. The photo shows it is lower than the main house, but this pass does not derive a replacement massing zone from an oblique, partly obscured image.

## Runtime and verification

The new `route-reid-appearances.js` exports only these six records. `route-landmark-appearances.js` includes that registry after the existing Chemong registries. New source profiles receive `appearanceOnly` and `preserveMappedMassing`; an existing profile retains its frontage, eave, roof and massing data. Unsupported old-patch fields such as `doorFractions`, `windowMullions`, `windowTransom`, `observedRoofShape` and `parapetColor` are not copied.

`tests/route-reid-appearance.test.mjs` was first run before implementation and failed all five tests because the verified registry did not exist. After implementation the tests passed. They exercise production composition and opt-out, preservation of existing geometry fields, exact adjacent ring edges and correct east/west normals, finite Three.js geometry within the supplied height, supported material installation, two Jiffy bays on the correct face, enclosed-porch defaults, and two separate duplex door panels without a third default door.

The independent Reid reference reviewer inspected the candidate records and found no blocking observation mismatch: N→S orientation, the Parkhill northern entry, the enclosed-porch restraint, the single occlusion-limited Edinburgh SE upper opening and the two-door duplex treatment agree with the supplied photos. The review does not approve a roof reconstruction or lower-return correction, neither of which this batch performs.

The focused impacted suite passed 37/37 tests, and `node --test tests/*.test.*` passed 1,590/1,590 tests. Syntax and whitespace checks passed. Browser/cab screenshots are tracked separately; source matching and geometry tests do not establish a final rendered visual match.

## Jiffy source-height correction

The source-height integration review found that Jiffy's one-level `building=yes` source resolves to a 2.60 m wall, despite this appearance record's former 3.60 m decoration cap. The original fascia request at 2.70 m collapsed to a 0.05 m strip at the roof; the earlier 10 m geometry fixture did not expose it.

The west fascia now occupies 2.14–2.56 m (0.42 m tall), with the sign centered at 2.30 m on a 0.30 m board. The two service panes and entry remain distinct and each is 2.05 m tall; the panes start at 0.08 m. These are closed decorative cues, not asserted vehicle-access clearances. The current low inferred height and roof require a separate geometry review before claiming the photographic scale is reproduced.

The five Reid geometry/behavior tests now render the actual mapped source height. A shared four-test route source-height regression covers all 22 active source profiles, fascia visibility, panel/window bounds, practical entry height, named sign bounds/occlusion, and the separate Walmart fallback/GLB scales. The data correction does not change the six-source match decisions, frontage orientation, collision or model massing.

Correction verification: 41/41 focused tests and 1,600/1,600 full-suite tests passed; the three route suites passed all 17 source-height/default/geometry assertions.

## v1.6.206 candidate: reviewed visual envelopes

The exact v1.6.204 Balanced cab captures in `qa-captures/f7d9610/evidence/current/balanced/reid-controls/` exposed two different defects. The full R077 and R078 originals, their exact OSM footprint/frontage edges and the production foundation path were reviewed again before choosing the correction. Photo-based heights below are estimates. The model elevations in the table are calculated from the current terrain and source data; they are not surveyed building heights.

| Source and image | Verified cause | Bounded display correction |
|---|---|---|
| `way/1002680782`, R077 | Untagged source inference supplies a 6.10053 m wall and 2.07907 m roof rise to a low, broad bungalow. The whole-ring ground maximum is only 0.10029 m above the lower frontage endpoint, so a foundation correction would not address the tall wall. | Keep the source datum. Estimate a 3.2 m visual wall and 1.1 m shallow hip rise. The hip form is an estimate supported by R077 and the orthophoto; it is not a measured roof plan. The clipped irregular roof path keeps the exact source ring. |
| `way/1005415712`, R078 | The source base is the maximum ground over the whole ring, 10.38555. The exact west frontage is at 7.51574–7.76518. The remote high rear corner therefore lifts porch details 2.62037–2.86981 m above local front grade. | Use the higher of the two verified front-edge ground samples, 7.76518, for the visual foundation. Keep the source 6.02873 m wall, 1.70639 m roof rise and existing roof construction path. The new eave remains more than 0.5 m above the highest rear ground. |

The terrain diagnosis independently reconstructed the official DTM sampling, Float32 terrain grid and triangulated interpolation. Its reconstructed terrain height matched both stored cab ground diagnostics exactly. The scratch evidence is `reid-source-base-diagnosis.json`. R077's resulting model wall/roof tops are approximately 8.47761/9.57761; R078's are 13.79391/15.50030. These values describe the current local terrain coordinate system only.

`reviewed-building-envelope.js` exports `resolveReviewedBuildingEnvelope({profile, sourceId, ring, groundHeights, dimensions, project, tags})`. The result supplies `foundationTop`, `wallTop`, `roofTop`, resolved `dimensions`, `applied` and a diagnostic `reason`. `ring` must be the original simple outer ring without a repeated closure, and `groundHeights` must contain one sample per vertex. The optional `reviewedEnvelope` is stored only in the source-keyed appearance record: `datum` is `source` or `frontage`; a silhouette estimate provides all of `wallHeightMetres`, `roofRiseMetres` and `roofShape` (`flat`, `hipped` or `gabled`). A datum-only record retains the source dimensions object and roof path.

The resolver requires the exact matching source ID, an observed/reviewed appearance profile, an exact adjacent source frontage, a valid simple ring and finite ground/dimension data. It declines bespoke massing/recorded-roof profiles and any explicit source height, storey, roof or base tag. It also rejects a terrain-edge slope above 0.4, a foundation drop above 3 m, ground within 0.5 m of the new eave, an increase in the inferred wall or total envelope, and invalid/unsupported roof estimates. This confines the correction to reviewed display meshes; `buildingDimensions`, geographic coordinates, terrain, collision and gameplay paths retain their existing source values.

Root integration preserves original rings for the reviewed opt-ins before simplification, resolves the display envelope after source dimensions and ground samples, and uses its returned dimensions throughout roof assembly. R077's explicit hip uses the existing clipped irregular roof path, avoiding the captured-profile flat-slab fallback. R078 remains a datum-only correction. The existing simplifier had retained R078's two exact front vertices but removed a small notch elsewhere; the integration test verifies every original vertex and polygon area, rather than claiming that the front edge had disappeared.

The eight helper tests cover the real source dimensions and reconstructed sloping terrain, bounded clipped-hip geometry, near-grade R078 porch placement, unchanged source inputs, explicit source metadata precedence, invalid/mismatched geometry, unsafe terrain, flat/hip/gable estimates and actual production ring preparation. The five Reid facade tests now use the resolved visual wall. Together with the twelve East City composition and sign tests, the focused run passed 25/25 after the app hook landed. The East City sign checks retain source/frontage identity and directory deduplication while checking the added text-fit metadata in full and Lite modes.

Fresh cab images remain the visual gate. R078's lower south return and the photographed retaining wall are still not reconstructed; the front-datum correction alone does not establish their final shape. No roof subtype or numeric dimension in these two photo estimates is presented as surveyed fact.
