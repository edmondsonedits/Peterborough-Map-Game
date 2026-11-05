# City Explorer Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add shared walking and driving in private-code Peterborough rooms, with automatic Player 1–Player 8 seats and server-authoritative simulation.

**Architecture:** A Node room server owns identities, seats, vehicle ownership, and world simulation. Browser prediction and server authority import the same renderer-independent movement, protocol, and versioned city-world package. The first task is a hard feasibility gate: export complete server-loadable world data and prove parity; if any required city surface/collision area cannot be extracted and matched, stop before rooms/UI. Do not substitute a client-authoritative position relay.

**Tech Stack:** Existing browser Three.js/ES modules; Node.js; pinned compatible Colyseus packages after an API smoke; existing `node:test` and Edge browser harness patterns.

**Spec:** `../specs/2026-11-05-multiplayer.md`. Research: H:\ChatGPT\City-Explorer-Multiplayer-Research-20261105\research.md.

## Global Constraints

- First-release room capacity is 8. Assign stable names Player 1 through Player 8 automatically; no free-name UI. Retain a name through reconnect and reuse its seat only after reservation expiry.
- Walking and driving are both required. Player-controlled actors pass through one another; environment collisions remain active.
- The server advances the same movement/collision rules as browser prediction; never accept final client positions as authoritative.
- Reconcile implementation against freshly fetched `origin/main` `5d9ad191` (v1.6.183). Inspected source HEAD `8a21d9ce` is dirty evidence only; preserve its concurrent release changes and implement in an isolated checkout.
- Preserve single-player behavior and release loading/cache conventions. No calls, voice, passengers, equipment operations, player-to-player collision, paid-service activation. Public deployment is authorized by the user after completion and verification.
- 30 Hz input/snapshot, 60 Hz movement substeps, and 50–100 ms interpolation are benchmark starting values, not proven targets.

## Review Focus

- Server-loadable world export omits a road, bridge/underpass, hill, station, wall, or door collision surface; gate on exact fixture and route parity.
- Browser globals or renderer state leak into shared movement/protocol/world modules; require Node imports.
- Concurrent vehicle claims, replays, reconnects, and expired reservations violate exclusive ownership or seat reuse rules.
- Backgrounded clients leave stale controls active; neutralize walking/throttle/steering and brake deliberately.
- WebSocket head-of-line delay or unsupported datagram behavior is hidden by application-level message drops; impair the underlying transport.

---

### Task 1: Extract shared simulation and export a complete city world (hard gate)

**Files:**
- Create: `city-explorer/multiplayer/movement-core.mjs` (pure walking/vehicle steps)
- Create: `city-explorer/multiplayer/protocol.mjs` (versioned message validators and shared wire shapes)
- Create: `city-explorer/multiplayer/world-collision.mjs` (runtime queries over exported world data)
- Create: `city-explorer/multiplayer/world-data/v1/world-manifest.json` and `world-data.bin` (generated, server-loadable static collision/surface package)
- Create: `tools/export-multiplayer-world.mjs`, `tools/check-multiplayer-world-parity.mjs`, and `tests/fixtures/multiplayer-world-fixtures.mjs`
- Modify: `city-explorer/gameplay-systems.js` to delegate existing vehicle math to shared core without changing single-player outputs
- Modify: `city-explorer/app.js` to load/query the same exported world package in multiplayer; keep the existing local runtime only for single-player
- Test: `tests/multiplayer-movement-core.test.mjs`, `tests/multiplayer-world-collision.test.mjs`, `tests/multiplayer-protocol.test.mjs`

**Interfaces:**
- `stepWalking(state, controls, dt, world) -> nextState`; `stepVehicle(state, controls, dt, world, tuning) -> nextState`.
- `world.sampleSurface(x, z, referenceY) -> {height, onRoad, surfaceId, version}`; `world.blocks(previousPose, nextPose, {kind, dimensions}) -> boolean`. Exclude dynamic player actors from environment collision.
- `protocol.mjs`: `PROTOCOL_VERSION`, `validateInput`, `validateAction`, `validateSnapshot`. Input is `{protocolVersion, epoch, sequence, mode:'onFoot'|'driving', controls:{forward,strafe,sprint,throttle,steering}}`; actions are separate sequenced commands. Pose is `{x,y,z,heading,vx,vz,speed,steering}`. Snapshot is `{protocolVersion,worldVersion,tick,serverTime,epoch,ackInputSequence,player:{id,name,mode,pose,vehicleId},players:[...],vehicles:[{id,pose,driverPlayerId}]}`.
- `node tools/export-multiplayer-world.mjs --out city-explorer/multiplayer/world-data/v1` must produce deterministic manifest/hash and data readable by both browser and Node. `node tools/check-multiplayer-world-parity.mjs --world city-explorer/multiplayer/world-data/v1` compares browser-source and package fixtures at matching coordinates, including height, surface identity, and blocked/clear outcomes.

- [ ] Test Node-only imports, deterministic walking/driving against existing behavior, clamped malformed controls, and input/schema rejection.
- [ ] Export and compare surveyed road/off-road, hill, bridge deck and underpass, station apron, wall, and bay-door fixtures plus representative routes; record route coverage and world version.
- [ ] Run `node --test tests/multiplayer-movement-core.test.mjs tests/multiplayer-world-collision.test.mjs tests/multiplayer-protocol.test.mjs tests/critical-gameplay.test.cjs`, `node tools/export-multiplayer-world.mjs --out city-explorer/multiplayer/world-data/v1`, then `node tools/check-multiplayer-world-parity.mjs --world city-explorer/multiplayer/world-data/v1`.
- [ ] **Gate:** if export is incomplete, browser and server queries differ, or required map areas are uncovered, stop Tasks 2–6 and report the missing extraction/geometry work. Do not present the adapter or relay as shared authority.

### Task 2: Add authoritative rooms, seats, and atomic vehicle ownership

**Files:**
- Create: `city-explorer/multiplayer/server/package.json` and lockfile with pinned compatible Colyseus packages
- Create: `city-explorer/multiplayer/server/src/room-seats.mjs`, `explorer-room.mjs`, `vehicle-ownership.mjs`, `index.mjs`
- Test: `tests/multiplayer-room-seats.test.mjs`, `tests/multiplayer-server-room.test.mjs`, `tests/multiplayer-vehicle-ownership.test.mjs`

**Interfaces:**
- `allocateSeat(room, identity, now) -> {seat:1..8,name:'Player N',credential,expiresAt}`; unexpired reconnect restores same identity/name, and only expiry frees it.
- `room.create({creatorSession,roomName})`; `room.join({joinCode,clientVersion,worldVersion})`; `room.submitInput({credential,input})` as specified in Task 1. Server runs fixed ticks against Task 1 world data.
- `claimVehicle({credential,epoch,requestId,vehicleId}) -> {ok,vehicleId|error}` atomically grants one free stable vehicle ID to one player. `releaseVehicle({credential,epoch,requestId,vehicleId})` validates current driver and exits at a server-selected clear point. `switchVehicle({credential,epoch,requestId,fromVehicleId,toVehicleId})` atomically releases/claims or makes no change. Never trust client-reported exit pose. Ownership changes increment `entityGeneration` and appear as reliable lifecycle events.
- Server rejects duplicate request IDs, stale epochs, non-owner release/switch, occupied vehicle claims, incompatible world/protocol versions, invalid code, excessive rate, malformed controls, and stale sequences. Snapshot uses Task 1 protocol shape.

- [ ] Test all eight distinct names, ninth-seat rejection, reconnect retention, allocation races, and reuse only after expiry.
- [ ] Test simultaneous claims for one truck (exactly one succeeds), duplicate/reordered claims, unauthorized release, atomic failed switch, server-validated clear exit point, and no duplicate occupied/parked vehicle.
- [ ] Test private code joins, sanitized directory, admin/revocation, room expiry, independent fixed tick, input spam/NaN/sequence replay, stale-input neutralization, and version rejection. Verify pinned Colyseus API with a minimal server/client smoke.
- [ ] Run `node --test tests/multiplayer-room-seats.test.mjs tests/multiplayer-server-room.test.mjs tests/multiplayer-vehicle-ownership.test.mjs`.

### Task 3: Add client transport, prediction, and remote interpolation

**Files:**
- Create: `city-explorer/multiplayer/client-runtime.mjs`, `transport-colyseus.mjs`
- Test: `tests/multiplayer-client-runtime.test.mjs`

**Interfaces:** `createClientRuntime({transport,movement,world,clock})` exposes `sendInput(controls)`, `sendAction(action)`, `applySnapshot(snapshot)`, `sampleRemote(playerId,renderTime)`, `resetBaseline(snapshot)`, and `dispose()`. It uses the shared protocol, monotonic input sequence, reconnect epoch, server tick/time, acknowledged input sequence, bounded replay, and bounded timestamped interpolation; visual easing never changes collision state.

- [ ] Test immediate prediction, ack/replay, angle wrap, correction vs visual easing, interpolation, bounded extrapolation, backlog resync, reconnect reset, and same-world client/server scripted parity.
- [ ] Run `node --test tests/multiplayer-client-runtime.test.mjs`.

### Task 4: Integrate room UI and multiplayer actors behind mode boundary

**Files:**
- Create: `city-explorer/multiplayer/room-ui.mjs`, `remote-actors.mjs`
- Modify: `city-explorer/app.js`, `city-explorer/index.html`, and `city-explorer/fleet-runtime.js` only at mode/input/render/ownership boundaries
- Test: `tests/multiplayer-ui.test.mjs`, `tests/multiplayer-app-boundary.test.cjs`

**Interfaces:** UI calls `createRoom`, `listRooms`, `joinRoom`, `leaveRoom`, `lockRoom`, `rotateCode`, `kickPlayer`, and `transferAdmin`; server supplies names. App sends controls/actions only, never poses. Vehicle enter/exit/switch uses Task 2 ownership commands. Remote actors use independent visuals and cannot change local camera, station, single-player state, or parked transforms. Disable aerial/equipment mutations in multiplayer with a clear explanation.

- [ ] Test no name input; automatic names/reconnect; mode isolation; join/leave/kick cleanup; local camera/station independence; one rendered actor per vehicle; unsupported controls disabled.
- [ ] Run focused tests plus existing gameplay, fleet-selection, and station-transition tests.

### Task 5: Automate two-client browser/lifecycle validation

**Files:**
- Create: `tools/check-multiplayer-browser.cjs` following `artifacts/fleet-run-browser-check.cjs` Edge harness patterns
- Test: `tests/multiplayer-browser.test.cjs` (two isolated Edge contexts against one local server)

- [ ] Start local preview with `node tools/serve-preview.cjs 4188` and server with the isolated multiplayer server command; run `node tools/check-multiplayer-browser.cjs`.
- [ ] Assert create/list/private-code join, hidden credentials in listing, distinct automatic names, walking and driving visible both ways, camera/station independence, simultaneous vehicle claim winner, entry/exit, background stale-input neutralization, reconnect reservation, expiry/reuse, and no actor duplication.
- [ ] Run 2/4/8 browser clients together and across stations; cover late join while driving, hill/bridge/bay-door/world-data boundaries, desktop plus mobile viewport/touch controls. Capture protocol/world versions and correction/streaming errors.
- [ ] Actual Android and iPhone tests remain a separate physical-device gate; browser viewport emulation cannot claim radio, thermal, or physical-device smoothness.

### Task 6: Decide transport with an impaired-network experiment

**Files:**
- Create: `tools/benchmark-multiplayer-transport.cjs` (runs the same room and motion workload over WebSocket and a datagram candidate supported by the pinned stack)
- Create: `artifacts/multiplayer-transport-benchmark.md` (measured decision record; do not check in generated secrets)
- Test: extend `tests/multiplayer-browser.test.cjs` for fallback/compatibility paths

- [ ] Run both transports under network-level impairment: 40/100/200 ms RTT, 0/20/50 ms jitter, 0/1/3% loss, bandwidth caps, loss burst, and one-second outage. Include current Edge/browser compatibility and explicit WebSocket serialization fallback; reject relying on unreliable schema fields that do not update on WebSocket.
- [ ] Record snapshot age, stale backlog, input-to-visible response, correction distance/frequency, interpolation underruns, server tick, queue size, bandwidth, and reconnect/resync behavior. Preserve repeatable commands and raw metric summaries in the artifact.
- [ ] Select WebSocket baseline or datagram candidate from evidence; if datagram lacks browser compatibility/fallback or neither meets measured acceptance criteria, stop and report. No deploy-readiness or phone-smoothness claim until transport and actual Android/iPhone validation pass.
