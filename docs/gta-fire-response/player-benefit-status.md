# Player-Benefit Release Status

Version: `1.1.0-player-benefit`  
Branch: `agent/gta-fire-player-benefit-audit`

## Implemented

- Nonlinear mobile throttle that preserves full-stick speed while adding a controllable crawl range.
- Right-side civilian lane positioning, visible shoulder yielding and continuous following-distance control.
- Apparatus exit refusal when every candidate point is blocked by traffic or the incident scene.
- Gameplay-key isolation while management panels or form fields own input.
- Escape-to-close, dialog semantics, focus trapping, opener focus restoration and visible focus styling.
- Phase 2, Phase 3 and Phase 4 nested save imports validated through their migration functions.
- Progression rank and unlocks derived from validated XP.
- Fresh `1.1.0-player-benefit` cache boundary and release identity.

## Measured improvements

- At 20% thumb-stick travel, the old formula commanded approximately 29.8 km/h with default maximum speed. The new pure curve commands below 10 km/h.
- Full-stick and keyboard output remain 100%.
- Representative 14 m roads now place traffic approximately 2.38 m right of centre and approximately 3.53 m right while yielding.
- A vehicle following at 10 m reduces a 10 m/s cruise target below 2 m/s; 24 m or more retains cruise speed.
- Fully blocked apparatus exits now return no exit point instead of an unsafe fallback.

## Validation package

- All existing Phase 1–5 unit tests remain part of the gate.
- Six new pure tests cover throttle measurements, lane/yield offsets, following distance, exit selection, progression migration and objective priority scoring.
- Three new Chromium journeys cover live partial-stick control, menu keyboard isolation/focus restoration and blocked-exit refusal.
- Static validation requires the player-benefit modules, cache boundary, traffic helpers, keyboard isolation and migrated imports.

## Manual QA remaining

- Target Android thumb feel for the new throttle curve.
- Natural multi-intersection traffic and siren journeys with live road data.
- Live Esri tile stability during sustained high-speed responses.
- Multi-hour repeated-call and persistence soak.
