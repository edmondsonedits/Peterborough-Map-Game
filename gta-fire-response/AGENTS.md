# Peterborough Fire Response — GPT-5.6 Sol Architecture Master Instruction

These rules govern `gta-fire-response/` and its scoped tests/documentation.

## Non-negotiable project constraints

- Keep the game compatible with static GitHub Pages hosting.
- Preserve the Peterborough satellite/hybrid Leaflet map unless an explicit renderer migration is requested.
- Do not modify or break the Driving Simulator, Geo Guesser, editor, City Explorer, or other repository games.
- Keep the fire truck constrained to valid drivable road space using its whole footprint.
- Keep the firefighter unrestricted across lawns, parking areas, and satellite-image buildings.
- Keep direct-stick mobile driving as the default: stick direction is desired world travel direction.
- Preserve keyboard and touch controls and a mobile-first, no-scroll gameplay interface.
- Do not add wanted stars, weapons, carjacking, civilian violence, police pursuit, or criminal gameplay.
- Do not copy GTA art, audio, names, logos, dialogue, interface assets, or source code.
- Use original graphics and procedurally generated or properly licensed audio only.
- Keep debug tools behind explicit query parameters.
- Test syntax, pure functions, desktop flow, mobile flow, reset/cleanup, and error states before completion.
- Never merge or deploy without explicit user approval.

## Core principle

**Vocabulary first, implementation second.**

Before changing code, translate the user's plain-language request into recognized computer-science, game-engineering, geospatial, simulation, or browser-rendering concepts.

Examples:

- “make driving smoother” → **kinematic arcade vehicle controller, frame-rate-independent damping, yaw-rate limiting, speed-sensitive steering**
- “stop the truck going through road edges” → **broad-phase spatial query + continuous collision detection + swept vehicle footprint**
- “make traffic act naturally” → **traffic-agent finite-state machine + car-following model + road-graph traversal**
- “make the camera smoother” → **critically damped spring camera + velocity look-ahead + zoom hysteresis**
- “find roads near the truck faster” → **static spatial index / packed R-tree**
- “find the best road route” → **A* shortest-path search on a weighted road graph**
- “render many repeated objects” → **GPU instancing**, only when a WebGL renderer and object count justify it.

Never invent bespoke infrastructure merely because the user's wording does not name the established solution.

## Architecture boundary

Keep custom code where it represents unique game design or firefighter-training behavior:

- firefighter dispatch and incident rules;
- apparatus handling feel;
- direct-stick control semantics;
- firefighter movement;
- scoring;
- crew behavior;
- equipment;
- hydrants;
- suppression operations;
- patient/rescue operations;
- Peterborough-specific gameplay;
- emergency-vehicle yielding policy;
- station-yard behavior;
- career/progression rules.

Prefer established libraries, algorithms, or data structures for generic infrastructure:

- geospatial rendering;
- spatial indexes;
- general computational geometry;
- routing;
- parsing;
- physics when genuine rigid-body physics is required;
- large-scale repeated-object rendering.

## Rendering

The primary map renderer is **Leaflet with Peterborough satellite/hybrid imagery**. Preserve it unless an explicit architectural migration is requested.

Do not introduce Three.js merely because it can render games. Three.js is appropriate only for a deliberate 3D/WebGL world layer.

When remaining in Leaflet, prefer:

- raster tile buffering;
- tile prefetch;
- Canvas-backed rendering where appropriate;
- reusable markers;
- entity budgets;
- minimal DOM churn.

## Simulation loop

Use a **deterministic fixed-timestep simulation with an accumulator**.

Keep simulation and rendering separate. Simulation must not depend on display frame rate. Use `dt` correctly and make smoothing functions frame-rate independent. Do not replace the fixed timestep with variable-delta physics.

## State architecture

Use explicit **finite-state machines** for domain processes. Maintain one canonical game state. State transitions must be intentional and guarded.

Use explicit domain events for cross-system communication. Canonical events include:

- `CALL_DISPATCHED`
- `APPARATUS_ENTERED`
- `RESPONSE_STARTED`
- `APPARATUS_ARRIVED`
- `INCIDENT_STARTED`
- `EQUIPMENT_DEPLOYED`
- `HYDRANT_CONNECTED`
- `TASK_COMPLETED`
- `CALL_COMPLETED`
- `SHIFT_COMPLETED`

Feature systems may subscribe to events.

**Never monkey-patch another system's methods to add features.**

Do not recreate Phase 2, Phase 3, Phase 4, Phase 5, hotfix, or release-history runtime architecture. Release numbers describe software history; they are not runtime domains.

Target responsibility-based structure:

- `engine/`
- `world/`
- `vehicle/`
- `roads/`
- `traffic/`
- `dispatch/`
- `incidents/`
- `operations/`
- `equipment/`
- `crew/`
- `progression/`
- `presentation/`
- `persistence/`

Prefer **composition over monkey-patching**.

## Road architecture

Treat the road network as immutable world data after loading.

Separate responsibilities into:

1. `RoadDataset`
   - parse and normalize GeoJSON.
2. `RoadSpatialIndex`
   - broad-phase spatial lookup;
   - prefer a static packed spatial index such as **Flatbush** where appropriate.
3. `RoadGraph`
   - nodes, edges, connectivity and routing costs.
4. `RoadConstraintSolver`
   - apparatus footprint validation and collision response.

Do not combine all four responsibilities into one growing class.

Use Turf.js or equivalent geographic utilities for preprocessing where useful. Do not call heavyweight geographic helpers unnecessarily inside the 60 Hz simulation hot path. Convert local gameplay geometry into a local Cartesian coordinate system once and perform hot-loop calculations there.

## Apparatus collision

The truck is constrained by its **whole footprint**, not merely its center point.

Use the pipeline:

**broad phase → narrow phase → continuous collision detection**

Broad phase: query potentially relevant road geometry using the spatial index.

Narrow phase: test the oriented apparatus footprint against permissible road space.

At speed: use swept-shape / continuous collision methods rather than allowing tunnelling between frames.

Avoid arbitrary dense point sampling where a proper geometric test is practical. Collision correction must remain stable and deterministic.

## Vehicle controller

The apparatus uses an **arcade kinematic vehicle controller**, not a general rigid-body car simulation.

Use:

- acceleration rate limits;
- braking rate limits;
- coasting drag;
- speed-sensitive maximum yaw rate;
- frame-rate-independent heading damping;
- steering response curves;
- low-speed maneuverability;
- high-speed stability;
- restrained lane assistance.

Player intent remains authoritative. Lane assistance corrects gently rather than driving for the player.

Do not use Matter.js, Cannon.js, Ammo.js, Rapier or another rigid-body engine for ordinary map driving unless a future feature genuinely requires rigid-body dynamics.

## Routing

Use an explicit **road graph**.

For point-to-point routing use **A* search with an admissible heuristic**, not brute force or a straight line.

Route costs may include:

- segment distance;
- road classification;
- intersection/turn cost;
- accessibility;
- optional emergency-response preferences.

Routing and vehicle collision are separate systems. Displayed routes should represent traversable road topology.

## Camera

The camera is an independent presentation system.

Use **critically damped camera following** with:

- velocity-based look-ahead;
- continuous speed-to-zoom mapping;
- hysteresis;
- rate limits;
- tile prefetch/buffering;
- reduced-motion support.

Do not add isolated camera hotfix scripts. Camera movement must not influence simulation state.

## Traffic

Traffic is a lightweight road-constrained agent simulation.

Use explicit behavioral states such as:

- `CRUISE`
- `FOLLOW`
- `YIELD`
- `PULL_OVER`
- `STOPPED`
- `RECOVER`

If greater longitudinal realism is needed, consider the **Intelligent Driver Model (IDM)** instead of inventing arbitrary following-distance behavior.

Emergency yielding remains custom. Avoid complex lane-changing models until road data contains sufficient lane topology.

## Entities and performance

Maintain measurable entity budgets. Use object pooling where creation/destruction causes unnecessary garbage collection.

Do not introduce a full ECS framework unless complexity demonstrates a real need.

If a future WebGL/Three.js renderer contains large quantities of repeated geometry, use:

- `InstancedMesh`;
- instanced buffer geometry;
- frustum culling;
- LOD;
- spatial partitioning.

Do not apply WebGL instancing terminology to ordinary Leaflet DOM markers.

## Physics libraries

Use a physics library only when the problem is genuinely generic rigid-body physics, for example falling debris, collapsing props, movable objects, or physical collisions in a future 3D scene.

Do not use a physics engine merely to implement smooth motion. Use the lightest appropriate abstraction.

## Persistence

Maintain one canonical versioned save schema. Use explicit migrations such as `v1 → v2 → v3`.

Do not maintain parallel Phase 2/3/4/5 save architectures indefinitely. The application version must have one canonical runtime source of truth.

## Refactoring rule

Never perform a giant rewrite solely for architectural cleanliness.

Use a **strangler migration**:

1. introduce the new interface;
2. route one existing feature through it;
3. verify regression tests;
4. migrate remaining behavior;
5. remove obsolete implementation only after equivalence is demonstrated.

The game must remain playable after every migration step.

## Library decision rule

Before implementing generic infrastructure, ask internally:

**“Is this a domain-specific mechanic, or a solved general-purpose problem?”**

If domain-specific, custom implementation is appropriate.

If solved and generic, identify the established algorithm, data structure, architectural pattern, browser API, or maintained library before writing custom code.

Do not add dependencies merely because they exist. The goal is fewer, stronger abstractions.

## Change discipline

Before every significant change:

1. inspect the existing implementation;
2. identify the correct technical vocabulary;
3. identify existing abstractions that already solve part of the problem;
4. decide whether a known algorithm/library should be used;
5. choose the smallest architectural change toward the target architecture;
6. preserve mobile and desktop controls;
7. preserve deterministic behavior where practical;
8. test normal flow and failure/reset paths;
9. check mobile-performance assumptions;
10. remove obsolete code only after replacement behavior is verified.

Never solve a structural problem by adding another patch layer.

When tempted to create a file named after a release, hotfix, phase, or temporary patch, stop and place the behavior in the domain that owns it.

## Primary engineering objective

Optimize in this order:

**correct architecture → predictable behavior → mobile performance → maintainability → visual polish**

The desired end state is a small, understandable collection of stable systems that GPT-5.6 Sol can reason about without needing to understand years of historical patches.
