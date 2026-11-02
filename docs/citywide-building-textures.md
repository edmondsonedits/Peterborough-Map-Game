# City-wide shared building textures

City-wide extension of the accepted Station 2 pilot, prepared for the user-authorized v1.6.165 release. The QA receipt below records pre-release local measurements.

## Scope and coverage

Every eligible rendered ordinary building uses the existing shared wall patterns and opening artwork. The renderer audit accounts for 30,564 source building parts: 30,513 textured and 51 explicitly excluded, with zero unresolved parts. Those parts currently have unique source IDs. The ordinary generated registry has 30,563 records because the ready Station 3 replacement returns before adding a fallback record.

Exclusions: 48 captured/reviewed frontage buildings, one reviewed custom facade (Station 1), one reviewed Station 2 replacement, and one ready authored Station 3 GLB. Ordinary houses within the older Station 1 prototype radius are included. General inferred appearance profiles remain eligible. Existing authored replacements still own their normal ready/fallback lifecycle and editor binding.

Source footprints, heights, roof geometry, geographic placement, collision, roads, dispatch and station behavior remain authoritative. Generated doors/windows are illustrative and are not claimed to be surveyed property details.

## Implementation and cost controls

- Reuse the same four 256x256 wall textures (brick, render, siding and stone) and four 128x256 opening textures. No textures are generated per building. Maximum shared texture storage including mipmaps remains approximately 2 MiB.
- Existing spatial/material batches contain the wall and opening triangles. World-metre wall UVs and stable ID-based tints provide variation; frames and panes are painted into shared textures rather than separate window meshes.
- A spatial road grid returns nearby frontage candidates. The observed average is 12.57 candidates per query from 53,864 indexed road segments.
- The city-wide branch has a per-part cap of 16 actual openings in Balanced/High and 8 in Low. Budget is distributed across faces and floors, without a city-wide cap that silently leaves later neighborhoods bare. The original Station 2 pilot retains its richer treatment.
- Existing distance culling removes optional openings farther away. Every quality profile keeps wall texture coverage. Building appearance is resolved once per building and reused across its faces.
- City-wide opening counts do not consume legacy facade budgets. Excluded custom massing keeps its original decorative detail path.
- Per-part coverage diagnostics require considered = covered + excluded, eligible = covered, and zero pending parts. Aggregate metrics avoid serializing tens of thousands of IDs on every sample.

The app is integrated through city-explorer/citywide-building-facades.mjs and the existing station2-neighborhood-* modules. The release normalizer knows the new module and its shared archetype dependency; the production release is v1.6.165.

## Critique and verification

Used one Luna implementation worker, followed by parent code review and standalone Playwright game checks. Review corrected overly broad prototype-area exclusion, legacy budget starvation, custom-massing preservation, a coverage-accounting branch, and the distinction between Balanced and Low opening budgets. The same eight textures now serve all ordinary buildings.

Compared north, west, east, downtown and south views with the original renderer. Additional close-up and Station 1 views checked texture scale, opening placement and custom-station preservation. Baseline and expanded runs retain the same 50 existing detailed frontage groups. Station 2's bay opens and the truck drives more than 40 metres out of the station.

46 focused tests passed (28 facade/appearance/roof/facility tests and 18 release consistency tests), plus existing city editor override and integration checks. Affected appearance tests were repeated after the style-reuse optimization. Syntax and whitespace checks passed.

See citywide-building-textures-qa.json for final measured coverage, draw counts, frame samples, startup times and screenshots. The headless desktop samples are vsync limited and do not establish physical-phone performance or GPU headroom. Full-city construction increases initial loading work; steady driving samples remained close to the baseline. Road-pack regeneration is deferred to the normal publication workflow because this local change does not alter road geometry.

## Reproduction

Use a static server for this checkout, then run tools/check-citywide-building-textures.cjs with Playwright available through local dependencies or NODE_PATH. CITY_QA_URL sets the server URL; CITY_QA_OUT sets the artifact directory; CITY_QA_MODES accepts baseline,city,low. The default output is artifacts/citywide-building-textures.

The default game URL enables the expansion. Add cityFacades=0 (or cityFacades=pilot) for the old Station 2-only rendering. The existing station2Facades=0 switch opts that pilot area out while leaving the rest of the city-wide expansion active.