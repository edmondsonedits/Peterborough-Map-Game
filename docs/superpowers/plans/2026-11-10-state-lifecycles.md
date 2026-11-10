# State Lifecycles Implementation Plan

> For agentic workers: execute task-by-task; keep the audit and behavior checks with the change.

**Goal:** expose lifecycle ownership and prevent reproduced stale asynchronous commits.

**Architecture:** retain existing per-domain controllers and public contracts;
share one pending initialization and use generation checks at asynchronous boundaries.

**Tech stack:** existing browser JavaScript modules, Node test runner, JSDOM and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-state-lifecycles-design.md`.

## Global constraints

- No new runtime dependencies or replacement global state store.
- Preserve mission, vehicle, scoring, authentication and multiplayer protocol behavior.
- The only application release increment is 1.6.201 → 1.6.202.
- Keep authoritative state separate from derived diagnostic snapshots.
- No private user/thread/session credentials in audit artifacts or diagnostics.

## Review focus

- Lobby listing overlaps room creation while world loading is delayed.
- Leave/dispose occurs before loading, prefetch, or join completes.
- An old callback arrives after a new session has started.
- A failed initialization retries without retaining a poisoned promise/resources.
- A note is edited or its conversation closes before its submission resolves.

### Task 1: Multiplayer lifecycle ownership

Files: `city-explorer/multiplayer/integration.mjs`,
`tests/multiplayer-initialization.test.mjs`.

Interface: preserve `createMultiplayerIntegration` and existing UI callbacks;
add only a read-only lifecycle snapshot if it clarifies authoritative state.

- [x] Write deferred-load/prefetch/join tests for Review focus cases 1–4.
- [x] Run the tests against the baseline and confirm the intended failures.
- [x] Share pending initialization, invalidate retired work, release failed resources.
- [x] Run new tests and all `tests/multiplayer-*.test.mjs`.

### Task 2: Feedback note submission ownership

Files: `feedback/ui.mjs`, `tests/feedback-workflow.test.mjs`.

Interface: retain `service.addNote(threadId, body, noteId)` and existing draft IDs.

- [x] Add a real DOM regression: submit A, type B, resolve A; B remains.
- [x] Cover unchanged successful submission, failure/retry identity, and navigation.
- [x] Confirm failure before modifying the note handler.
- [x] Snapshot the textarea, submitted value and ID; clear only the submitted draft.
- [x] Run feedback model/workflow/agent-tools and location-report tests.

Additional verified ownership gaps found during the audit: extend this task to
`feedback/service.mjs` and `tests/feedback-account-lifecycle.test.mjs` for stale
token rejection; roll back failed status edits to the subscribed thread in the
same UI handler/test; add `tests/driving-ui-lifecycle.test.cjs` and idempotent
start/stop handlers in `response-simulator/driving-ui.js` for page restoration.
Each regression was observed failing before its production change. Independent
review also reproduced retired Earlier messages and reply errors reaching a
newer conversation; failure paths now use the same ownership checks as success,
with stale-error, current-error and retained-draft controls.

### Task 3: Inventory, release and review

Files: `docs/architecture/state-machines.md`,
`docs/architecture/state-machines.json`, existing version-normalized files.

Interface: inventory entries contain stable IDs, source anchors, reviewed states,
events, ownership invariants, and test/inspection paths. Readable report links the
machine-readable companion; the inventory is not a second runtime authority.

- [x] Merge subsystem audits, verify live references and distinguish hypotheses.
- [x] Validate every source/test anchor against the checkout.
- [x] Bump canonical version and run `node scripts/normalize-release.cjs`.
- [x] Run complete Node suite and world export consistency; attempt targeted browser checks and record the environment blockers.
- [x] Review the full diff independently, fix material findings, and record outcomes.
- [x] Commit and provide [GitHub PR #81](https://github.com/edmondsonedits/Peterborough-Map-Game/pull/81) with verified release status: review branch, not merged to production.

Execution record: an isolated fresh clone/feature branch was used. Baseline with
installed repository test dependencies passed 1,564 tests; 71 additional city
editor tests passed. No shared implementation worktree was modified by audit
agents. Browser execution was attempted, but local Chromium cannot create its
required socket and the separate cloud browser cannot connect to this loopback
server. Real-browser validation is therefore not claimed.
