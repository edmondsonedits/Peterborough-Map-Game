# Video-referenced building improvements — 24 October 2026

Local worktree: `H:/ChatGPT/Peterborough-Map-Game-Sherbrooke`, branch `codex/sherbrooke-existing-city`. Publication authorized by the user on 24 October 2026; release v1.6.126 is prepared for the existing GitHub Pages deployment.

## Reference coverage

The selected October 18 original recording is 944.043 seconds long. The screenshot index covers source frames 0–28292 at intervals of at most 2.002 seconds: 473 paired timestamps, 946 raw lens screenshots and 2,838 aimed perspective previews. All 3,784 dense reference images were checked for existence and decoding. Sixteen contact sheets cover every third sample (about six seconds); this is sampled visual review, not a claim that every frame or every property was individually inspected. Selected buildings also have original-resolution extractions and 2048-pixel, 100-degree FisheyeReframer views.

References and source hashes: `H:/ChatGPT/Peterborough-Building-References-20261024/REFERENCE-CATALOGUE.md`. Originals were preserved. Existing experimental lens calibration was reused; these images and dimensions are visual references, not surveyed measurements.

## Implemented buildings

| Source ID | Building | Local improvements |
|---|---|---|
| way/1006243562 | Commerce Building / St. Veronus, southwest Hunter/Water | Brick and masonry base, three main floors, separate small arched attic openings, cornice and brackets, sign, details on both street faces. |
| way/1006243555 | Scotiabank, southeast Hunter/Water | Two-level pale masonry facade, broad upper/lower glazing with mullions, bank sign, details on both street faces. |
| way/176908281 | Shoppers Drug Mart, 971 Chemong | One-level light retail exterior, flat parapet, glazing and red sign band on the Chemong-facing wall. |

Profiles and provenance are in `city-explorer/video-building-profiles.js` and `city-explorer/video-building-evidence.json`. Reviewed facade groups share the existing editor hide/restore linkage. Original map footprints remain the placement authority. No new runtime photo files were added; existing six photo facades and gardens remain available. Unmatched houses and obscured sides/rears were not assigned invented identities or details.

## Verification

- 31 related Node tests passed, including source alignment, road-facing storefront, separate attic arches, broad bank glazing, finite geometry, editor visibility, sign clearance and readable text for either endpoint order.
- Desktop and 390×844 narrow-lite browser checks passed: 19 linked frontage groups, zero page/request errors, existing six photo facades loaded, mural and station linked, gardens present and truck movement working.
- Draw calls observed: desktop 584 (baseline 540), narrow-lite 319 (baseline 319). These are local observations, not frame-rate or physical-phone certification.
- Before/after desktop views and final narrow-lite views: `H:/ChatGPT/Peterborough-Building-References-20261024/map-qa/`. Downtown views use matched cameras. The final Shoppers view was moved from aerial to road level to check the corrected frontage and readable sign.
- Scoped independent review verified downtown source matches and the Chemong frontage/sign clearance fixes. Screenshot inspection additionally exposed and corrected mirrored sign lettering.

Open locally at http://127.0.0.1:8870/city-explorer/?qa=1&analytics=off while the local server is running. Browser camera poses are recorded in the reference package's QA script/report.
