# Task 3: published-content identity for recovery drafts

Implemented locally; no source data changes, publisher requests, commits, push or publication. Luna's editor panel changes were preserved.

Changed `city-explorer/editor/draft-store.js`, `city-explorer/editor/version-saver.js`, `city-explorer/editor/recovery-prompt.js`, the recovery caller section of `city-explorer/editor/city-editor.js`, the autosave initialization in `city-explorer/app.js`, and relevant tooling tests.

Draft stores now bind to the loaded published document. New envelopes include its exact canonical normalized JSON identity, including authored objects, overrides and revision metadata. Object property order and normalized defaults do not change identity. Exact content avoids short-hash collision ambiguity; it adds one canonical published snapshot to the local envelope. Existing quota-error behavior remains intact.

An unchanged publication recovers normally. Changed content is explicitly reported as `base-content-mismatch` even when both revisions are null. Legacy envelopes remain readable, recoverable and exportable; when their base cannot be proven against the loaded content they report `base-content-unverified`. Existing integer revision mismatch behavior is retained. Invalid identities use the existing quarantine path, preserving original bytes. The recovery prompt handles both new statuses and clearly states that recovery replaces the current browser scene while keeping export available.

App autosaves use the store's bound published baseline rather than an edited document revision. The version saver records its actual baseline before network work and advances it only after an accepted commit. Rebasing changes the latest draft's metadata, preserving newer pending local edits instead of overwriting them with the older published candidate. Future autosaves use the updated baseline.

Red evidence: the initial new draft/publisher test batch failed six expected checks: null-revision object changes, changed overrides, legacy unverified base, corrupt identity quarantine, missing rebase behavior, and publisher baseline propagation. A subsequent targeted test exposed and verified a correction for a null published revision combined with a different imported draft revision.

Green evidence: `node --test --test-reporter=tap tools/test_city_editor_draft_identity.mjs tools/test_city_editor_state.mjs tools/test_city_editor_publisher_client.mjs tools/test_city_editor_recovery_prompt.mjs tools/test_city_editor_integration.mjs tools/test_city_editor_scene_document.mjs tools/test_city_editor_renderable_document.mjs tools/test_city_editor_overrides.mjs` passed **30/30**, no skips. Syntax checks passed for all five modified production scripts; scoped `git diff --check` passed (Git emitted only its existing LF/CRLF conversion notice for the concurrently edited editor file).

New coverage includes unchanged/changed/null/legacy/corrupt envelopes, canonical ordering, retained export/discard, successful post-save rebasing, future autosaves, and a real-store asynchronous publication fixture proving work edited during a pending request survives. Publication is simulated; root owns final browser/full-suite acceptance.

## Independent-review follow-ups

Fixed all three requested draft lifecycle/recovery follow-ups:

- `exit()` synchronously flushes only pending autosave work, including the existing `dispose()` / application `pagehide` path and an inactive editor. Existing `flush()` cancels its debounce timer, does not write clean documents, and retains pending export data after unavailable/quota storage. Repeated disposal stays idle.
- The recovery dialog now includes its own **Export draft** button. It uses the same download helper as the normal export action, preserving the pending draft and leaving the recovery decision open.
- The version saver checks post-commit draft rebasing. Failed recovery persistence carries `localDraftRecoveryUnavailable` through saved/deployment/live results alongside the successful commit identity. The editor explicitly reports that the published version was saved but recovery of newer local edits is unavailable; export remains available.

Added `tools/test_city_editor_draft_lifecycle.mjs`, which imports the actual editor factory and real local modules with browser import-map paths resolved for Node. Immediate-edit disposal/exit tests share real storage across a simulated reload. It also covers clean stores, unavailable storage, quota failure with retained old bytes and pending export, cancelled debounce, download behavior and the modal button contract. Extended the real-store publisher regression to fail storage after POST acceptance.

Red/green evidence: six new lifecycle/export/publisher regressions failed before these follow-up implementation changes; the focused lifecycle/publisher batch now passes **18/18**. The extended editor batch passed **39/40**: its sole failure is the existing `tools/test_city_editor_interactions.mjs` layout assertion requiring a literal `.is-driving .help-panel { bottom:128px; }`, which the lead's concurrent CSS work has changed. This failure was reported to the lead, with no changes to their CSS/test ownership. Syntax checks and scoped `git diff --check` pass; Git only reports its existing editor-file LF/CRLF conversion notice. No real publication or commits occurred.
