# Phase 4 Status

Version: `0.7.0-phase4`  
Branch: `agent/gta-fire-phase-4-citywide-career`

## Implemented

- Three selectable fire-station deployments with actual map-world spawn changes.
- Engine 1, Engine 2, Rescue 3 and Ladder 1 apparatus profiles.
- Apparatus-specific handling, tank capacity, fuel capacity and career unlocks.
- Persistent apparatus fuel, water, five-system condition, distance and service history.
- City credits and repair, refuel, tank-refill and full-service actions.
- Six district coverage/reputation records and station-aware dispatch weighting.
- Five selectable shift-condition modifiers.
- Rotating shift challenges, rewards and explicit end-shift progression.
- Manual and high-risk automatic second alarms with responding engine and ladder units.
- Citywide HQ panel and compact unit/fuel/water/credit HUD.
- Original Phase 1–3 gameplay preserved beneath the new career layer.

## Verification package

- Phase 4 pure tests cover geospatial distance, coverage selection, readiness, service quotes, payouts, fuel use, mutual-aid timing, challenge rotation, save migration and servicing.
- Static validation requires the Phase 4 version, controller, save layer, data layer and stylesheet.
- Combined Phase 1–4 syntax, unit and HTTP checks run through `run-phase4-checks.sh`.
- Playwright specifications cover real station/apparatus deployment and mobile HQ containment.

## Manual QA remaining before final release confidence

- Complete several natural calls from each station on the real Peterborough road dataset.
- Compare the four handling profiles on a real Android device.
- Verify long-running fuel, water, service and challenge persistence over multiple shifts.
- Exercise overlapping police, ambulance, second-engine and ladder arrivals under load.
