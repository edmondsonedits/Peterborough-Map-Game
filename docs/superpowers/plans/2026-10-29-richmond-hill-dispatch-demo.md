# Richmond Hill Dispatch Demo Implementation Plan

> **For agentic workers:** Use focused agents for the city package and simulator lifecycle, with root integrating the launcher and Feedback and an independent final reviewer.

**Goal:** Play five Richmond Hill Fire/EMS calls through the existing simulator from a three-action popup.

**Architecture:** Capability metadata exposes a demo without marking the full mode ready. A native city package supplies local bases, five-call pools, roads and hospital; a small session controller limits completed assignments in the shared runtime.

**Tech Stack:** Existing JavaScript, Leaflet, Node tests and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-richmond-hill-dispatch-demo-design.md`

## Global constraints

- Exactly five completed calls per demo; no sixth dispatch until replay.
- Native Fire/EMS driving, route guidance, and EMS hospital handover.
- Capability `dispatchDemo:{callLimit:5}` on Richmond Hill package, descriptor and registry; full-mode launcher flag remains false.
- Preserve city isolation, canonical IDs, edited data, and other cities' behaviour.
- No actual Feedback message is sent during tests.

## Review focus

- Duplicate completion and stale timers must not consume extra calls.
- Base/service switches and aborted missions must preserve completed progress.
- An open popup must preserve its captured city even if selection changes elsewhere.
- EMS scene arrival alone must not count as completion.
- Unsupported cities and offline/failed requests must not appear playable/sent.

### Task 1: Richmond Hill native city package (city-data agent)

- [x] Add failing configuration and route checks in `tests/richmond-hill-dispatch-data.test.cjs`.
- [x] Add `cities/richmond-hill/package.js`, `dispatch-data.js`, demo-pool metadata and hospital/source evidence; update `city.json`.
- [x] Prove all eight bases have five distinct reachable calls and EMS calls can reach the hospital and continue to subsequent calls.

### Task 2: Five-call lifecycle (runtime agent)

- [x] Write failing pure lifecycle tests for counting, cancel, duplicate completion, limit and replay.
- [x] Add a small shared session core and hook `response-simulator/index.html` at authoritative dispatch/completion/reset boundaries.
- [x] Provide progress and accessible finish UI with Replay/Return/full-version request navigation.

### Task 3: Launcher and Feedback (root)

- [x] Extend `tests/homepage.test.cjs` and `tests/feedback-demo-requests.test.mjs` with failing demo routing and full-version request cases.
- [x] Add Richmond Hill demo metadata to `cities/city-registry.js`; update `homepage/app.js`, `homepage/styles.css` and `index.html` for Close/Demo/Request full version.
- [x] Extend `shared/demo-requests.js`, `feedback/demo-requests.mjs` and `feedback/ui.mjs` to preserve explicit full-version intent, deduplication and acknowledged delivery.

### Task 4: Integration and review

- [x] Run targeted tests, then the complete Node suite once changes settle.
- [x] Browser-test desktop/mobile launcher, Fire five-call completion, EMS transport, replay, city/base/service isolation and Peterborough regression; disclose injected arrival fixtures separately from actual driving.
- [x] Review screenshots and an actual native-control Richmond Hill drive.
- [x] Independent review, fix findings, version once and create a reviewable PR with evidence.
