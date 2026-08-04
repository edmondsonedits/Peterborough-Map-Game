# Phase 2 Plan — Living Emergency City

Version target: `0.5.0-phase2`  
Branch: `agent/gta-fire-phase-2-living-city`

## Entry criteria and Phase 1 corrections

Phase 2 begins by correcting the verified Phase 1 gaps: failed road loading must expose an enabled retry action; the mobile HUD must retain speed, score, siren, tool and apparatus condition; the title must fit narrow portrait screens; audio pauses while hidden; normal call selection must only choose incident types that have a playable Phase 2 path.

## Milestones

1. Central capped entity manager and pooled rendering.
2. Local simulation bubble for pedestrians and bystanders.
3. Police and ambulance support units with arrival fallback and cleanup.
4. Three-person Engine 1 crew with finite tasks and recovery.
5. Data-driven apparatus inventory with stored, carried and deployed states.
6. Curated hydrant network, engine tank and sustained supply.
7. Proportional apparatus condition affecting steering, speed and pump output.
8. Day, dusk and night overlay with accessibility controls.
9. Weighted recurring calls with medical and MVC Phase 2 completion paths.
10. Score breakdown, shift statistics and versioned local save migration.
11. Desktop/mobile regression, cleanup and failure-path testing.

## Performance budgets

- Civilian traffic: 8 mobile / 14 desktop.
- Pedestrians: 10 mobile / 18 desktop before adaptive reduction.
- Bystanders are included in the pedestrian cap; no more than six should gather near a scene.
- Crew: 3.
- Supporting vehicles: 2.
- Supporting personnel: 4.
- Hydrants: curated static set; only nearby markers are interactive.
- Incident props: 16.

All systems update from the main fixed-step loop. No entity owns a permanent timer or document listener.
