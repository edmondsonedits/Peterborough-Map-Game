# Follow-up runtime refinement plan

> **For agentic workers:** Use superpowers:executing-plans inline; request one focused review if ownership becomes ambiguous.

**Goal:** Continue the existing quality audit by closing concrete runtime gaps without adding product features.
**Architecture:** Preserve the current city/search/dialog interfaces and authoritative coordinates. A search generation and abort controller own remote results; current local search behavior remains.
**Tech Stack:** Static JavaScript, Node built-in tests, Chromium/Playwright.
**Spec:** ../specs/2026-10-08-existing-mode-refinement.md

## Constraints and review focus
No new mode, geographic edits, dependency, deployment or backend writes. New searches and dialog close must invalidate older async work. Invalid remote coordinates must not reach the camera. Successful and cancelled searches must release timeout resources. Local deduplication preserves the first matching identity record.

## Tasks
- [x] Reproduce overlapping and closed-dialog address searches before changing production code; capture provider 403 URLs and alternate-station departures.
- [x] Add failing async/invalid-response/deadline/local-dedup tests, then minimally fix search ownership, validation and repeated work.
- [x] Verify real Chromium search UI and Station 2/3 departures; exercise additional existing Geo modes and restart behavior.
- [x] Preserve HTTP status and add a bounded initial analytics access probe; keep new analytics out of scores and stop writes after permanent denial, with transient retry and privacy regression coverage.
- [x] Run relevant suites, normalize cache delivery, update the audit with actual evidence, and save the local change.

Completed on the isolated refinement branch at local build 1.6.100. Q29 additionally closes the city bootstrap/app cache gap, with failing-before/passing-after regressions and actual request-URL verification. All findings and validation boundaries are in the repository audit.
