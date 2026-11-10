# Ultramar / Husky identity and canopy sign correction — 2026-11-10

The approved business row `osm:node/462351260` displayed **Husky** on fuel canopy `way/446339023`, at municipal parcel 4326 / **852 Chemong Road**. Owner photo R041 visibly reads **Ultramar** on that canopy. A Parkland station roster independently corroborates the Ultramar brand at the exact address. This candidate replaces the active Husky placement with a distinct reviewed Ultramar record and preserves the original evidence. It belongs with the later canopy/surface candidate, not the v1.6.205 Cricket/East City checkpoint.

## Evidence and date meanings

| Evidence | What it establishes | Date / limitation |
|---|---|---|
| R041, with R043/R049 context | White Ultramar lettering on the navy southwest short canopy fascia. R041 also shows a separate Ultramar roadside pylon. The neighboring three-door garage is a different footprint. | Owner recording: 2026-10-18. Individual photo inspected on 2026-11-10. The pylon is not a second directory placement. |
| [Parkland's official 2025 Journie contest roster, PDF page 19](https://assets.ctfassets.net/yc16dpnaxmku/7cBkzEJYtwkAG2BWaVx7qr/078c3ea6d40859fc9ef285524000bba1/L-Aventure_Canadienne_Ultime_2025-_R%C3%A8glement_Officiel_du_Concours_2025_-_FRANCAIS.pdf) | Station **43406**, **BELLEVUE ULTRAMAR**, **852 Chemong Rd, Peterborough, ON K9H 5Z8**. The document identifies Parkland as its organizer. | Official roster for the May–July 2025 contest, retrieved 2026-11-10; this is not a 2026 publication or an on-site inspection. |
| [Municipal parcel 4326](https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer/4/query?f=pjson&objectIds=4326&outFields=ADDRESS&returnGeometry=false) | The existing catalogue's civic address corroboration is 852 CHEMONG RD. The canopy retains its mapped source identity. | Existing source retained; the photo and official roster corroborate the address/name association. |
| [Original OSM node](https://www.openstreetmap.org/node/462351260) | The catalogue's former Husky name and pin. | `observedAt: 2026-10-25T00:46:44.147576+00:00` was an OSM retrieval timestamp, not proof that a Husky sign existed on that date. |

The current [official Ultramar site](https://journie.ca/ultramar/on-en) and [locator](https://journie.ca/ultramar/on-en/locations) were checked. A site-specific current locator result was not retrieved. Indexed historical Husky transition schedules agree with the brand change, but their direct URLs now return 404, so the decision does not depend on those snippets. The official roster and the owner's newer physical sign evidence establish the display brand used for this scene. No current legal operator, opening hours or prices are asserted.

The downloaded official PDF has SHA-256 `bd1c42e4959564348f75506dd6679a4f68c23aa134ac358dd9e8087fcd17b0e3`. R041's original source export is `Peterborough-Building-References-20261024/dense/flat-768/frame_0057_lens1_pitch+0.jpg`, source SHA-256 `4bb30b281516cf9defd538691a59d71b4d46296070504e4977e6066678847d17`. That hash identifies the original export in `photo-index.csv`, not the resized 680-pixel handoff image.

## Persisted identity decision

`business-current-overrides.json` now contains:

- A suppression for `osm:node/462351260`, including the full unchanged original catalogue row, the photo evidence, the official source and the conflict explanation. **Husky is not an Ultramar alias.**
- A distinct addition `reviewed:ultramar-852-chemong`, with display name **Ultramar**, source business ID `parkland:43406`, address **852 Chemong Road**, and reviewed building match **`way/446339023`**. Its `observedAt: 2026-11-10` is explicitly documented as the combined source review date; the physical sign observation remains dated 2026-10-18.

The separate addition path retains the correct review date. The legacy rename-override path currently stamps its original 2026-10-24 date; that unrelated date behavior was not changed. The OSM source dataset and the neighboring garage record remain unchanged.

## Placement and generator change

The current exact southwest fascia edge is `(44.3189701, -78.3312310)` → `(44.3189170, -78.3311783)`. It is the same edge as the canopy definition, with reversed endpoint order. Its centered name is **Ultramar**, matching the canopy's `signBusinessName` so the existing successful-render deduplication can recognize it.

| Reviewed placement field | Value | Purpose |
|---|---:|---|
| `openingTopMetres` | 4.70 | Keep fallback lettering above the open space below the canopy. |
| `heightAboveBaseMetres` | 4.95 | Requested fascia sign center; the ordinary planner may clamp it for clearance. |
| `heightMetres` | 0.35 | Bounded fallback board height. |
| `widthMetres` | 4.10 | Bounded width on the short fascia. |
| `fraction` | 0.50 | Center on this exact frontage. |

These dimensions are estimates coordinated with the reviewed canopy's 4.70 m underside and 5.25 m top, not measurements from the photograph. The actual canopy-rendered lettering is a separate component. No directory name is assigned to the garage, pylon, southeast return or hidden edges.

`tools/build-business-directory.mjs` now preserves these five already-supported fields **only from reviewed additions/overrides**. Unreviewed normalized input cannot supply them. Explicit opening clearance is combined with inferred clearance using the larger value; ordinary defaults remain in use when no reviewed value exists. The existing wall selection, height/width fitting, occlusion checks and rejection logic still run. An excessive reviewed clearance produces `needs-review`, not an approved floating sign.

Runtime integration must expose the canopy's actual roof top as the signable feature's `partHeights.wallTop`. At a 5.25 m wall top the fallback board fits wholly above 4.70 m; at a 4.70 m wall top the planner rejects it. This data/generator change does not alter renderer or app code.

## Catalogue scope and validation

The generator was run into an isolated scratch output using the original Husky row plus the existing reviewed additions. Only its resulting Ultramar row was copied into the shipped catalogue. A complete citywide regeneration was not performed. A semantic comparison verifies that **all 2,278 unrelated catalogue rows and all 1,332 unresolved records are unchanged**. The catalogue-row count includes directory panels regardless of approval status.

Both coverage files change `supersededSourceRecords` from 1 to 2 and `reviewedAdditions` from 3 to 4. Business totals and approved counts are unchanged. `runtimeVerified` is false, and an explicit invalidation note identifies the retained v1.6.129 runtime receipt and rendered-name metrics as historical. Current canopy replacement/fallback behavior still needs runtime checking.

The new regression checks first failed for the missing suppression, active Husky placement, stale runtime flag, discarded reviewed placement fields and missing fascia candidate. They pass after the changes. They exercise the real offline generator, including a temporary isolated fixture for reviewed overrides, ordinary defaults and an impossible-height rejection.

`node --test tests/ultramar-business-identity.test.mjs tests/business-building-match.test.mjs tests/business-sign-layout.test.mjs tests/business-sign-renderer.test.mjs` — **42 passed, 0 failed**. This includes actual fallback layout within the 4.70–5.25 m fascia, plus rejection below that band.

`node --test tests/*.test.mjs tests/*.test.cjs` — **1,692 passed, 0 failed**, 27.17 seconds, on the current shared candidate tree. The builder syntax check and owned-file whitespace check also pass. This is source/data validation; it does not claim cab-view approval or publication.
