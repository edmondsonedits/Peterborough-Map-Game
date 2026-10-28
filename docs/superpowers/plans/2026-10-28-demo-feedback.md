# Demo Feedback Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver acknowledged demo requests as private developer conversations and retire the old device counter.
**Architecture:** A small feedback demo controller owns account-scoped immutable attempts and calls the existing service. The legacy homepage adapter delegates to it; no new database collection or analytics writes.
**Tech Stack:** Vanilla JavaScript/ES modules, Firebase Auth and Firestore, Node tests, Playwright and emulators.
**Spec:** docs/superpowers/specs/2026-10-28-demo-feedback-design.md

## Global Constraints
- Reuse guest/account conversations, existing privacy rules and AI exports.
- No false success, no legacy-count migration, no guest cache warnings.
- Release 1.6.148 and publish the authorized change.

## Review Focus
- Concurrent double click and lost acknowledgement must reuse immutable IDs.
- Account changes during sends cannot reveal receipts or conversations to another player.
- Analytics exclusion/unavailability cannot prevent explicit private requests.
- Stale local counts and session markers must be removed without touching unrelated storage.
- Guest requests, developer replies and private notes must retain existing access rules.

### Task 1: Request controller and category
- [x] Add failing controller/model and real rule tests for demo category, server acknowledgement, retry, duplicates and identity changes.
- [x] Add `feedback/demo-requests.mjs` exposing `createDemoRequests(service, context)`, with `send({city,cityName,mode})` and `status(city,mode)` scoped to service.account.uid.
- [x] Add `demo: Demo request` to model/rules and run targeted tests.

### Task 2: Homepage and inbox integration
- [x] Add failing adapter/homepage/UI tests for feedback transport only, legacy cleanup, conversation opening, timestamps and category filtering.
- [x] Wire feedback readiness, demo methods and Open conversation; remove local-success and analytics fallbacks.
- [x] Retire local/shared demand tables, clear obsolete storage and add demo inbox link.
- [x] Run Node/DOM tests and mobile browser checks.

### Task 3: Verify and publish
- [x] Run Auth/Firestore emulators and actual guest-to-developer demo request, reply, export/privacy checks.
- [x] Bump version, normalize release, update docs and run release regression tests.
- [x] Obtain independent branch review and resolve material findings.
- [ ] Publish reviewed source and verify live GitHub Pages release/files.
- [x] Deploy dedicated feedback rules and read back exact match.
