# City launcher and embedded simulator recovery — v1.6.138

User authorized repairing CF-01 and CF-02 together, following the existing published-fix workflow. Source baseline: main f7a5800 (v1.6.137), including the earlier storage and pointer-ownership repairs. Production datasets and feedback configuration are outside scope.

## Plan and ownership

1. Reproduce each original audit finding against the current source before changing it.
2. Coordinator owns launcher failure/retry state; focused agent owns persistent-parent/iframe input ownership. Separate files prevent conflicting edits. Coordinator owns versioning, CI, release and live checks.
3. Execute regression tests against actual application scripts, independently review the repairs and important edge cases, then run the complete Node suite.
4. Publish one patch release (+0.0.1), verify Pages deployment and the live launcher/simulator. Distinguish automated storage/lifecycle fixtures from native browser and phone evidence.

## CF-01: city setup failures

Confirmed in current source: the static city select remained enabled while registry/selector scripts loaded, and rejection only logged an error. The displayed selection could change without launch URLs updating. New actual-document jsdom tests initially failed 7/7 against unchanged v1.6.137.

Repair: disable the selector before asynchronous setup; remove city-specific launch destinations and block activation while setup is pending or failed; show a short loading/error status and retry. Validate registry/controller/selector readiness before enabling selection and rebuilding all launch URLs. Reuse the active installation promise, retain requested/remembered city selection, and avoid duplicate change handlers. If the static homepage controller failed, retry can load it too. Optional analytics remains independent.

A timed-out request is removed and marked cancelled. The selector checks its own cancellation marker before executing initialization, so an already-fetched old script cannot restore a half-ready launcher. Independent review found this late-execution edge case; the test executes the complete cancelled selector with its original `document.currentScript` node, rather than testing only its onload callback.

Executed tests: `node --test tests/city-selector-recovery.test.cjs` (12 cases), plus existing homepage, analytics bootstrap and release consistency checks. Covered registry/selector request errors and timeouts, repeated failures, no-API responses, missing homepage controller, same-page recovery, real hrefs/modified-click destinations, requested versus stored city and one change listener. DOM/network delivery and timers are controlled in jsdom; this is not a live injected network failure or physical-phone result.

## CF-02: persistent parent controls after iframe replacement

Confirmed in current source by a focused agent using actual input modules with one persistent parent and replacement inner windows: drive singleton marker and core/tuning listeners retain retired inner closures. New regression cases initially failed 4/4 before repair. Complete module bodies execute; rendering, network scheduling, pointer capture and navigation are simulated in jsdom. Real parent event propagation and wrapper input bindings are exercised.

Repair: each core/tuning/drive layer owns removable parent listeners, retires its predecessor and releases input on pagehide. Persisted pageshow reconnects once, without reapplying defaults or resetting the session gear. Stored animation/retry work is cancelled when retiring the layer. Captured iframe/document identity checks prevent an old delayed installation from replacing the current owner. The wrapper clears held pedal/steering state for each new frame and on its own generation’s pagehide; late mode-change/dismissal events from an older generation cannot release current controls.

Independent review reproduced two additional lifecycle gaps before repair: a retired drive waiting for Arcade could reclaim the current parent controls, and cached restoration with storage denied could overwrite a session Standard steering choice. Follow-up tests exercise both delayed Arcade and delayed core/tuning, denied preference storage, retained gear and cached held Reverse. Defaults and first gear initialization now run only once per inner document.

Executed focused lifecycle tests: `node --test tests/frame-input-recovery.test.cjs` (13 cases). Tests exercise two reloads, stable effective parent listener counts, single shifts for pointer and keyboard/AT clicks, retired state remaining untouched, release outside controls, reverse/key release, blur, tuning absence, back/forward cache event restoration, held pedal cleanup and delayed dependencies. These are actual-source jsdom lifecycle tests; native iframe navigation and physical phone multi-touch/BFCache behavior are not represented as verified here.

## Final checks

- Twelve launcher recovery and thirteen iframe lifecycle regression cases are included in the Pages gameplay check.
- Existing pointer-owner and optional-preference-storage cases remain included to protect the preceding releases.
- Complete Node suite: 808 passed, zero failed, cancelled or skipped (`node --test tests/*.test.cjs tests/*.test.mjs`). Module syntax checks and `git diff --check` passed. Independent review ran the twelve city cases and twelve lifecycle cases, reproduced and verified the two follow-up lifecycle repairs, and found no remaining material issues; the coordinator additionally ran the final thirteen-case lifecycle suite/full suite, including detached-frame late core loading. Deployment and live checks are performed after merging, and are not represented as completed in this pre-deployment source record.
- Version normalization changes other entrypoint/import cache tokens only; no city dataset or 3D game behavior is intentionally changed.
