# D03 — optional preference storage, v1.6.137

The user requested this fix after the current v1.6.136 desktop and mobile wrapper startup blocks were replayed with denied storage. Both threw SecurityError before installing startup/control listeners.

## Repair

Voice defaults to enabled when storage is unreadable; a readable stored literal `false` still mutes. Preference reads and writes are guarded individually. Failed writes do not interrupt in-memory toggling, button feedback, or cancellation of ongoing speech.

The same storage restriction also aborted downstream default steering/handling migrations. Their optional reads/writes are now guarded while in-memory mode changes remain outside those catches. Arcade saveSettings is guarded because desktop startup calls it and live handling controls must remain usable without persistence. No shared storage abstraction, new dependency, dialog or warning was added.

## Evidence

Base: main f863d28f0f0b72f5e0dd0f6165cf1751b6944a15 (v1.6.136).

- Baseline Node suite: 767 passed.
- New tests before repair: 14 failed on the denied-storage paths; two working-storage persistence cases already passed.
- After repair: 16 focused tests passed; full Node suite 783 passed, zero failures/skips.
- Independent review independently ran the 16 focused cases and found no material issue.
- Syntax and diff checks passed. The release normalizer updates active cache/module references to v1.6.137.

The tests cover property-access denial, getItem SecurityError and setItem QuotaExceededError separately, complete desktop/mobile wrapper startup logic with runtime/services/map I/O substituted, saved mute restoration, repeated toggles, UI state and speech cancellation. Actual core→tuning→arcade→camera→drive modules also execute with denied storage, testing installed flags, session handling controls and mobile heading/throttle. This is jsdom/code integration evidence; it does not establish physical-device browser-policy behavior or full gameplay under every storage restriction.

The existing unrelated City Explorer browser-smoke startup timeout remains outside this fix. Training datasets and Firebase configuration are unchanged.
