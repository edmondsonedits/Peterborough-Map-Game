# Phase 4 Plan — Citywide Deployment and Career

Version target: `0.7.0-phase4`  
Branch: `agent/gta-fire-phase-4-citywide-career`

## Goal

Expand Street Shift from a single-apparatus tactical game into a persistent citywide fire-service career. The player should choose where to deploy, select an unlocked apparatus, protect district coverage, restore the unit between calls and manage a complete shift instead of immediately looping through disconnected incidents.

## Scope

1. Add Station 1, Station 2 and Station 3 deployment choices with distinct map spawns.
2. Add four apparatus profiles with different handling, water, fuel, roles and career unlock levels.
3. Persist apparatus fuel, water, damage, distance and service history.
4. Add city credits and repair, refuel, refill and full-service decisions.
5. Add district coverage and reputation across six gameplay districts.
6. Add station-aware call weighting and rotating shift conditions.
7. Add three rotating shift challenges, rewards and an explicit end-shift loop.
8. Add manual and automatic second-alarm requests with responding engine and ladder apparatus.
9. Preserve the complete Phase 1 movement, Phase 2 city systems and Phase 3 tactical operations.
10. Keep all new panels mobile-contained and static-host compatible.

## Acceptance

- Selecting a station changes the actual player and apparatus spawn.
- Selecting an apparatus changes tank capacity and handling.
- Locked apparatus cannot be selected below its career level.
- Fuel, water and damage persist after calls and can be serviced only in quarters.
- Returning from a call waits for the player to mark the unit ready before dispatching again.
- Completed calls pay credits, progress challenges and alter district reputation.
- Larger fire risk can trigger additional responding fire apparatus.
- The citywide layer cannot double-record a Phase 3 tactical result.
- Existing saves migrate safely and malformed values are clamped.
- No wanted system, weapons, criminal gameplay or copied GTA assets are introduced.
