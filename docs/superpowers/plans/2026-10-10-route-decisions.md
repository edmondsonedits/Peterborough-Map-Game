# Route Mapping decision practice implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. User authorized implementation of the reviewed recommendations.

**Goal:** Teach route decisions without solving the player's route.
**Architecture:** Isolate local tracing and decision feedback from shortest-distance reference routing.
**Tech Stack:** Existing JavaScript, Leaflet, Node tests; no dependencies.
**Spec:** ../specs/2026-10-10-route-decisions.md

## Global constraints
Local worktree only. Preserve authoritative station/GIS/dispatch records. Completion defaults to 40 m by road, adjustable from 10-60 m. Street forgiveness is 6-24 screen pixels, default 12, bounded to 12-90 m. Challenge preference defaults to 80%, adjustable from 50-100%. Keep ratings during weakness migration.

## Review focus
- Sparse strokes must not invent routes across obstacles.
- Fractional endpoints on one-way roads must respect direction.
- Alternate bridges and intentional revisits must survive.
- Cancels, stale asynchronous snaps and undo must preserve prior work.
- Departure changes and service changes must use the correct start and learning record.

## Task 1: Faithful tracing
Files: route-mapping/trace-core.js, app.js; tests/route-tracing.test.cjs.
Interface: createTraceCore({graph,toXY,toLatLng,search}) -> snap(point,tolerance), trace(points,options), between(start,end,options), combine(routes).
- [x] Add failing partial-stroke, bridge, loop, one-way, disconnected and fractional-position fixtures.
- [x] Run node --test tests/route-tracing.test.cjs and confirm failures.
- [x] Implement ordered local matching and fractional legal edge traversal; integrate continuation, arrival and stroke undo.
- [x] Run focused tests and syntax checks.

## Task 2: Decision selection and feedback
Files: route-mapping/learning-core.js, app.js; tests/route-learning.test.cjs.
Interface: compareChoices(player,reference,graph) -> observed correct decisions and bounded regrets.
- [x] Add failing same-road departure, committed two-bridge choice, near-tie and delayed-error attribution fixtures.
- [x] Implement actual-start difficulty, bridge-aware committed alternatives, challenging-call preference and accurate memory.
- [x] Verify Fire/EMS progression/persistence and relevant tests.

## Task 3: UI and delivery
Files: route-mapping/index.html, styles.css, app.js; shared build marker only if required.
- [x] Implement address-first hierarchy, explicit draw/pan, external zoom, aligned markers and clear partial/complete state.
- [x] Run application suite, diff checks and browser drawing/continuation/undo/pan/zoom/review/next checks.
- [x] Obtain one focused whole-change review, repair meaningful findings, save screenshot and local commit.

## Execution ledger
- Baseline: 21c102a; clean worktree. Analysis probe reproduced 50 m -> 998 m completion and erasure of a 300 m loop. No source changes before failing tests.

- Implemented pure fractional tracing and bounded observed-choice learning cores; removed obsolete shortcut/loop cleanup and handle editing. Shortest-distance routing is reserved for reference and committed challenge analysis.
- Red-to-green receipts cover release endpoints, disconnected crossings, one-way travel, full connector corridor bounds, bridge alternatives, intentional loops, and local feedback attribution.
- Bridge structures are connected tagged components, including street-name changes across one structure. Packaged data audit: 92 mixed-layer shared coordinates; no bridge/nonbridge interior-to-interior junctions found. No GIS records changed.
- CALL explicitly marks mapped public-road access. Its marker, map framing, and 40 m network arrival target agree; no parcel-to-road connector is invented.
- Fire and EMS use actual service starts, separate progression records, preserved skill ratings, and migrated decision-memory version 2. Approximately 80% challenge preference when both challenge/refresher candidates exist; weakness retests wait for intervening calls.
- Validation: 245/245 application tests; syntax checks for app/trace/learning; diff whitespace check. Integration covers 25 packaged Fire/EMS road traces, real 50 m Station 1 release, progression/migration/retest, invalid-stroke preservation, Undo, complete submission, next-call reset, and road-access marker identity.
- Browser QA: release/continuation/Undo, drawing-mode zoom access, pan preserving the route, Clear, full drawn Hunter Street route review and Next Call, service switching with correct EMS bases, and final tighter build partial tracing. The completed route review was 98% efficient with +39 m; small legal differences are accepted. Final preview had aligned START/CALL/END centers, no overflow, and no browser warnings/errors.
- Local performance probe: six real selections took 55-350 ms on this machine; caching keeps repeated reference searches bounded to 256 entries. This is a local observation, not a mobile benchmark.
- Build ruling: retain unpublished local 1.6.100; server uses no-store. New cores have explicit script includes. No push or deployment.
- Saved screenshots: test-artifacts/quality-audit/route-decisions-final.jpg and route-decisions-review.jpg (ignored artifacts). Local preview: http://127.0.0.1:4188/route-mapping/?v=1.6.100.
- Remaining validation limits: physical touch-device/human training study not performed; road legality and obstacle reasoning depend on packaged graph accuracy and metadata.

## Street forgiveness and tuning follow-up
- Baseline: 6091fc2. The user reported a visually close stroke being rejected. At map zoom 14, the old 40 m ceiling allowed roughly six screen pixels, despite the intended ten-pixel tolerance. The rejected raw stroke was not retained, so that exact input could not be replayed.
- Increased default forgiveness to 12 screen pixels with a 90 m ceiling. Added saved Street forgiveness, Straight-street preference, Call arrival distance, and Decision challenge frequency sliders, draft cancellation, Apply settings, and Reset defaults. Applying tuning to the same service preserves the current call and drawn route. No road or dispatch source records changed.
- Red-to-green coverage confirms a 45 m offset rejected at 40 m succeeds at 50 m; configurable alignment bias affects local street matching; failed matches report measured gaps. Maximum tolerance still rejects disconnected and wrong-way traversal, including disconnected arrival attempts.
- Verification: 255/255 application tests; app and trace syntax checks; diff whitespace check. Browser QA accepted a nearby partial stroke at zoom 14, left Submit disabled, preserved route geometry when applying settings, confirmed keyboard slider changes, cancelled drafts, persisted applied values after reload, and restored defaults. Final settings panel was visually checked at the normal desktop viewport; no browser warnings/errors. Physical touch-device testing remains outstanding.
- Saved proof: test-artifacts/quality-audit/route-tuning-settings.jpg. Local preview remains http://127.0.0.1:4188/route-mapping/?v=1.6.100. No push or deployment.

## Direct map dragging follow-up
- Baseline: 0206671. Replaced the full-screen drawing overlay and Pan/Draw toggle with a 56 px circular drawing target at the active START or END. Native Leaflet dragging and zoom work everywhere else. The target follows map move/resize, hides during zoom animation or when offscreen, and reappears at the correct anchor after Undo or settings dismissal (including Escape).
- Pointer capture keeps a stroke active beyond the target. Starting a stroke first stops existing native pan inertia. Native navigation handlers and zoom controls are temporarily frozen during drawing, then restored to their prior states on release or cancellation. Route matching, arrival tolerances, decision selection, GIS records, and learning records are unchanged.
- Verification: 267/267 application tests, app syntax check, and diff whitespace check. Browser QA: direct dragging before and after a partial stroke; drawing from START; END alignment after pan/zoom and offscreen recovery; same-street continuation after a pan; Undo; Escape settings dismissal restoring drawing; and final partial stroke with Submit disabled. One attempted junction transition remained rejected by the unchanged directed road matcher. Browser verification caught a native event-payload regression in the final inertia change; explicit callbacks and native move/close event fixtures resolved it. Fresh final panning, zooming, drawing, continuation, Undo, and Escape checks produced no new browser warnings/errors. Some uncached external basemap tiles did not load at zoom 14; the final detailed street view rendered all 24 tiles. Physical touch-device testing remains outstanding.
- Proof: test-artifacts/quality-audit/route-direct-pan.jpg. Local preview remains http://127.0.0.1:4188/route-mapping/?v=1.6.100. No push or deployment.
