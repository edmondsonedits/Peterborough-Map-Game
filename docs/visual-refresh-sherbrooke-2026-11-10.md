# Sherbrooke eight-frontage implementation — 2026-11-10

Source review is based on the owner's original R137–R190 photographs and the independent `sherbrooke-ready-fronts` / `sherbrooke-reference` ledgers. The implementation adds seven appearance-only source profiles and a separate eastern return on the existing No Frills profile. It changes facade appearance only. No source footprint, collision, wall height, roof geometry, open parking area, or garden is changed.

This document records implementation and automated checks. It is **not visual approval**. In-game comparison, actual cab-height captures, raised fly views, and oblique views remain required from the integrated CI candidate before visual acceptance.

## Evidence and bounded implementation

All eight edges use exact adjacent vertices in the current `city-explorer/data/peterborough-osm.json` rings. Coordinates are in the implementation module; each pair is ordered west to east. A south-facing wall is seen from the north-looking route camera; a north-facing wall is seen from the south-looking camera.

| Source ID | Owner photos | Observed wall / corrected cue | Implemented cue | Remaining approximation |
|---|---|---|---|---|
| `way/1006594206` | R137 | Rubidge NW, south-facing; three narrow upper sash; eastern storefront; blank west ground wall | Three upper sash and three east-only glass fields, black DOMINION LENDING fascia, no guessed entrance | Opening dimensions and positions, pale masonry color and fascia proportions are estimates; cropped sign suffix omitted |
| `way/1006575786` | R138 | Rubidge SE, north-facing; three upper sash; west shop bay, west door and separate east pale door | West window and glazed door, red LAUNDROMAT fascia; east door as a pale panel | Painted render approximates horizontal siding; bay depth and metric values estimated; COIN WASH/schedule lettering omitted |
| `way/1006575766` | R141 | Stewart SW north-facing sidewall; exactly two upper windows, blank ground wall | Two custom upper windows, pale masonry, dark green eave band; no porch or entrance | Window elevation fitted below the current mapped wall top; lower west addition and fence untouched |
| `way/1006594188` | R142 | Stewart NW south-facing gable end; four main windows plus tiny fifth opening west of chimney | Five custom openings and narrow vertical chimney-face panel; no entrance | Siding, exact gable and projecting chimney remain simplified; no roof edit |
| `way/1006575767` | R143, R144 | Stewart SE north-facing corner; two arched windows flank a central door; one principal wall storey | Two arched window overrides and one centered door, one detailed tier | Actual arch heads are shallow; renderer uses its existing circular arch. Door arch, dormer and hip roof omitted. Existing mapped wall is taller than the photographed low house |
| `way/1006594168` | R157, R158 | South-facing Thrive Health end west of immediate Aylmer corner; two tall glazed fields, broad central pier, green lower screening | Continuous glazing with fine mullions, visibly split by the broad grey central pier; two green lower panels | Tree silhouettes and transparent THRIVE HEALTH / PTBO lettering require a dedicated asset. No opaque sign plaque; `signBusinessName` records the verified identity |
| `way/1006575755` | R159, R161, R162, R164 | Aylmer SW north-facing brick end; two upper arches, two substantial lower glass-block fields; no front entry | Two upper arches, lower 1.9 × 1.95 m fields, grey base, pale keystone cues and thin parapet face band | Dimensions/colors are estimates; glass-block subdivisions, arch masonry and roof silhouette remain simplified |
| `way/755554888` | R190 | Separate No Frills north-facing eastern loading return; dark aperture under pale fascia | One dark 90%-width field, pale fascia and side piers on `additionalFrontages` | Dark pixels are not a drive-through opening. Recess, corrugations, foreground retaining wall and loading interior are not reconstructed |

The No Frills secondary frontage explicitly disables inherited wording/entry, uses its own panel list and office-style rendering, and omits a photo attachment. The primary western yellow panel, NO FRILLS sign and existing photographic maple badge remain on their original edge. The renderer's actual multi-frontage inheritance path is exercised by the regression test.

The current business directory still contains an approved PJ's Diner row on the Thrive source. No directory data is rewritten in this bounded change. The actual tall-glazing opening ceiling is 4.067 m against the mapped 4.22003 m wall, so the existing sign planner rejects an opaque automatic sign for insufficient clearance. A regression exercises that planner against the current directory and actual source height. `signBusinessName` alone does not suppress an automatic sign when `signText` is null.

## Source height constraints

The seven new profiles use `mappedBuildingDimensions` with their actual current OSM tags. Their `detailHeightMetres` only bounds facade detail and does not set building massing. Tests use these actual source wall heights instead of a fabricated ten-metre wall.

| Source ID | Current wall height (m) | Detail ceiling (m) | Highest new detail (m) |
|---|---:|---:|---:|
| `way/1006594206` | 6.82184 | 6.75 | 6.68 |
| `way/1006575786` | 6.61836 | 6.40 | 6.32 |
| `way/1006575766` | 4.24778 | 4.24 | 4.16 |
| `way/1006594188` | 5.75801 | 5.70 | 5.65 |
| `way/1006575767` | 6.34727 | 3.35 | 2.55 |
| `way/1006594168` | 4.22003 | 4.15 | 4.13 |
| `way/1006575755` | 6.46084 | 6.35 | 6.26 |
| `way/755554888` east return | 5.20 existing reviewed profile | 5.20 | 4.95 |

No Frills is an existing, non-appearance-only profile: `app.js` retains its 5.2 m reviewed wall and supplies a 5.4 m facade limit including its existing 0.2 m flat-roof allowance. Applying bare OSM dimensions to that source would incorrectly produce a 2.6 m wall; tests keep the real runtime precedence. The new east-return details remain below the existing 5.2 m wall regardless of that allowance.

Current source roof/massing mismatches remain visible. In particular, the Stewart SE source is approximately 6.35 m of wall plus a 1.97 m inferred gable, while its photo shows a low hip-roof house. Thrive has approximately 4.22 m of wall plus a 2.32 m inferred gable, while the photographed end reads as flat. This facade-only change does not claim to resolve these geometry gaps. The Aylmer block's thin parapet face band also does not change its existing inferred roof.

## Ownership and compatibility

The active `emergencyFacilityEntries()` catalog, including all five reviewed building-reconstruction GLBs, was checked against the eight IDs. None owns these targets. No duplicate override or forced facade was added to bypass authored ownership; the regression checks the catalog intersection.

The seven new profiles have `appearanceOnly` and `preserveMappedMassing` applied by normal route composition. Existing profiles retain geometry and primary frontage data. `recordingReferences=off` and `visuals=legacy` retain the existing opt-out. Geometry tests exercise both regular and Lite renderer settings; they do not claim optional scenery is enabled in every runtime quality mode.

## Validation

`tests/route-sherbrooke-appearance.test.mjs` first failed for the absent module, then for missing production composition while the root integrator wired the new records. Its checks cover current adjacent edges and street-facing normals, default opt-out and source preservation, real source-height bounds, panels retaining their authored heights rather than clamping into thin strips, separate door/window/sign layouts, corrected observed counts, and No Frills multi-frontage inheritance.

Direct real-Three.js render inspection of all eight records confirms finite geometry below the current source wall limits. After composition, all 68 checks in the focused Sherbrooke/Reid/Chemong/source-height/facade/sign compatibility command passed, including the 11 new Sherbrooke checks. The first compatibility run caught the `masonry` alias being unavailable to the direct material recipe installer; the two painted walls now use the supported `render` recipe, and the rerun passed.

An independent source reviewer re-viewed R137, R138, R141, R142, R143, R157, R159 and R190 plus the renderer loops, finding no blocking source-reference issue in counts, handedness, corrected openings or No Frills inheritance. Final visual CI acceptance still belongs to the integrated candidate after versioning; this review does not approve the in-game appearance.

## Owner source provenance

Source paths identify the supplied archive contents; no third-party imagery was downloaded or introduced.

| Photo | Source path | SHA-256 |
|---|---|---|
| R137 | `dense/flat-768/frame_0195_lens1_pitch+0.jpg` | `40ca73a56cf2ed40b3fd3b8ba269b1b80c80a9576f8f3b680f120363bf27eb74` |
| R138 | `dense/flat-768/frame_0197_lens0_pitch+0.jpg` | `ca250912307811b549760da2b0df595b637004995549a6c2c16d2d596c3a558a` |
| R141 | `dense/flat-768/frame_0200_lens0_pitch+0.jpg` | `75c9f940a3f1b505b7d5615f38fe60f85d25d2be455b14eda2b4d45f5a8af593` |
| R142 | `dense/flat-768/frame_0200_lens1_pitch+0.jpg` | `38ee27e8e77fc4f7343565c72f112651c5a4e78c4e377db86d19c73331e77e97` |
| R143 | `dense/flat-768/frame_0201_lens0_pitch+0.jpg` | `79bc19650e8b218b22c554ce3062efbd5da0f7ae4109b7b22dfeec5bf140116c` |
| R144 | `dense/flat-768/frame_0202_lens0_pitch+0.jpg` | `0af17fc75aea132b4dbb0955ec965fd120e0da58da79bc2181effb6c0f99a26b` |
| R157 | `dense/flat-768/frame_0222_lens1_pitch+0.jpg` | `fbaf6153ea73bfd51834f540c01cc2c10b3feb7c5aa1949e11adc8ad32cd0f48` |
| R158 | `dense/flat-768/frame_0223_lens1_pitch+0.jpg` | `262c16275236a479ebce19d1128a830cfd890a30e3ef6dbcb5400a7926265249` |
| R159 | `dense/flat-768/frame_0228_lens0_pitch+0.jpg` | `688ce67a97f639deeb96fe08ae42b513e54970d167959addeac4cf1a56d2a5f5` |
| R161 | `dense/flat-768/frame_0230_lens0_pitch+0.jpg` | `3a3c435aed719e38d9300575b0212f038dabf3c14970ccdb856a83f75289d647` |
| R162 | `dense/flat-768/frame_0234_lens0_pitch+0.jpg` | `ddc4f80c02546b7b529fe499a04242779b4910078beb60a67b93487855ae26c8` |
| R164 | `dense/flat-768/frame_0240_lens0_pitch+0.jpg` | `637cf3ed38d4282e64a1bb30f3c372963092759e97a1cb1b1b73d2d8689dca86` |
| R190 | `dense/flat-768/frame_0294_lens0_pitch+0.jpg` | `04d4a6685d2ac2744378f245b9fccfad47c1663a0591094da9f79556b41df2d0` |
