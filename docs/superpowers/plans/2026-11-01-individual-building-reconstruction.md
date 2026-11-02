# Evidence-based city building reconstruction Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development. Complete research, model, review, integration, and release gates for each building; do not equate a completed batch with city-wide completion.

**Goal:** Research individual mapped buildings, author efficient Blender assets, improve them through review, and publish every accepted model.
**Architecture:** Preserve mapped footprints and gameplay/collision. Reuse the existing validated GLB replacement loader through a separate reconstruction catalog. Keep shared texture atlases and merged geometry; load a small reviewed batch at a time. Full inventory status remains explicit.
**Tech Stack:** Blender 5.2 Python, glTF/GLB, existing Three.js runtime, Node tests, standalone Playwright, GitHub Pages.
**Spec:** User request: role-specific efficient agents; individual online/photo research; Blender authoring; review/improvement; publish completed buildings. Existing constraints: low-poly/high-performance game, preserve custom details and geography.

## Global constraints
- H: access only H:/ChatGPT and descendants. Existing isolated branch codex/facilities-release-20261027.
- Record viewed photos, sources, observed facts and estimates per ID. Source photos are reference-only, not shipped textures.
- Keep all 30,564 source IDs in inventory-status.json. First execution batch selects six named priority buildings; unfinished buildings remain pending.
- GLB failure or wrong geometry must retain the existing source. Hide only exact mapped source IDs after validation.
- Native .blend sources/renders stay outside the production asset tree. Original generated material artwork may ship.
- Target <=6,000 triangles, <=6 primitives/materials and <=1MB GLB per asset; justify any exception with runtime measurement.
- User already authorized publication of completed buildings. No additional publication confirmation required.

## Tasks
- [x] Inventory and isolate: verified existing worktree and fresh origin/main; exact six footprints/tags exported.
- [x] Evidence: Luna researcher individually checked six locations and viewed available reference imagery.
- [x] Blender production: Luna environment artist owns build_city_buildings.py and individual asset directories; source-aware materials, footprint, meaningful distinctive features, export/reimport validation.
- [x] Integration: parent owns reconstruction catalog, loader regression tests, release normalization and in-game review tools. Catalog includes only accepted models.
- [x] Review: independent reviewer checks evidence boundaries and geometry/runtime; inspect each model in multiple directions; correct concrete defects and rerun affected checks.
- [ ] Publish: normalize release, focused/full deployment checks, publish accepted batch, verify public hashes and live gameplay; update ledger truthfully.

## Evidence decision
Portage Place remains insufficient-evidence: no directly viewed facade photograph established within two focused search passes. Hold its model. Five others have photo-backed features, but compass orientation and unseen sides require labeled estimates unless later evidence resolves them.

## Critical boundaries
- Failure/malformed GLB: existing shell stays visible.
- Exact matching: neighboring buildings, roads, saved editor overrides remain intact.
- Existing special landmark at Lansdowne Place: suppress duplicate decorative model only after replacement ready; restore naturally on load failure.
- Local coordinate footprint: no city-scale position baked into GLB, correct metric axes/yaw, bounds checked against mapped source.
- Performance: no unique high-resolution photo texture per facade; capped primitives and payloads.
