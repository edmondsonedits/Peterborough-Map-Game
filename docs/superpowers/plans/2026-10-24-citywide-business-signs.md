# Peterborough citywide business signs implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the data task and a focused review; parent implements the rendering integration.

**Goal:** Business names above the corresponding storefront windows/doors across Peterborough, with auditable source coverage and no guessed building assignments.
**Architecture:** Gather public business points and addresses into a normalized catalogue. Join to actual rendered OSM/municipal footprints, reconcile dated name/location conflicts and choose supported street-facing walls. Render wall-mounted atlas text in source-linked building groups with distance culling. Keep unresolved records visible in the coverage report rather than placing misleading signs.
**Tech:** Existing plain Three.js, ES modules, Node tests and public JSON data; Python standard-library/lxml ingestion.
**Spec:** User request and approval on 2026-10-24: every Peterborough business, names above windows/doors, delegated routine work, stronger review, overnight local processing and verified GitHub Pages publication approved; no paid services or footage upload.

## Constraints

- H access and all new project/reference files remain under H:/ChatGPT. Preserve original video, existing building/road/gameplay/editor behavior and concurrent updates.
- Name/address/location sources and check dates travel with each record. Correct stale OSM names using stronger current evidence; no unsupported exterior tenant storefront.
- Use original source IDs, actual rendered/simplified rings, and explicit mapped/reviewed/inferred placement modes. Source identity does not require a new editor object.
- Multiple tenants share wall space without overlap. Interior tenants may use a clearly identified directory above an evidenced shared entrance; otherwise unresolved.
- Atlas text stays readable, outward-facing, below the wall top and near the ground-floor opening band. No roof billboards or floating labels.
- Sign LOD updates separately from the existing 600 m city LOD grid, at <=20 m camera movement. Editor hide/restore must continue to hide the signs.

## Review focus

- Wrong side of street/corner, outdated business names, location moves and duplicate brand/location records.
- Concave simplified footprints, courtyards, points in car parks and ambiguous adjacent buildings.
- Narrow/tall buildings, multi-tenant streets, indoor malls and insufficient wall space.
- Texture/draw-call growth, Unicode/long names, text direction and source editor visibility.
- Exhaustive public-source accounting versus claiming that every real-world establishment is known.

## Tasks

- [x] Routine worker: identify and ingest broad City/Chamber/downtown directories and citywide OSM establishments; retain raw snapshots and provenance outside runtime.
- [x] Parent: source precedence/current-name corrections, deterministic deduplication, spatial building join and placement audit using actual game geometry.
- [x] Parent: failing geometry/render/editor tests, atlas renderer, optional data loading, distance LOD and QA metrics; preserve old reviewed sign appearances where already correct.
- [x] Focused stronger review: audit contracts, data coverage and hard matching/rendering cases; repair material findings.
- [x] Proportional data/geometry/renderer tests and representative front/oblique/browser checks across downtown, malls and outlying commercial streets, then production release checks.
- [ ] Publish through already-authorized main/Pages workflow and verify exact live assets and runtime; report actual matched/unresolved/source counts.

## Ledger

- Scope expanded from the initial corridor to the whole city before implementation; parent retains ownership of runtime, matching and publication. Routine worker owns ingestion scripts/snapshots; reviewer is read-only.
- Reviewed frontend facade positions stay source-faithful. A fresh narrow OSM query already exposed stale Le Petit Bar/Twisted Wheel/Pro-Tect names; current business sources take precedence.
- Review: actual runtime rings matter; generic footprints are simplified. Per-building atlas meshes plus near-distance LOD are acceptable. Sign LOD must not inherit the 600 m visual-LOD update interval.

- Final local check: 920 rendered names (888 storefronts, 32 directory members); 495 unresolved of 1,415 unique records. Both browser layouts passed with no runtime rejections. Front and oblique captures exposed and led to removal of seven obscured placements. Exact tenant openings remain inferred unless supported by reviewed footage or mapped entrance data.

- v1.6.129 checkpoint: imported all 290 obtainable DBIA profiles and all 785 ptbo.ca profiles reported during the crawl, with zero profile request failures; raw pages remain private. Exact civic-address/parcel evidence can locate a directory business only on a property with one complete unambiguous building. Regional-coordinate conflicts and shared properties stay unresolved. Source IDs, current-name corrections and source links remain auditable.
- Sign clearance now uses the generated facade opening band and the same mapped wall/roof calculation as the runtime. Existing geometry behavior is preserved. 616 production checks passed before the final map-data refresh; final refreshed-data browser verification precedes publication.
