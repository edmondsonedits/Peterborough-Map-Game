# Station 1 research and design

Create an editable Blender model and integrated local Station 1 experience at 210 Sherbrooke Street using the Station 2 workflow authorized by the user. New source/model/evidence outputs: H:/ChatGPT/Peterborough-Station1-20261027. Existing isolated game checkout is reused on codex/station1-blender-20261027; Station 2 remains intact. Publication is a separate request.

## Evidence and appearance

The controlling exterior reference is the owner's inspected 0158_LEFT_SIDE.jpg: five red overhead doors with a low row of four small windows, dark brown structural piers and shallow canopies, yellow bollards, orange/buff masonry, a projecting polygonal watchroom, deep dark ribbon windows, and raised rear roof with sloped clerestory. 0149 shows the west side; 0170 shows the eastern wing and detached training tower. The frame SHA-256 matches the existing provenance manifest. Orthophotography and OSM way/1009651229 constrain the main footprint; city-building/6/3300 constrains the tower footprint. Old four-door metadata is superseded by direct photo evidence.

The City 2018 interior photograph visibly establishes pale mint lower walls, a dark teal belt, cream upper block, white exposed trusses, services, overhead door tracks and yellow exhaust extraction. The 2011 PtboCanada tour documents dispatch, training, a gym, heritage displays and gear storage; it does not establish current room adjacency. Model a detailed usable apparatus bay and shallow glazed watchroom, and preserve the other wings as exterior masses. Full dimensioned room plans have not been publicly retrieved. Doors/heights/finishes are photo-derived estimates, not surveyed dimensions. See [sources.md](sources.md) for the inspected-source ledger. The detailed search report is preserved at H:/ChatGPT/Peterborough-Station1-20261027/research/document-research.md.

## Build contract

The layout JSON is the shared dimensional/transform contract. Five 4.1 x 4.5 m estimated openings fit the 23.918 m surveyed-line facade. Front faces -Z; positive X is viewer-left; yaw -177.19203870294788 degrees. The second bay from the right uses x=-4.64,z=9, with the player beside it. All doors begin closed, G/button/touch operate the truck-aligned front door, E enters/exits, and Start in truck resets position and doors. Use sectional overhead motion, not Station 2 folding leaves. Preserve vehicle clearance and obstruction reopening.

Native Blender scene, deterministic Python build, optimized GLB, original tileable materials, stable independent door nodes, model report and renders are required. No reference-photo pixels ship as textures. The tower has its own terrain-adjusted parent. Support real floor/ground continuity and retain GIS roads, planting, flag and nearby frontage.

## Integration and acceptance

Use a bounded Station 1 runtime implementing the same app-facing methods as Station 2. Reuse proven pure coordinate/door state helpers as appropriate. Generalize only the selected-station adapter hooks in app.js; keep existing Station 2 QA state/control IDs compatible. Hide only the exact replaced source records after successful GLB load and after editor override restoration, including the old Station 1 facade detail. Failed asset load retains original scenery, disables new collision, and uses the previous safe apron spawn.

Verify source-photo silhouette, colours and bay details in Blender and at game truck-eye height. Verify GLB axes/panels/bounds/budget; local transforms, spawn and swept collision; all-closed startup, targeted opening, blocked closed door, drive-out and return; full/lite load, touch and fallback. Run station/pavement/road/editor regressions and the complete release test suite before final local acceptance. Preserve unrelated stations and concurrent work.

## Second-bay and exhaust-hose revision

The user's follow-up selects the second bay from the right, viewed from the street. Move the truck from local X=-9.28 to X=-4.64 and move its companion player by the same 4.64 m, to X=-2.01. Keep all doors closed at spawn and operate only the newly aligned door.

Replace the twelve straight yellow rods with a restrained set of five stowed exhaust extraction assemblies. The City interior photo establishes flexible corrugated yellow hose connected to overhead metal servicework. Use curved ribbed tubes, compact couplings and thin support lines; keep the parked assemblies above and beside the driving lanes. Count, exact route and stowed position are representative details, not measured installation drawings. Verify the result in Blender and from the truck camera, then test the new spawn, entry, closed-door collision, targeted opening, reset, drive-out and touch operation.

## All-elevation completion

Owner confirmation supersedes the former unverified solid rear wall: five rear sectional doors and one side bay door on the low rear shed. Five rear centres follow the front lanes; matching styles and dimensions are estimates. The shed door is estimated at 3 x 3 m on its exposed max-X side. Added source-visible tower platform railings and two wing windows. All added doors are closed scenery; front door operation and collision remain unchanged.
