# SDD ledger — plan: docs/superpowers/plans/2026-11-03-station1-rescue-fleet.md
Spec amendment: rescue basket with underside monitor, rear mounted folding ladder, five direct vehicle choices and session-preserved world locations. User has approved proceeding with these corrections.
Workspace: existing clean linked worktree; new feature/station1-rescue-fleet branch based on 06df88f9 (v1.6.177).
Ruling: implement primary inline with one bounded Blender worker, matching user efficient-coding defaults and independent asset/runtime work.
Pre-flight: tasks 1,3,4 share FLEET_DEFINITIONS and controller pose; task 2 exports named model pivots consumed by task 4. No known naming conflicts; agree basket rest transforms before export.

Task 1: complete — fleet state, controller and collision tests passed; five identities keep independent session poses.
Task 2: complete — Blender source and runtime assets exported; original pumper remains unchanged. Aerial 48,980 triangles /3,161,720 bytes; Medi12,044 triangles/766,316 bytes. Asset tests2/2passed; rendered previews inspected.
Task 3: complete — initial driving, direct vehicle choices, all5actors, correct baydoors, per-vehicle dimensions and handling. Browser showed exact Pump1 x/z retained after selecting other pumps and both new vehicles. Pump2/3/Medi departures measured17.97m/25.03m/25.49m in focused browser checks.
Task 4: complete — full deployed ladder/basket, underside water monitor, water supply/impact, overview/nozzle camera, held keyboard/touch controls, stop/resume and stow. Real GLB tests verify basket level on a tilted chassis, central stow and support rejection.
Ruling: initial0.55m jack travel left too little allowance after lowering from travel height. Final1.0m telescoping jack limit supports curb-height variation; actual beam-to-foot pistons track that stroke.5-degree slope,0.42m relative ground difference, dry/support/clearance checks remain enforced.
Review: one focused Sol reviewer found and resolved Blender cab extraction axis/template/cutoff defects. No confirmed Important/Critical defect in reviewed selection, driving, aerial interlock or collision paths.
Task 5: final browser pass running. Previous focused suite71/71passed; affected jack/basket/asset tests7/7passed after final jack change. Local preview http://127.0.0.1:4188/city-explorer/?station=1 ; no publishing authorized or attempted.

Task 5: complete — final real-game browser pass succeeded with zero page errors: all5choices, initialdriving, exactremotePump1preservation, aerialdeploy/rotate/extend/flow, switchingawaypreservesdeployedposeandstopswater, fullstow, mobilecollapsed/opencontrols and no horizontaloverflow. Evidence: artifacts/fleet-final-browser.json, fleet-final-water.png, fleet-final-mobile-controls.png and fleet-final-tests.txt.
Late reviewer finding resolved: jack preflight now computes the fully extended beam contact, not the retracted beam, with a failing-then-passing5-degree chassis-roll regression. Nozzle camera now sits beyond the barrel to clear the basket floor/front wall; failing-then-passing GLB runtime assertion.
Verification: finalfocused71tests pass, affectedlatefixes pass, module syntax checks and gitdiffcheck pass. Original generic-pumper.glb and originalBlenderbuilder are unchanged.
Limitations: browserEdge desktop and390x844touchviewport tested; physicalphone performance/visual acceptance not measured. Water is a visual spray/impact with onboard game supply; no new firefighting/rescue mission or hose/hydrant simulation. Fleet positions persist in memory for this page session and reset onfreshload, as requested. No deployment, push or external upload.
Ruling: keep finished feature on feature/station1-rescue-fleet for local review; no integration/publishing requested.
