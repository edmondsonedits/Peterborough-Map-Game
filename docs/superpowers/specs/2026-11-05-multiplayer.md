# City Explorer multiplayer design
Date: 2026-11-05. Status: implementation and publication approved by the user.

Enable people on separate computers and phones to see one another walking and driving in the same Peterborough city. Prioritize responsive local controls and smooth remote movement. Preserve a path to shared emergency calls without implementing calls in this release.

Confirmed requirements: publicly visible rooms requiring a private join code; creator becomes administrator; shared walking and driving; cross-device use. The user approved vehicles passing through one another in the initial release while retaining environment collisions. Player display names are assigned automatically as Player 1 through Player 8; there is no free-name entry UI. A player's assigned name is retained across reconnects and its seat/name may be reused only after that player's reservation expires.

Proposed defaults: eight players per room; anonymous sessions; regional authoritative Node server using Colyseus; session-only world state; no passengers, voice, shared calls, equipment operations, or physical contact between player-controlled actors. These defaults are recommendations, not separately confirmed requirements.

## Approaches
An authoritative online room is recommended because the simulator remains available when its administrator's phone sleeps. Colyseus supplies room and state infrastructure compatible with the existing Three.js application. A custom Node/WebRTC server offers transport control but adds substantial protocol and lifecycle work. Player-hosted simulation makes the session depend on one player's device and is unsuitable as the default.

## Gameplay and room flow
Create Room requests a logical room on an existing online game process, returns private administrator credentials and a separate random join code, and reserves the creator's player identity. The directory exposes sanitized room name, occupancy, capacity, and joinability, never codes or credentials. Joining validates the code server-side and issues a player credential. Enforce rate limits and creation quotas. The server assigns the first available name from Player 1 through Player 8. Names are immutable for the lifetime of a reservation; reconnect restores the same name and identity. A seat/name is eligible for reuse only after the server's reconnect reservation expires. The UI contains no editable display-name field.

Players become active only after loading compatible world assets and receiving a coherent state baseline. They may walk, claim an available vehicle, drive, exit, and see named remote players. Server-owned stable vehicle IDs and exclusive driver occupancy prevent double claims. Remote players never change local camera or station selection. Selecting a different station/vehicle must use explicit server-approved transitions, not silently teleport or replace a shared truck. Existing vehicle positions persist for the room lifetime.

An occupied or moved vehicle must not also appear as a duplicate parked vehicle. Environmental collision geometry remains authoritative; player-controlled actors do not physically obstruct one another in this milestone. Aerial/equipment controls and other unsupported world mutations are disabled in multiplayer with a clear explanation. Single-player behaviour is preserved.

The administrator may remove players, lock joining, rotate the code, transfer administration, or close the room. Transfer administration on departure after a short reconnect grace period, according to a deterministic eligible-player order. Empty rooms expire. Room state is ephemeral: a server crash may end a room; seamless crash recovery is outside this release.

## Simulation
Extract numerical walking/driving rules into a renderer-independent shared module. Use the same fixed-step rules on clients and server. Build a versioned surface/collision package covering drivable roads, terrain, bridges, stations, walls, and relevant doors, independent of visual meshes and local loading state. Use one world coordinate origin and stable entity IDs. Static environment collision must remain consistent when players are at different stations.

Movement authority cannot rely on a client's selected station, camera, scenery readiness, or reported final position. Validate input values, rate, identity, ownership, and server elapsed simulation time. No simulation or database dependency on every rendered frame. Do not label a client-authoritative position relay as full authority. Shared movement and collision parity in the real city is a release feasibility gate; if the same portable rules and versioned world data cannot drive client prediction and server authority, stop and resolve that design before room UI or release claims.

Local input predicts immediately; server snapshots acknowledge applied inputs; reconciliation restores authoritative simulation state and replays remaining inputs. Small visual corrections decay independently of collision state. The renderer interpolates remote timestamped snapshots and animates wheels/walking locally. Bound extrapolation and replay work; do not indefinitely invent remote motion.

Initial benchmark settings: 30 input/network updates per second and 60 movement substeps per second, rendering independently. Start interpolation near 50–100 ms under healthy conditions and tune from measured jitter and delay. These values are not performance promises.

## Transport and compatibility
Use WebSockets as the initial compatibility baseline and measure a datagram candidate under real network impairment before production selection. Colyseus WebTransport is experimental; explicitly test fallback serialization because unreliable schema fields cannot simply be reused over WebSockets.

Pin compatible published framework packages; verify actual APIs before implementing. Keep the transport adapter separate from gameplay rules so measured changes do not require a second simulation.

## Rendering and recovery
Share cached geometry and textures while keeping actor animation state independent. Preload approved player/fleet models; budget spawning and GPU preparation. Use distance-based detail and adaptive graphics. Keep visual city streaming local; authoritative collision data must cover all occupied areas. Prefetch ahead and stop movement predictably at unavailable required-data boundaries.

On stale input, neutralize walking, throttle, and steering and brake vehicles deliberately. On reconnect, authenticate the reserved identity, restore its Player N assignment, replace the snapshot baseline, increment the connection epoch, and reset input/prediction history. Seat reservations expire; only then may another player receive that Player N seat/name. A reconnecting player cannot reclaim a reassigned vehicle. Revoke removed-player session and reconnect credentials. Anonymous bans cannot establish permanent real-world identity.

Menus and map mode do not pause room time. Backgrounded clients become inactive safely while the server continues. Graceful deployments drain rooms; crashes show an honest session-ended state.

## Implementation boundaries and validation
Work in an isolated checkout reconciled against the current release branch; preserve concurrent changes and local collision repairs. Add multiplayer behind an explicit mode boundary. Maintain existing single-player release loading/cache conventions.

Build a shared movement harness and prove server/client movement and collision parity before integration; then integrate walking and driving into the real city, then complete room UI/lifecycle. Both walking and driving are required for the usable release. Validate automatic seat/name assignment and reuse after expiry, not user-entered names. Validate concurrent vehicle-seat claims, duplicate/reordered inputs, old versions, code validation, permissions, reconnect epochs, and stale controls. Test two, four, and eight clients both gathered and dispersed, multiple occupied rooms, hills/bridges/bays, asset streaming, and joining while others drive.

Network matrix: 40/100/200 ms round-trip delay, 0/20/50 ms jitter, 0/1/3 percent packet loss, bandwidth limits, loss bursts, and one-second outages. Impair the underlying network to expose TCP retransmission, not only application messages. Cover screen lock, host departure, transport fallback, and Wi-Fi/cellular handoff.

Measure frame-time percentiles, stalls, server tick time, snapshot age, correction magnitude/frequency, interpolation underruns, memory, and bandwidth. Compare against current single-player baselines on real Android/iPhone hardware and desktop. A local emulation result cannot prove phone smoothness. Choose supported devices and measurable acceptance thresholds from that baseline; do not claim zero lag. Require no routine teleport corrections during healthy-network reference routes and investigate every repeated mismatch.

Future incidents attach canonical address/world position, assignments, and lifecycle to this same room authority. Do not create another networking system for calls.

## Builder discretion
Exact code layout, hosting vendor, measured region, interpolation method, thresholds, timeout durations, and final transport remain engineering decisions supported by evidence. Report capacity or performance shortfalls before broadening scope. If collision-data extraction cannot preserve current routes, resolve that feasibility issue before adding UI polish.
