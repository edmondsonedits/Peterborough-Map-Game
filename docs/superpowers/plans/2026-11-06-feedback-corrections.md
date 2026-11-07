# Feedback corrections implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the bounded tasks below.

**Goal:** Publish the approved location corrections and assisted Route Mapping controls.
**Architecture:** Keep the canonical city catalogue and shared runtime as the data boundary. Extend the existing Route Mapping state and reference renderer with a sticky assisted flag for each call. Root integrates dataset versions and the production release.
**Tech Stack:** Existing vanilla JavaScript, Node test runner, Python/Playwright where available, GitHub Pages.
**Spec:** docs/superpowers/specs/2026-11-06-feedback-corrections-design.md

## Global Constraints
- Exactly 200 unique Peterborough addresses: 100 easy, 50 medium, 50 hard.
- One shared call pool across modes and services.
- No private feedback payloads or player identifiers in public commits.
- No new dependencies unless existing tooling cannot perform required validation.
- Preserve unrelated concurrent work and check main again before publishing.
- One patch increment from the latest integrated source version.
- Assisted attempts and their retries never update ratings or progression.

## Review Focus
- Cached unedited 1.6.108 records must receive the corrections; deliberate user edits survive.
- Quality Inn appears only once and replacement cross streets agree with the selected address.
- Recognition circles must not make driving arrival complete hundreds of metres from road access.
- Clear, Undo, Try again, settings changes, and revisit cannot turn a revealed call into a scored call within the same session.
- Practice controls work before route completion and when the reference route is unavailable.

### Task 1: Canonical location corrections
**Files:** cities/peterborough/locations.json; optional sanitized geographic source notes; tests/feedback-location-corrections.test.cjs. Root owns generated payload, shared store migration, and all version markers.
**Interfaces:** Produce corrected canonical rows with existing stable IDs, names, address, lat/lng, radiusMeters, crossStreets, provenance, and optional routeAccess/arrivalRadiusMeters if needed. Notify root of added field requirements before changing runtime.
- [ ] Inspect all 17 geographic reports and current catalogue; apply the 14 submitted full circles and the radius-only change with Ravenwood resolved against the later proposal.
- [ ] Verify new addresses and road access using official sources or local municipal data. Resolve the duplicate Quality Inn while preserving totals.
- [ ] Add focused behavioural/data-integrity regression checks and run them; provide exact source evidence and a changed-row summary.

### Task 2: Assisted route practice
**Files:** route-mapping/app.js, route-mapping/play.html, route-mapping/styles.css, and tests/route-practice.test.cjs (plus a bounded browser check if useful). Do not edit release tokens or shared catalogue files; root normalizes them later.
**Interfaces:** Existing PTBO_ROUTE_MAPPING state/debug API remains compatible. Add an assisted state per exercise and reuse existing renderReference/precomputeReferences/newCall/resetDrawing functions.
- [ ] Write and run a failing behavioural test for reveal before completion, sticky unscored retries, Next Call reset, unavailable-reference handling, and unchanged normal completion scoring.
- [ ] Implement compact Show route (practice), Try again and Next Call controls, readable street sequence, and guarded scoring/progression.
- [ ] Test the exact user flow; report modified files, commands and any remaining limits.

### Task 3: Shared data integration and demo verification
**Files:** scripts/build-dispatch-catalog.cjs, shared/dispatch-data-1.4.4.js, shared/dispatch-locations.js, cities/peterborough/package.js, cities/peterborough/dispatch-data.js, affected consumer/tests only as necessary.
- [ ] Verify baseline shared-pool and route tests before implementing integration.
- [ ] Update dataset revision with the release and rebase old unedited cached values onto the new seed while retaining intentional edits.
- [ ] Keep Geo recognition radii and driving road access appropriate using existing fields when possible.
- [ ] Run shared catalogue/migration/Geo/route regressions and verify Richmond Hill demo boot, calls, roads and limit.

### Task 4: Review and publish
**Files:** existing production release markers/normalization outputs, relevant release notes and deployment evidence.
- [ ] Independently review the entire diff and correct concrete findings.
- [ ] Increment latest source version one patch; normalize release and required world artifacts; run required release checks.
- [ ] Integrate without overwriting concurrent main changes and publish the verified commit.
- [ ] Verify Pages deployment, served version/data/practice controls and multiplayer world compatibility; report the new version and shortest play link.
