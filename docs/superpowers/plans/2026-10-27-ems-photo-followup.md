# EMS photographic follow-up implementation plan

> For agentic workers: use subagent-driven-development for the bounded asset correction.

**Goal:** Match Clonsilla Station 7 garage door appearance to the inspected September 2021 photograph and preserve research provenance.
**Architecture:** Keep the existing GIS placement and EMSClonsilla root hierarchy. Modify only the Clonsilla authoring function, generated GLB and its metadata. Keep unknown current/rear details explicitly unresolved.
**Tech stack:** Blender 5.2, Python, glTF Transform, Three.js.
**Spec:** User requested online research and actual photo inspection for EMS base accuracy; prior instruction authorizes judgment-based construction and testing.

## Scope and evidence
The September 2021 Google panorama YhKp1v44kxUww_U4FWJ3fw at 44.2894929,-78.3450205, looking 279.63 degrees toward the marked Station 7 storefront, visibly shows two white sectional garage doors in the recessed viewer-left wing. Each has one narrow horizontal window band. Exact measurements remain estimates. July 2024 imagery shows construction and substantially changed cladding; do not claim the 2021 facade is a verified current exterior.

## Task 1: Door appearance and source metadata
- [x] Preserve the GIS origin, footprint, scale, foundation skirt, root names and two static door placements.
- [x] Change blue-grey leaves to white opaque sectional panels with one dark glazing strip around mid-height. Use restrained pale seams and silver frames.
- [x] Update layout/report evidence to distinguish photo-confirmed 2021 count/side/finish from estimated dimensions and unknown current condition.
- [x] Rebuild only Clonsilla, export/deduplicate, and validate the resulting GLB with zero errors/warnings.
- [x] Inspect front render against source image; verify asset loads at its existing position in the local simulator.

## Task 2: Research record
- [x] Record dated Armour and Clonsilla observations and source URLs, unresolved full rear/interior layout, the gated tender, and the excluded unlocated garage photo.
- [x] Record the current-state discrepancy at Clonsilla without asserting a relocation or copying the unverified 2024 cladding.
- [x] Run focused facility tests and git diff --check. No runtime behavior or publication change is part of this research follow-up.

## Review focus
Check that the window band is visible outside the opaque panel; all doors remain closed; doors render on viewer-left of the front storefront; no source photos enter the shipping GLB; unchanged Armour/fire assets remain byte-identical; metadata does not claim current as-built proof.
