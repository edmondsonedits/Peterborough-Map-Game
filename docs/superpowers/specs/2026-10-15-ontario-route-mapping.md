# Ontario Route Mapping

Implement the existing Peterborough Route Mapping interaction for every one of the 33 city selector entries. Use shared code and the selected city's canonical locations, active Fire/EMS bases, map and road data. Do not fall back silently to Peterborough or enable unrelated driving/3D capabilities.

Provide three distinct useful base-to-call exercises for every eligible active base (expected 623 base entries / 1,869 associations). Prefer existing addresses; add sourced intersections to the same canonical database when needed. All services share all addresses. Preserve original Geo recognition tiers: Peterborough 100/50/50 and 30 municipal demos 10/5/5; new route-only destinations remain unranked. Planned/construction bases stay informational.

Route difficulty measures choices from the particular starting point: departure direction, barrier crossing, alternative corridors and practical arterial versus shortcut decisions. Judge routes with a common versioned modeled response objective (travel, turns, controls and road suitability), respecting mapped directions, access and restrictions. Do not invent traffic, apparatus dimensions, facility exits, road links or individual human review. Record honest map-derived provenance, alternatives and uncertainty.

Preserve continuous street tracing, backtrack erasure, pause/resume, Undo, existing progression and junction-spur corrections. Share the reference objective with grading and learning. Retain close-alternative equal credit. Keep route metadata separate from Geo tiers and invalidate stale spatial edits.

The Dispatch Editor must organize all canonical city calls and base associations with clear coverage and read-only decision explanations. Preserve existing saved custom records, edits and deletions, including legacy Belleville/Scarborough empty catalogs. Moving a base invalidates its dependent exercises; renaming it does not.

Before release, verify all city production boots, Fire/EMS routes, asset identity, data coverage, saved-data migrations, actual pointer drawing/review/Next, desktop/mobile layouts, source topology and route legality. Resolve important independent review findings. Publish v1.6.111 after checks and verify the live deployment. Publication was explicitly authorized by the user.
