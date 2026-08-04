# Phase 5 Plan — Complete Release

Version target: `1.0.0-phase5`  
Branch: `agent/gta-fire-phase-5-complete-release`

## Release goal

Turn the accumulated Phase 1–4 systems into a cohesive, fully fleshed-out browser game rather than another isolated feature layer. Phase 5 completes content breadth, onboarding, functional progression, after-action feedback, accessibility, performance protection, save management and release validation while preserving the stable movement, living-city, tactical and citywide systems already shipped.

## Product scope

1. Expand the incident roster from 8 to 23 Peterborough locations across fire, vehicle fire, medical, MVC, alarm and rescue categories.
2. Add randomized operational variants that change scene risk, task pressure and final rewards.
3. Add Story, Standard, Veteran and Friday Night difficulty presets affecting risk, fatigue, traffic, hints and career payout.
4. Make career unlocks functional by accelerating matching search, overhaul, investigation, rescue and vehicle-fire work.
5. Add a guided first-shift tutorial that can be skipped and replayed.
6. Add a unified Operations Centre for briefings, career status, perks, medals, records, difficulty, accessibility, performance and save tools.
7. Add 12 measurable career medals and persistent service records.
8. Add detailed after-action scoring with response, tactics, safety, objectives, water, coordination and equipment categories.
9. Add automatic performance protection that reduces only nonessential traffic and pedestrian detail when sustained frame rate falls.
10. Add high contrast, larger text, simplified HUD and contextual-hint controls.
11. Add complete career backup download, clipboard copy, text import and guarded reset.
12. Retain the complete Phase 1–4 gameplay loop and static GitHub Pages compatibility.

## Acceptance criteria

- Every final call has a unique ID, valid coordinates, district, task and supported tactical template.
- The complete roster contains 23 selectable incidents and all six incident types.
- Incident variants affect the actual Phase 3 operation risk and fire intensity.
- Career perks alter actual task durations rather than appearing only as labels.
- Difficulty changes are locked during active incidents.
- Every completed call creates exactly one final service record and after-action breakdown.
- First-call and other medals unlock from persistent measurable data.
- Save migration clamps malformed data, and exported saves round-trip successfully.
- The title-screen Operations Centre and HQ remain clickable and phone-contained.
- Performance scaling never removes objectives, controls, support logic or incident entities.
- Existing Phase 1–4 unit and browser journeys continue to pass.
- No wanted system, weapons, criminal gameplay or copied GTA assets are introduced.
