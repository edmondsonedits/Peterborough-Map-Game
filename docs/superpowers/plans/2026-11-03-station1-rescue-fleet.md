# Station 1 rescue fleet implementation plan

> **For agentic workers:** Use superpowers:executing-plans for primary integration; one bounded asset worker owns Blender production. Track each task below.

**Goal:** Five persistent session vehicles with direct driving selection, plus Blender aerial platform and enclosed medi pickup.
**Architecture:** Keep existing active truck references as adapters to a five-entry fleet. A pure apparatus controller drives named GLB pivots; collision queries are shared by deployment, movement and water. Render parked fleet independently of active station.
**Tech Stack:** Existing Three.js r180, browser ES modules, Node node:test, Blender 5.2/Python.
**Spec:** H:/ChatGPT/Peterborough-Station1-Fleet-20261103/station1-fleet-design.md; user amendment 2026-11-03 is authoritative: rescue basket stows centrally and folds out from rear-mounted base, nozzle underneath; vehicle selector directly drives last-position vehicle; all five vehicles reset only on fresh page load (or explicit reset).

## Global constraints
- Reuse original pumper components, no paid assets. Aerial between pumper and medi at Station 1.
- Five identities: pump-1, pump-2, pump-3, aerial, medi. All remain visible where left, independent of selected station.
- Selection must never silently reset positions. No explanatory station mapping in player UI.
- Preserve existing roads, GIS/station anchors and release behavior. No publishing without explicit authorization.
- Work only under H:/ChatGPT on feature/station1-rescue-fleet; preserve others' changes.

## Review focus
- Remote selection with failed streaming must leave old vehicle and camera usable.
- Loaded/unloaded station models must not drop parked vehicles below slab or teleport them.
- Basket folds only after retraction and alignment; nozzle transforms and level floor follow real hierarchy.
- Parked vehicles block doors/exit/setup and survive station selection in the same session.
- Lost touch/key input stops apparatus and water; switching away leaves a stable, stopped apparatus.

### Task 1: Fleet and controller contracts
**Files:** Create city-explorer/vehicle-fleet.mjs, aerial-controller.mjs, apparatus-collision.mjs and tests/vehicle-fleet.test.mjs, aerial-controller.test.mjs, apparatus-collision.test.mjs.
**Interfaces:** createVehicleFleet(spawns) -> {vehicles,activeId,select(id),reset()}; FLEET_DEFINITIONS; createAerialState(); stepAerial(state,input,delta,environment); aerialPose(state); vehicleFootprint/overlap and sampled swept collision utilities.
- [x] Write and run failing tests for persistence across all five selections, fresh initialization, faster pickup, full deploy/stow and blocked state transitions, supply depletion, basket geometry/ground collision and swept ladder obstruction.
- [x] Implement pure state, finite/clamped timestep, interlocks and collision sampling. Run node --test for these three files; expect zero failures.

### Task 2: Blender vehicle assets (bounded worker)
**Files:** Create tools/blender/build_station1_fleet.py, assets-source/vehicles/aerial-platform.blend, medi-pickup.blend, city-explorer/assets/vehicles/aerial-platform.glb/json, medi-pickup.glb/json, tests/fleet-assets.test.mjs. Do not edit original pumper source/output.
**Interfaces:** Names Wheel_FL/FR/RL/RR (+ RL2/RR2 aerial), Beacon_L/R/RearL/RearR; TurntableYaw -> LadderPitch -> nested LadderSection_1..4 -> BasketLevel -> BasketFold -> Basket; underside MonitorYaw -> MonitorPitch -> NozzleOutlet; Outrigger_FL/FR/RL/RR -> Jack_FL/FR/RL/RR. Game axes Y up,-Z forward; rest ladder points -Z. Rear base local z=4.4,y=2.5; retracted ladder length 5.6m, per-stage max offset 6.8m (four sections), basket endpoint at z=-5.6 relative root plus extension. Basket stowed hinge/fold pose settled with primary before export. Supply machine-readable metadata pivots, extents, node names.
- [x] Build separate new bodies from reusable pumper geometry (Blender import source components), preserve pumper hashes.
- [x] Save .blend and GLB, render contact sheet stowed/deployed and pickup, validate bounds and required node hierarchy with Node GLTFLoader tests. Report exact pivot/rest contracts to primary.

### Task 3: Runtime fleet, direct selector and station geometry
**Files:** Modify city-explorer/app.js, gameplay-systems.js, station-one-runtime.js, index.html as needed; create fleet-runtime.js, fleet-assets.js, fleet-ui.js and fleet.css. Extend relevant station tests.
**Interfaces:** Existing fireTruckActor/truckState become active aliases, fleet runtime exposes selectVehicle(id), list(), state(), update(delta); selectedStationRuntime follows home station for controls while all loaded runtimes remain collidable. stepFireTruckKinematics accepts optional tuning default unchanged.
- [x] Initialize all five spawns with correct station transforms; keep all actors in gameplayGroup. Reuse authored pumper asset load. Verify existing focused pumper/station baseline.
- [x] Replace menu's station choices with five named vehicle buttons. Select active alias only after destination readiness succeeds, spawn player driving there and preserve all prior poses. Map/speed/audio/camera/dispatch resolve active vehicle. Existing switchStation(number) adapter selects corresponding pump.
- [x] Parameterize kinematics and station footprint by vehicle dimensions. Block parked vehicle contact/door closing and choose nearest entry/clear exit. All station runtimes remain visible and relevant to collision regardless selection.
- [x] Add runtime tests/browser smoke: leave Pump 1 remotely, select others, return and see it; all initial spawns, three Station 1 departures and faster medi under equal input.

### Task 4: Apparatus, stream and controls
**Files:** Create aerial-runtime.js and aerial-ui.js; integrate fleet update; tests/aerial-runtime.test.mjs or equivalent GLB integration tests.
**Interfaces:** Runtime applies controller state to hierarchy each frame, exposes world nozzle outlet and conservative geometry probes; UI emits held axes/action edges, stop clears all on blur, pointercancel and mode changes.
- [x] Build static collision query from actual scene building geometry/station roofs plus dynamic fleet envelopes; reject missing scenery support. Test all sections/basket over swept intermediate poses, excluding intended rigid self parts but checking cab.
- [x] Add stabilize/raise/rotate/telescope/basket/nozzle controls, stow/stop/refill and supply/status. Water ballistic stream terminates at actual first impact; pooled visuals only.
- [x] Check desktop/touch, switching while deployed, emergency stop, stow alignment, pad ground contact and stream origin/occlusion.

### Task 5: Verification and delivery
- [x] Run node --test focused new suites and related station/pumper/kinematics/transition suites, node syntax checks and git diff --check; investigate only actual failures.
- [x] Browser smoke through existing local preview server with screenshots: all five, bay fit/departure, basket stowed/extended, stabilized pads, water and persistent remote fleet.
- [x] One fresh whole-change reviewer, fix material defects, repeat affected checks. Record results and remaining limitations in docs/superpowers/plans/2026-11-03-station1-rescue-fleet-progress.md.
- [x] Deliver local source/models and preview; do not deploy.
