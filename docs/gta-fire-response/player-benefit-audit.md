# Peterborough Fire Response — Player-Benefit Audit

Release target: `1.1.0-player-benefit`  
Branch: `agent/gta-fire-player-benefit-audit`  
Baseline: Phase 5 `main` at `fe989a5b43880dd0092b816d79a2cf13d610f8b7`

## Baseline findings

The Phase 5 post-merge workflow passed both its static/unit and Chromium jobs. The baseline therefore began from a working release, not a broken build. Source inspection and repeatable browser/unit probes identified player-facing gaps not represented by the original scripted journeys.

### Measured baseline

- Start-to-dispatch: covered by existing Chromium automatic-dispatch journey.
- Complete tactical boot, mobile containment and station/apparatus deployment: covered by the Phase 1–5 browser suite.
- Mobile throttle at 20% stick travel: the original formula commanded `0.2 + 0.8 × 0.2 = 36%` of maximum speed. With the default 23 m/s limit, that is approximately **29.8 km/h of commanded speed** from a small thumb movement.
- Traffic lateral separation: **0 m** because civilian markers were placed directly on source road centrelines.
- Yielding lateral movement: **0 m**; yielding reduced speed but left the vehicle in the travel path.
- Continuous following-distance control: absent after spawn.
- Fully blocked apparatus exits: the first candidate was returned even when every candidate failed the safety check.
- Open-panel keyboard isolation: absent; document-level gameplay handlers still received form and panel key presses.
- Phase 3 import validation: imported progression was shallow-merged and could carry rank or unlock values not derived from XP.

Real satellite-tile behaviour, physical Android thumb ergonomics and long natural route driving remain manual measurements because the connected environment cannot reproduce the target phone and network conditions faithfully.

## Objective ranking

Priority formula: `(impact × reach × confidence) ÷ (effort + regression risk)`.

| Finding | Category | Impact | Reach | Confidence | Effort | Risk | Score |
|---|---|---:|---:|---:|---:|---:|---:|
| Small-stick throttle jumps to road speed | Must fix | 5 | 5 | 5 | 2 | 2 | 31.25 |
| Traffic occupies centreline and stops in lane to yield | Must fix | 5 | 5 | 4 | 3 | 3 | 16.67 |
| Unsafe exit fallback can place player into traffic | Must fix | 5 | 3 | 5 | 1 | 2 | 25.00 |
| Menu/form keys leak into gameplay | High value | 4 | 4 | 5 | 2 | 2 | 20.00 |
| Imported nested career layers bypass migrations | High value | 4 | 2 | 5 | 2 | 2 | 10.00 |
| Full lifecycle event-bus rewrite | Useful, deferred | 3 | 5 | 3 | 5 | 5 | 4.50 |
| Additional incident locations | Do not implement | 1 | 4 | 2 | 4 | 3 | 1.14 |
| Another currency/progression track | Do not implement | 1 | 2 | 2 | 4 | 3 | 0.57 |

## Implemented improvements

### 1. Precision mobile throttle

**Problem:** Any stick travel beyond the dead zone commanded at least 20% plus the analog component. A 20% stick movement therefore commanded roughly 29.8 km/h with default tuning.

**Solution:** A nonlinear throttle curve now maps dead-zone exit to a controllable crawl while retaining 100% output at full stick. Steering direction remains direct-stick and keyboard/full-stick behaviour remains unchanged.

**Measured after:** At 20% stick travel, commanded speed is below 10 km/h in the pure measurement. Full input remains exactly 100%.

**Player benefit:** Easier parking, station turnout, lane positioning and corner setup without reducing top speed.

### 2. Civilian lanes, pull-over yielding and following distance

**Problem:** Opposing traffic shared the road centreline. Emergency yielding slowed vehicles in place, and spacing was checked only at spawn.

**Solution:** Civilian vehicles now occupy the right side of their road corridor, move farther right while yielding, smoothly interpolate lateral position and reduce speed according to same-lane following distance.

**Measured after:** A representative 14 m road produces a 2.38 m normal lane offset and approximately 3.53 m yielding offset. A 10 m following gap reduces a 10 m/s cruise target below 2 m/s, while gaps of 24 m or more retain cruise speed.

**Player benefit:** Clearer opposing lanes, more useful siren response and fewer civilian overlaps or stationary roadblocks.

### 3. Safe apparatus exit refusal

**Problem:** If all four exit candidates were occupied, the game returned the first candidate anyway.

**Solution:** The exit selector now returns no point when every candidate is blocked. The firefighter remains in the cab and receives a clear instruction to move the apparatus or wait for traffic.

**Player benefit:** No sudden spawn into traffic or the incident marker; predictable interaction feedback.

### 4. Keyboard and dialog isolation

**Problem:** Space, arrows and hotkeys entered in settings, selects or save text could also interact, steer, activate sirens or pause gameplay behind the panel.

**Solution:** Gameplay input is suspended whenever a blocking management surface or interactive form control owns focus. Major panels expose dialog state, trap Tab navigation, close with Escape, restore focus to their opener and receive visible focus rings.

**Player benefit:** Menus can be safely used with keyboard, switch controls or text entry without accidental game actions.

### 5. Validated multi-layer save imports

**Problem:** Phase 2 and Phase 3 data from a valid Phase 5 bundle were copied into live stores with shallow object merges.

**Solution:** Imports are allowed only between calls. Each nested layer passes through its own migration and clamping function. Progression level, rank and unlocks are derived from validated XP.

**Player benefit:** Fewer corrupted careers, impossible unlock states and mismatches between visible progression and saved statistics.

## Improvements intentionally rejected

- **More incidents:** The roster already contains 23 calls. Adding labels and coordinates would not address the repeated driving and interaction problems found in the audit.
- **Another currency or progression track:** It would increase menu load without improving the core response loop.
- **Full event-bus rewrite:** Multiple method wrappers remain architectural debt, but replacing the complete lifecycle in this focused release would carry disproportionate regression risk. The safe improvements were kept at existing extension boundaries and covered by tests.
- **Removing road restrictions:** This would hide handling problems by eliminating an important game rule.
- **More permanent HUD controls:** Mobile control density was already a known risk; the audit reduced accidental input rather than adding another button.

## Remaining limitations

- Traffic still follows lightweight segment routing rather than predicting complex intersection right-of-way.
- The throttle curve requires subjective validation on the target Android device; the automated measurement confirms range, not thumb feel.
- Live Esri tile flashing and network latency require real-network testing.
- A multi-hour repeated-call and persistence soak remains manual QA.
- The broader lifecycle wrapper architecture should be revisited only with dedicated event-contract tests and a separate migration plan.
