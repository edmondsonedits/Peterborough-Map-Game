# Peterborough Fire and Paramedic Facilities

**Research and asset snapshot:** 2026-10-27. These five Peterborough, Ontario facilities are represented by local game assets. The GLBs follow their checked-in GIS footprints and anchors; facade detail is evidence-bounded rather than a claim of complete as-built reconstruction. Sources and limits are recorded in [fire evidence](fire-evidence.md) and [EMS evidence](ems-evidence.md). GIS contracts are in [contracts](contracts/).

## Facilities and current exports

| Facility | Address | GLB bytes | Current SHA-256 |
|---|---|---:|---|
| Fire Station 1 | 210 Sherbrooke Street | 1,972,316 | `228909c654890e17149c8ec833077027b09f656093b2554ca836838f229186c4` |
| Fire Station 2 | 100 Marina Boulevard | 1,111,204 | `a8edc41f24b0fd755b564438bd7b22c93ebe59d593f9efc5b1cf06dcab40ba01` |
| Fire Station 3 | 839 Clonsilla Avenue | 1,952,492 | `a9e68f3859e1a12245de3235d5cefea9e71a8b0f67d6464b53e85f7ed22f77b5` |
| Paramedics Headquarters | 310 Armour Road | 360,960 | `3229cd5d3cfbd6da7bb7733ddbf173f9e90d2d92e2afa2fa023f5f14230b8517` |
| Paramedics Station 7 | 1003 Clonsilla Avenue | 323,816 | `dd1eb07eb33e725ae69e87cfff7afa4898df8de2b81bc6529cb70434defc7edc` |

All assets are under `city-explorer/assets/<facility-id>/`; each includes a `layout.json` and `asset-report.json`. Materials and textures are original/procedural. No reference-photo pixels are embedded. Blender builders are under `tools/blender/`. Native Blender sources and review renders are outside the game tree: Station 1 is under H:/ChatGPT/Peterborough-Station1-20261027/model/; Station 2 is under `H:\ChatGPT\Peterborough-Station2-20261027\model\`; Station 3 and the EMS bases are under `H:\ChatGPT\Peterborough-Facilities-20261027\model\`.

## Evidence limits and game behavior

- **Station 1:** The user confirmed five apparatus doors on the rear and one door on the side of the rear shed. This is user-provided layout information, not rear-photo evidence. The documented front remains dynamic; rear doors and the shed-side door are static visual geometry.
- **Station 2:** JCB photos support the three red glazed front doors, dark masonry, tall front tower, fascia and timber/glazing treatment. The installer specifies two additional sectional doors, but their wall position is not verified. Rear placement is inferred; rear panels remain closed in the current play controls, and their independent nodes are preserved. Front door pivots and gameplay behavior remain intact.
- **Station 3:** City photos from July 2018 show the front and a short side return, including three glazed doors and an upper louver. Rear elevation and rear door count remain unknown. The three rendered front doors are static.
- **Armour Road EMS:** Evidence confirms only the headquarters sign and a partial brick-and-glass entrance with pale canopy edge. Full massing, roof, sides, rear, and any apparatus openings are not established. No door count is asserted.
- **Clonsilla EMS:** County photo supports the branded storefront, glazing, mullions, light fascia and blue/orange bands. A 2017 opening story documents two vehicle bays, but not exterior door placement. Two doors on the setback-side wing are modeled as estimates; EMS doors are static.

These are local assets only. This documentation does not assert that all elevations, dimensions, plans, or roof details have been verified, and it does not describe an upload or public release.

## Local verification

- All 894 Node game/editor regressions passed, including seven facility replacement tests and editor restore coverage. CI includes the new facility tests.
- All five final GLBs passed the Khronos validator with zero errors/warnings and untruncated reports. See [asset-validation.json](asset-validation.json).
- Browser gameplay: Station 1 starts in the second bay from viewer-right with closed doors; its aligned front door opens and the truck drives out. Station 2 retains its right-bay start and front-door drive-out. Station 3 retains its existing apron start and movement.
- All five authored facilities load together with exact source-building replacement. Front/rear/side views were inspected. Blocking Station 3's GLB preserved the generated building and allowed the other four assets to load.
- A focused independent code review found an authored-editor replacement overlap; the fix and both load-order/failure regressions passed follow-up review.
- Stations 1 and 2 also receive terrain-sampled foundations when rendered as unselected scenery, matching the existing playable-station terrain support.
- EMS wall skirts extend 1.2 m below the model datum to meet the sloped GIS surface. This is a rendering accommodation, not a surveyed foundation.
- Detailed browser receipts, model validation logs and screenshots are in H:/ChatGPT/Peterborough-Facilities-20261027/qa/. Playtest receipts: gameplay-facilities.json, ems-and-fallback-qa.json and final-visual-qa.json. Rebuild the original models with Blender 5.2 using the checked-in builders; the Station 3 and EMS builders read the checked-in GIS contracts.

Public deployment was not performed for this revision.