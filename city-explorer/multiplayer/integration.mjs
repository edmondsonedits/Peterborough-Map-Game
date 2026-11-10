import { createRoomUi } from './room-ui.mjs?v=1.6.202';
import { createClientRuntime } from './client-runtime.mjs?v=1.6.202';
import { createColyseusTransport } from './transport-colyseus.mjs?v=1.6.202';
import { loadWorldCollision } from './world-collision.mjs?v=1.6.202';

const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
export function resolveMultiplayerServerUrl(pageUrl, configuredUrl, queryValue) {
  const page = new URL(pageUrl);
  const candidate = loopback(page.hostname) && queryValue ? queryValue : configuredUrl;
  if (!candidate) return null;
  const server = new URL(candidate, page);
  if (!['http:', 'https:'].includes(server.protocol)) throw new Error('Multiplayer endpoint must use HTTP or HTTPS');
  if (queryValue && candidate === queryValue && !loopback(server.hostname)) throw new Error('Local multiplayer override must use a loopback server');
  if (!loopback(page.hostname) && server.protocol !== 'https:') throw new Error('Public multiplayer endpoint must use HTTPS');
  return server.href;
}

export function createMultiplayerIntegration({ parent, pageUrl = location.href, configuredUrl = null, roadPackId, onEnter = () => {}, onLeave = () => {}, onMessage = () => {}, factories = {} }) {
  const query = new URL(pageUrl).searchParams.get('multiplayerServer');
  let serverUrl = null, endpointError = null;
  try { serverUrl = resolveMultiplayerServerUrl(pageUrl, configuredUrl, query); } catch (error) { endpointError = error.message; }
  let world = null, transport = null, runtime = null, session = null, entered = false, entering = null, disposed = false, generation = 0, roomPanelGeneration = 0, connectionStatus = 'offline', lastViewSignature = '';
  // One owner creates the world/transport/runtime. Leave retires that owner,
  // even if its asynchronous load or room request has not finished yet.
  let initialization = null;
  const view = { available: Boolean(serverUrl), message: endpointError ?? (serverUrl ? '' : 'Multiplayer server is not configured yet.'), rooms: [], session: null, players: [], vehicles: [], connectionStatus };
  const ui = (factories.createRoomUi ?? createRoomUi)({ parent, callbacks: { listRooms, createRoom, joinRoom, leaveRoom, admin, selectVehicle, toggleAerial }, onOpenChange: open => {
    if (!open) { roomPanelGeneration++; transport?.cancelWarmup?.(); update({ message: '' }); return; }
    const openGeneration = roomPanelGeneration, requestGeneration = generation;
    if (serverUrl && !session) void listRooms().then(rooms => { if (!disposed && requestGeneration === generation && openGeneration === roomPanelGeneration) update({ rooms }); }).catch(error => { if (!disposed && requestGeneration === generation && openGeneration === roomPanelGeneration) update({ message: error.message }); });
  } });
  function update(next) { Object.assign(view, next); ui.update(next); }
  function releaseLocal(message = '', { deferDisposal = false } = {}) {
    generation++;
    initialization = null;
    const oldRuntime = runtime, oldTransport = transport;
    runtime = null; transport = null; session = null; entered = false; entering = null; lastViewSignature = ''; connectionStatus = 'offline';
    if (!deferDisposal) { if (oldRuntime) oldRuntime.dispose(); else oldTransport?.dispose(); }
    onLeave();
    update({ session: null, players: [], vehicles: [], connectionStatus, message });
    return { oldRuntime, oldTransport };
  }
  function activate() {
    if (entered || entering || !session || !runtime?.latestSnapshot) return entering;
    const activationGeneration = generation;
    const task = Promise.resolve().then(() => onEnter({ isCurrent: () => !disposed && generation === activationGeneration && Boolean(session) }))
      .then(() => { if (!disposed && generation === activationGeneration && session) entered = true; })
      .catch(error => { if (disposed || generation !== activationGeneration) return; onMessage(error.message); return leaveRoom(); })
      .finally(() => { if (entering === task) entering = null; });
    entering = task;
    return entering;
  }
  async function ensureWorld(requestGeneration) {
    if (world) return world;
    if (!roadPackId()) throw new Error('The current map needs the packed road update before multiplayer can start.');
    const loaded = await (factories.loadWorldCollision ?? loadWorldCollision)({ manifestUrl: new URL('./world-data/v1/world-manifest.json', import.meta.url), maxCachedTiles: 48 });
    if (loaded.manifest.roadPack.buildId !== roadPackId()) throw new Error('The current map and multiplayer world differ. Reload the map.');
    if (!disposed && requestGeneration === generation) world = loaded;
    return loaded;
  }
  function ensureTransport() {
    if (disposed) return Promise.resolve(null);
    if (!serverUrl) return Promise.reject(new Error(view.message || 'Multiplayer server is unavailable'));
    if (transport) return Promise.resolve(transport);
    if (initialization) return initialization;
    const requestGeneration = generation;
    const task = (async () => {
      const loaded = await ensureWorld(requestGeneration);
      if (disposed || requestGeneration !== generation) return null;
      const activeTransport = (factories.createTransport ?? createColyseusTransport)({ serverUrl,
        onStatus: detail => { if (transport !== activeTransport) return; connectionStatus = detail.status; session = transport.getSession() ?? session; const message = detail.status === 'waking' ? 'Starting multiplayer server… This can take about a minute.' : ['server-ready', 'cancelled'].includes(detail.status) ? '' : undefined; update({ connectionStatus, session: session ? { ...session, connectionStatus } : null, ...(typeof detail.locked === 'boolean' ? { locked: detail.locked } : {}), ...(message === undefined ? {} : { message }) }); },
        onDisconnect: detail => { if (detail.reconnecting || transport !== activeTransport) return; releaseLocal('Connection ended. Join a room to continue.'); onMessage('Multiplayer connection ended.'); },
      });
      transport = activeTransport;
      try {
        runtime = (factories.createRuntime ?? createClientRuntime)({ transport, world: loaded, worldVersion: loaded.worldVersion,
          onState: state => {
            if (transport !== activeTransport || !state.snapshot) return;
            if (!entered && session) void activate();
            const players = [state.snapshot.player, ...state.snapshot.players].map(player => ({ ...player, playerId: player.id,
              seat: Number(player.name?.match(/^Player ([1-8])$/)?.[1]) || null,
              isAdmin: player.id === session?.playerId && Boolean(session?.isAdmin) }));
            const vehicles = state.snapshot.vehicles.map(vehicle => ({
              id: vehicle.id,
              label: vehicle.id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              available: vehicle.occupantCount === undefined
                ? !vehicle.driverPlayerId || vehicle.driverPlayerId === state.snapshot.player.id
                : vehicle.occupantCount < 4 || vehicle.id === state.vehicleId,
              occupantCount: vehicle.occupantCount,
              aerialPhase: vehicle.driverPlayerId === state.snapshot.player.id ? vehicle.aerial?.phase : undefined,
              occupiedByOther: Boolean(vehicle.driverPlayerId && vehicle.driverPlayerId !== state.snapshot.player.id),
            }));
            const signature = JSON.stringify([players.map(player => [player.id, player.entityGeneration]), vehicles, session?.isAdmin, state.mode, state.vehicleId]);
            if (signature !== lastViewSignature) { lastViewSignature = signature; update({ players, vehicles, session: session ? { ...session, vehicleId: state.vehicleId, connectionStatus } : null, selectedVehicleId: state.vehicleId }); }
          },
          onEvent: event => {
            if (transport !== activeTransport) return;
            if (event.type === 'world-version-mismatch') onMessage('Multiplayer world version differs from this map. Reload the page.');
            if (event.type === 'protocol-version-mismatch') onMessage('Multiplayer protocol differs from this client. Reload the page.');
            if (event.type === 'action-result' && event.ok === false) {
              const reason = event.error || event.reason;
              const explanations = {
                'target-world-unready': 'The road near that vehicle is loading. Try again in a moment.',
                'vehicle-occupied': 'All four seats in that vehicle are occupied.',
                'stale-epoch-or-sequence': 'Your vehicle state changed. Try again.',
                'vehicle-out-of-range-or-moving': 'Move closer and wait for the vehicle to stop.',
              };
              const message = explanations[reason] ?? `Action unavailable: ${reason || 'server rejected it'}`;
              onMessage(message); update({ message });
            }
          },
        });
      } catch (error) {
        transport = null;
        activeTransport.dispose();
        throw error;
      }
      return activeTransport;
    })().finally(() => { if (initialization === task) initialization = null; });
    initialization = task;
    return task;
  }
  async function listRooms() {
    if (!serverUrl) return [];
    const openGeneration = roomPanelGeneration, requestGeneration = generation;
    const active = await ensureTransport();
    if (disposed || requestGeneration !== generation || openGeneration !== roomPanelGeneration) return [];
    const response = await active.directory();
    if (disposed || requestGeneration !== generation || openGeneration !== roomPanelGeneration) return [];
    const rooms = Array.isArray(response) ? response : response.rooms ?? [];
    const current = rooms.find(room => room.id === session?.roomId);
    update({ rooms, ...(current ? { locked: Boolean(current.locked) } : {}) });
    return rooms;
  }
  async function join(create, args) {
    const requestGeneration = generation, openGeneration = roomPanelGeneration;
    const isCurrent = () => !disposed && requestGeneration === generation && openGeneration === roomPanelGeneration;
    const cancelled = () => ({ cancelled: true, message: 'Room request cancelled.' });
    try {
      const active = await ensureTransport();
      if (!isCurrent()) return cancelled();
      await world.prefetch(world.stations[0].anchor.x, world.stations[0].anchor.z, 160);
      if (!isCurrent()) return cancelled();
      const joined = create ? await active.createRoom() : await active.joinRoom(args.code, args.roomId);
      if (!isCurrent()) {
        if (active.getSession()?.playerId === joined?.playerId) await active.leave().catch(() => {});
        return cancelled();
      }
      session = joined;
    } catch(error) {
      if (!isCurrent()) return cancelled();
      session=null;update({session:null,connectionStatus:'error',message:error.message});throw error;
    }
    update({ session: { ...session, connectionStatus }, locked: false, message: '' });
    if (runtime.latestSnapshot && !entered) await activate();
    return isCurrent() ? session : cancelled();
  }
  function createRoom() { return join(true); }
  function joinRoom(args) { return join(false, args); }
  async function leaveRoom() {
    const leaving = transport;
    const pending = leaving?.leave();
    // Keep the socket alive until HTTP leave has authenticated; closing it first revokes the player credential.
    const { oldRuntime } = releaseLocal('', { deferDisposal: true });
    try { await pending; return { ok: true }; }
    catch (error) { const message = `Left multiplayer locally; server leave failed: ${error.message}`; onMessage(message); return { error: true, message }; }
    finally { if (oldRuntime) oldRuntime.dispose(); else leaving?.dispose(); }
  }
  async function admin(command) { if (!transport || !session) throw new Error('Join a room first'); const active = transport, roomId = session.roomId; const result = await active.admin(command); if (transport !== active || session?.roomId !== roomId) return result; session = active.getSession(); update({ session: { ...session, ...(result.roomCode ? { roomCode: result.roomCode } : {}), connectionStatus }, ...(typeof result.locked === 'boolean' ? { locked: result.locked } : {}) }); return result; }
  function selectVehicle({ vehicleId }) {
    const snapshot = runtime?.latestSnapshot;
    if (!session || !snapshot) return { error: true, message: 'Join a room before selecting a vehicle.' };
    const target = snapshot.vehicles.find(vehicle => vehicle.id === vehicleId);
    if (!target) return { error: true, message: 'That vehicle is no longer available.' };
    if (target.occupantCount >= 4) return { error: true, message: 'All four seats are occupied.' };
    if (runtime.getState().vehicleId === vehicleId) return { error: true, message: 'You are already in that vehicle.' };
    return sendAction({ type: 'selectVehicle', vehicleId }) || { error: true, message: 'Vehicle request could not be sent.' };
  }
  function toggleAerial() {
    const snapshot = runtime?.latestSnapshot;
    const vehicle = snapshot?.vehicles.find(item => item.id === snapshot.player.vehicleId);
    if (!vehicle?.aerial || vehicle.driverPlayerId !== snapshot.player.id) return { error: true, message: 'Take the aerial driver seat first.' };
    return sendAction({ type: vehicle.aerial.phase === 'travel' ? 'deployAerial' : 'stowAerial', vehicleId: vehicle.id });
  }
  function sendAction(action) { if (!runtime || !session) return false; return runtime.sendAction(action); }
  function frame(deltaMs, controls) { if (!entered || !runtime) return null; return runtime.advanceFrame(deltaMs, controls); }
  function dispose() { if (disposed) return; disposed = true; releaseLocal(); ui.dispose(); }
  update(view);
  return { ui, frame, sendAction, leaveRoom, dispose, get active() { return entered && Boolean(runtime?.latestSnapshot); }, get runtime() { return runtime; }, get world() { return world; }, get session() { return session; }, get serverUrl() { return serverUrl; } };
}
