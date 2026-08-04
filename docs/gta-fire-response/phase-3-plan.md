# Phase 3 Plan — Tactical Operations and Progression

Version target: `0.6.0-phase3`  
Branch: `agent/gta-fire-phase-3-operations`

## Goal

Turn Phase 2's playable emergency city into a replayable operations game. Calls should require ordered tactical decisions, visible risk management and different completion paths instead of a single generic progress action.

## Scope

1. Add a dependency-aware objective engine shared by fire, medical, MVC, alarm and public-assist calls.
2. Add scene-command actions: size-up, command, search, stabilization, access, investigation, metering, overhaul, accountability and documentation.
3. Add incident escalation based on elapsed time, objective completion, supporting units and water supply.
4. Add firefighter stamina, SCBA air, masking and apparatus-side rehab.
5. Expand the call pool with vehicle fire, automatic alarm, carbon-monoxide alarm and lift assist.
6. Add a tactical operations panel, compact risk/vitals HUD and subtitle-style radio traffic.
7. Add persistent XP, ranks, unlocks, streaks and first-responder-humour achievements.
8. Preserve Phase 1 movement/road physics and all Phase 2 city, crew, support, hydrant, equipment, damage and save systems.
9. Keep the implementation static-host compatible, capped and mobile-first.

## Acceptance

- Objectives cannot complete before their dependencies.
- Every active call type has a completable operation template.
- Fire suppression alone does not clear a structure fire before search and overhaul.
- Medical and MVC calls retain their Phase 2 patient/support mechanics and add tactical closure tasks.
- Alarm and public-assist calls can be completed without a fire or patient softlock.
- Risk responds predictably to delay and mitigation.
- Stamina recovers at the engine; SCBA air only drains while masked.
- Career progress persists with versioned data and deterministic level thresholds.
- Mobile controls remain visible and the operations panel is scrollable without moving the game page.
