# City Explorer multiplayer server

## Runtime

Use Node.js 22 or newer. Install pinned dependencies and run the focused suite from this directory:

```powershell
npm ci --ignore-scripts --no-audit
npm test
```

Production startup requires `EXPLORER_WORLD_CONFIG` to point to an explicit ESM module. That module must export `createExplorerWorld()` and return `{ world, vehicles, spawn }`. Configure multiplayer bay doors fully open in this world config and keep its colliders aligned with the browser visuals; door toggles are disabled for multiplayer. `world` implements the shared `sampleSurface(x, z, referenceY)`, `readyAt(x, z, radius)`, and `blocks(previousPose, nextPose, options)` contract; `vehicles` is the configured list of up to 12 stable instances; `spawn({ seat, playerId })` returns an authored finite pose. A `world.ready` promise is awaited when supplied. Missing configuration or an invalid module prevents startup; there is no fallback map or spawn.

Optional environment settings:

- `HOST` binds the HTTP/WebSocket listener (defaults to `127.0.0.1`).
- `PORT` selects the port (defaults to `2567`).
- `EXPLORER_ALLOWED_ORIGINS` is a comma-separated exact origin allowlist, for example `https://game.example`. Production rejects origins outside this list. Development only accepts localhost/loopback browser origins.
- `NODE_ENV=production` enables production origin rules.

`GET /healthz` reports `ready` only when the configured spawn and required world tiles are ready. It returns 503 while they are unavailable. Tests inject a fixture world directly; that fixture is not a production world configuration.

## HTTP contract

All credentials and room codes are sent in POST JSON bodies. Room codes never appear in URLs or public directory responses.

- `GET /api/directory` returns entries `{ id, name, count, capacity, locked }`. `id` is the opaque Colyseus room ID, independent of the join code.
- `POST /api/rooms` with `{}` returns `{ roomCode, adminCredential, roomId }`.
- `POST /api/join` with `{ "code": "ABCDEFGH" }` returns `{ playerId, seat, name, epoch, playerCredential, reconnectCredential, roomId }`. The room creator binds their seat by including the `adminCredential` returned by room creation in this request body. Other players omit it. A code-only first join cannot claim the creator role.
- `POST /api/rooms/{roomId}/reconnect` with `{ playerId, reconnectCredential }` returns fresh player and reconnect credentials and a new prediction epoch. If the reconnecting seat owns the admin role, the server rotates that credential and privately reissues it to that same player after WebSocket subscription.
- `POST /api/rooms/{roomId}/admin` with `{ credential, command }` accepts `lock`, `unlock`, `rotate`, `kick` (`playerId`), `transfer` (`playerId`), and `close` commands. Explicit admin transfer rotates the credential and sends it only to the target's connected client as an `admin-credential` WebSocket message containing `{ credential, roomCode, locked }`. The current invite code and lock state are sent only to the new admin, including automatic handoff after a leave or expiry. When an admin leaves, is kicked, or expires, the server rotates the credential and privately grants it to an eligible connected successor.
- `POST /api/rooms/{roomId}/leave` with `{ playerCredential }` releases the seat and any vehicle.

## Proxy and IP limits

Join and room-creation limits use the remote socket address. The server does not trust `X-Forwarded-For` and does not enable Express proxy trust. Behind a reverse proxy, configure a trusted ingress that supplies a verified client address through an explicitly trusted proxy setup before relying on per-IP limits; otherwise clients may share the proxy address and consume one common limit. Never accept arbitrary forwarded headers as client identity.

## Colyseus client contract

Create/join via HTTP, then connect with the SDK's `Client`:

```js
const client = new Client(serverUrl);
const room = await client.joinById(roomId, { playerCredential });
room.onMessage('snapshot', onAuthoritativeSnapshot);
room.onMessage('ack', onQueueAcceptance);
room.onMessage('admin-credential', ({ credential, roomCode, locked }) => saveAdminState({ credential, roomCode, locked }));
room.send('subscribe', {});
```

Install message listeners before sending `subscribe`; the server starts snapshots for that client after subscription. Each `snapshot` has `{ protocolVersion, worldVersion, tick, serverTime, epoch, ackInputSequence, player, players, vehicles }`. Every vehicle frame includes `id`, `entityGeneration`, `pose`, `driverPlayerId`, and current `lights`. The initial subscription and explicit/reconnect baseline also include the immutable `templateId`, `tuning`, and `dimensions` catalog. Periodic ticks omit that catalog. The client runtime hydrates compact frames from its bounded catalog before prediction/rendering; consumers use `runtime.latestSnapshot`, not raw wire frames. Each `ack` is immediate `{ ok, error? }` queue acceptance; only the snapshot `ackInputSequence` confirms that an input was simulated. Inputs use the shared `protocolVersion: 2`, current `epoch`, increasing `sequence`, mode, and controls schema:

```js
room.send('input', { input: {
  protocolVersion: 2, epoch, sequence, mode: 'onFoot',
  controls: { forward, strafe, sprint, throttle, steering, viewYaw }
} });
```

`viewYaw` is radians normalized to `[-Math.PI, Math.PI]`. Send at most 60 messages per second. Queue capacity is eight; overflow is rejected without consuming the sequence. The snapshot ackInputSequence advances only when that sequence has actually been simulated. Actions use `room.send('action', { action })` with `{ protocolVersion, epoch, sequence, type, vehicleId, requestId }`; vehicle enter, exit, and switch require the vehicle ID.

Every ownership/mode transition increments the player's `epoch` and `entityGeneration` (and the affected vehicle generation), clears queued old-mode inputs, and resets ACK/sequence to zero. Clients must discard prediction history for the prior epoch and restart input sequencing at 1. Actions from the old epoch are rejected, so old walking controls cannot affect a newly entered vehicle. A reconnect also returns a fresh epoch and credentials.

The server owns simulation. It advances at 30 Hz with two 1/60-second movement-core steps, and publishes validated authoritative snapshots. The first multiplayer release uses fixed-open bay doors; bay-door controls are not part of the command contract.

## Local city launch

From this server directory in PowerShell:

```powershell
$env:EXPLORER_WORLD_CONFIG='./src/world-config.mjs'
node src/index.mjs
```

In another terminal at the repository root, run `node tools/serve-preview.cjs 4188`. Open `http://127.0.0.1:4188/city-explorer/?multiplayerServer=http%3A%2F%2F127.0.0.1%3A2567`. The override only accepts loopback endpoints on loopback pages. Public pages use the configured HTTPS endpoint.

## Deployment constraints

Deploy exactly one Node process/instance initially. Rooms, directory, credentials and ownership are held in process memory; horizontal replicas require shared routing and directory infrastructure that this release does not provide. Restarting or deploying the process ends active rooms. Use a nearby region and an always-running instance for predictable room creation.

Set `NODE_ENV=production`, `HOST=0.0.0.0`, the provider-assigned `PORT`, `EXPLORER_WORLD_CONFIG=./src/world-config.mjs`, and `EXPLORER_ALLOWED_ORIGINS` to the exact frontend origin. The service needs HTTPS/WSS termination and WebSocket upgrade support. Keep credentials and handshake query strings out of access logs. Do not expose this server folder in the static Pages artifact.

The backend checkout needs the complete repository's world data and referenced road tiles. After a road compiler run, run `node tools/normalize-road-gzip.mjs` to keep compressed tile headers identical on Windows and Linux. After release cache normalization or a road/world-source update, run `node tools/export-multiplayer-world.mjs` from the repository root and deploy the frontend and backend from the same final revision. Commit the regenerated world files before publication. Pages regenerates them and fails if they differ from the checked-in world, including on version-only releases. A world-version mismatch intentionally blocks prediction; do not bypass it. GitHub Pages alone cannot run this Node server.

## Render free single-instance blueprint

The repository-root `render.yaml` defines one Node web service on Render's Free plan in Ohio. Keep `rootDir: .`: `src/world-config.mjs` loads the world manifest and binary from `city-explorer/multiplayer/world-data/v1`, road tiles from `city-explorer/data/road-pack`, and vehicle metadata from `city-explorer/assets/vehicles`. Setting the service root to this server subdirectory would omit those repository-relative assets. The build installs the server's pinned lockfile dependencies; the start command runs from this directory so `EXPLORER_WORLD_CONFIG=./src/world-config.mjs` resolves correctly. Render routes HTTP and WebSocket traffic to the `PORT` environment variable; `HOST=0.0.0.0` makes the listener public. `/healthz` is the readiness check and can return 503 until station-one world tiles are loaded.

The Blueprint sets `EXPLORER_ALLOWED_ORIGINS=https://edmondsonedits.github.io`, the origin of the current GitHub Pages site at `/Peterborough-Map-Game/`. If the frontend moves to another origin, update the allowlist to that exact scheme and host (no path; comma-separated only for multiple approved origins). Set up the frontend endpoint and release the matching world/frontend revision before enabling public multiplayer. `autoDeployTrigger: off` prevents a commit from silently deploying only the backend; deploy manually after coordinating the frontend and regenerated world files. Node.js is pinned to 22.22.0 to match the server's Node 22+ engine.

This Free service is for a no-charge trial, not predictable production availability. Before creating it, do not add a payment method to Render and verify the workspace spend limit/billing settings; Render may charge for bandwidth or build usage above included allowances when a payment method and spend allowance permit it, while workspaces without a payment method can have services or builds suspended at limits. Free instances sleep after 15 minutes without HTTP or WebSocket activity, can take about a minute to wake, may restart, and have no persistent disk. Rooms are memory-only and end on restart/sleep, deploy, or instance replacement. Render supports public WebSockets and TLS termination; clients must use `wss` for public connections. For Render's `*.onrender.com` endpoint, the browser transport probes `/healthz` for up to 75 seconds with short retries before its first directory, create, or join request; it shows a waking status and sends each room POST at most once. Other server hosts keep the existing immediate-request behavior.

Two integration limits need resolution or explicit acceptance before a playable release: this server applies per-IP join/create limits using `socket.remoteAddress` and does not trust forwarded headers, so clients behind Render's ingress may share a rate-limit bucket; the existing frontend's normal HTTP request timeout is shorter than a Free cold start, while the new 75-second health warmup covers only the initial health probe. Also, Render Free has 512 MB RAM; a local eight-client benchmark measured about 170 MiB RSS after five seconds, but did not measure peak cache fill, long sessions, or Render itself. This world loader's default cache is 192 road tiles; monitor memory and check provider logs/usage during a controlled trial before increasing player load. Blueprint configuration is not provider-validated until Render CLI/API validation or dashboard creation.

Bandwidth measurements use local eight-client SDK payloads, excluding TLS/TCP overhead and radio conditions. They do not certify physical Android/iPhone frame rate or wide-area latency. Browser rendering, network distance, congestion and background throttling still affect smoothness.
