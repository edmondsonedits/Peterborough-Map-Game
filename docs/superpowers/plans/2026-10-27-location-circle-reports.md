# Location Circle Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let a Geo player report a possible data/scoring problem and propose a different circle centre/radius in a private developer conversation.

**Architecture:** One immutable structured report on an existing private feedback thread. A copied Geo result snapshot feeds a lazy Leaflet correction composer and a read-only developer comparison. Existing Firebase auth, messages and status workflows remain authoritative.

**Tech Stack:** Plain JavaScript/ES modules, vendored Leaflet 1.9.4, existing Firebase Auth/Firestore SDK 12.5.0, Node tests and local Firebase rules emulator.

**Spec:** docs/superpowers/specs/2026-10-27-location-circle-reports-design.md

## Global Constraints

- Suggestions never change game targets, scores or shared datasets.
- Suggested radius 5–2000 m; finite Earth coordinates; immutable original snapshot.
- Preserve guest/owner/developer isolation and stable retry payload/IDs.
- Reuse the existing inbox and approved tile-provider boundary.
- Version 1.6.134; feedback remains disabled until authorized backend activation.
- Leave other worktrees, root analytics rules and production publishing unchanged.

## Review Focus

- Advancing/retrying/returning to a base must not rewrite a captured report.
- Account switches and stale async map/send completions must not reveal private drafts.
- Retrying a changed circle under an already-acknowledged ID must reject, not silently append.
- Invalid radii/coordinates and immutable report rewrites must fail on the server.
- Mobile/keyboard controls must keep Cancel/Send reachable and preserve map-provider policy.

### Task 1: Structured persistence and authorization

**Files:** feedback/location-report.mjs; feedback/model.mjs; feedback/service.mjs; feedback/firestore.rules; tests/location-report-model.test.mjs; feedback/tests/rules.test.cjs.

**Interfaces:** normalizeLocationReport(input), locationReportIdentity(report), locationReportGroupKey(report); service.sendLocationReport({threadId,messageId,report,note:''}). Payload follows the design's original snapshot plus optional centre/radius suggestion. Existing send replies remain supported.

- [x] Write/run failing normalization, independent-copy, identity/change and legacy-thread tests.
- [x] Implement strict normalized immutable payload and explicit new-thread/retry send path.
- [x] Write/run failing real rules cases for valid report create, invalid geometry, private ownership and immutable context; extend only feedback rules.
- [x] Run model, rules and whole Node suite; commit owned files and record results.

### Task 2: Geo capture and correction interface

**Files:** geo-guesser/location-report-context.js; geo-guesser/app.js; geo-guesser/index.html; geo-guesser/app.css; feedback/location-report-ui.mjs; feedback/ui.mjs; feedback/styles.css; tests/geo-location-report.test.cjs; tests/location-report-ui.test.mjs; tests/fixtures/location-report.html.

**Interfaces:** captureGeoResult(input) returns a copied snapshot; Geo result action passes snapshot and in-memory approved map specification to PTBO_FEEDBACK.openLocationReport(). Composer calls sendLocationReport; detail map is read-only.

- [x] Write/run failing real capture tests for original guess, target mutation and subsequent question isolation.
- [x] Capture inside review() before fitBounds and expose the compact result action through the existing feedback mount.
- [x] Build lazy correction map with independent centre/edge handles, numeric fallback, reset/disable, reason/note, immutable draft submission and server-acknowledged receipt.
- [x] Add developer original/suggestion map and related-loaded-report navigation without cross-owner access.
- [x] Verify geometry/race/keyboard/scroll behavior with executable component tests and supported browser controls where available; record limitations rather than substituting VM passes for browser evidence.

### Task 3: Release, review and delivery

**Files:** shared/build-version.js and active release references; feedback/README.md; execution ledger and test evidence.

- [x] Increment the feedback feature version to 1.6.134 and keep related active references consistent.
- [x] Run all Node tests, real feedback rules tests, syntax and diff checks.
- [x] Obtain an independent whole-change review and resolve material findings with reproductions.
- [x] Commit and create a reviewable PR without merging/deploying. State the Firebase activation dependency and actual verification scope.

## Execution ruling

The user explicitly said “I want you to make it happen”; the approved proposal plus radius addition is implementation authorization. Root owns UI/integration; one focused agent owns disjoint backend/model/rules files, with final independent review. No further routine approval questions are required.
