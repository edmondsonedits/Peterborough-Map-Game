# D01 — steering pointer ownership, v1.6.135

The user authorized fixing the reproduced multi-touch steering failure. Scope: steering input ownership and recovery in the existing 2D mobile wrapper; no training dataset edits or production publishing.

## Diagnosis

The active loader starts vehicle-instruments-core, directional-steering-tuning, then the later directional-drive layer. Tuning previously cleared its target on every document pointer release. The later drive layer kept forwarding throttle for its own still-held pointer, leaving a truck moving without the intended steering target. Core/drive also allowed a second joystick press to replace the first pointer, and hover could acquire a target without a press.

## Repair

- Keep the first joystick pointer until its own release, cancellation, capture loss or explicit reset. Ignore other pointers in tuning, core, drive and the legacy wrapper.
- Acquire on pointerdown; moves cannot acquire control after release or reset.
- Observe owner releases anywhere in the document so missing/lost capture does not strand steering or throttle.
- Invalidate deferred cleanup when a new owner/mode starts; clear prior target/magnitude when acquiring a fresh owner.
- Preserve genuine window blur/hidden cleanup while allowing focus changes between auxiliary buttons.
- Reset the legacy wrapper owner on steering-mode changes through the frame-attachment bridge.
- Pass the release cache token into nested steering assets so returning browsers request the repaired core and tuning files.

## Verification

Baseline: prior feature branch commit 3f3359cc612554597ee27a3c6b756d2e3a87a439, v1.6.134. GitHub main was still 19cf059/v1.6.132 when rechecked; the affected input source matched the audit. An isolated branch `fix/steering-pointer-owner` preserves the earlier work.

- Baseline full Node suite: 746 passed, zero failed.
- Initial 14 ownership/cache regressions failed against unchanged production code before the repair.
- Independent review found mode-recovery, descendant-focus blur and new-owner deadzone cleanup cases; each was reproduced with a failing regression before its fix.
- Final focused suite: 18 passed, zero failed.
- Final full suite before incorporating the concurrent geospatial refresh: 764 passed, zero failed/skipped.
- Changed modules parse; `git diff --check` is clean.
- Independent reviewer executed all 18 focused tests and reported no remaining material issues in this patch.

Commands:

```bash
npm ci --prefix tools/location-report-tests --ignore-scripts --no-audit
node --test tests/steering-pointer-owner.test.cjs
node --test tests/*.test.cjs tests/*.test.mjs
node scripts/normalize-release.cjs
```

The regression harness executes actual legacy wrapper control bindings and frame-attachment prefix, core, tuning and drive modules with jsdom DOM propagation. Only rendering, map I/O, native pointer capture and scheduling are substituted. This verifies synthetic pointer sequences and state/heading/throttle behavior. It does not establish physical-phone touch or browser-native pointer capture behavior. No new native browser or physical-phone result is claimed for this repair.

A concurrent automated geospatial refresh advanced the previous branch to bd5da1732bc3e2d0b061667380a6918d40b74a67. The fix is rebased onto that refresh to preserve it; a post-rebase full-suite result and delivery link will be recorded below.

The release normalizer updates active HTML/import cache tokens and shared City Explorer module identities to v1.6.135; those generated reference changes are not gameplay modifications outside this fix.

Post-rebase verification: the full Node suite passed 764/764 with zero failures/skips after preserving bd5da173's automated geospatial refresh. The 18 focused pointer/loader cases are included. Physical-phone testing remains outstanding. Delivery is a separate `fix/steering-pointer-owner` branch based on the earlier feature branch (PR #60); it does not merge or publish either update.
