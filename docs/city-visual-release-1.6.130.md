# City visual release 1.6.130

Publishes the reusable city materials and building appearances, recording-backed facade details, Hunter Street Bridge appearance and driving surface, shared road polish, roadside lighting/signals, and camera-facing intersection holograms. Source street names, GIS footprints, business identities and gameplay remain authoritative. Prepared from main 6edb3dd, preserving its latest map-data refresh and the published business-sign update.

The canonical release normalizer now versions the visual-module imports together to avoid mixing cached older road, facade or material code with the new app. The Pages workflow includes 25 additional visual regression test files. Three older porch tests now check the correct separated geometry batches and the intentional appearance-only roof condition.

Pre-publication validation: 742 Node test cases across the release groups, 11 road/contact CLI checks, changed-JavaScript syntax and diff checks, and an idempotent release normalization. The unmodified release app boots in desktop and narrow lite browsers with zero console/page/HTTP errors. Hologram coverage is 1,775 full / 1,771 lite intersections; inspected downtown, east-city and night captures. No physical phone was tested. The preceding independent Sol review found no blocking visual/code issues; controlled-heading turn evidence is documented in intersection-holograms-verification-2026-10-25.md.

Local publication receipts and screenshots are retained under `test-artifacts/publish-20261025` in the isolated release checkout. The original working checkout was preserved. Existing individual verification documents describe the scope and limitations of each visual pass.
