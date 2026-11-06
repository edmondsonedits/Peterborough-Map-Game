import { createRoomUi } from './room-ui.mjs?v=1.6.190';
import { createClientRuntime } from './client-runtime.mjs?v=1.6.190';
import { createColyseusTransport } from './transport-colyseus.mjs?v=1.6.190';
import { loadWorldCollision } from './world-collision.mjs?v=1.6.190';

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
  const view = { available: Boolean(serverUrl), message: endpointError ?? (serverUrl ? '' : 'Multiplayer server is not configured yet.'), rooms: [], session: null, players: [], vehicles: [], connectionStatus };
  const ui = (factories.createRoomUi ?? createRoomUi)({ parent, callbacks: { listRooms, createRoom, joinRoom, leaveRoom, admin, selectVehicle }, onOpenChange: open => {
    if (!open) { roomPanelGeneration++; transport?.cancelWarmup?.(); update({ message: '' }); return; }
    const openGeneration = roomPanelGeneration;
    if (serverUrl && !session) void listRooms().then(rooms => { if (!disposed && openGeneration === roomPanelGeneration) update({ rooms }); }).catch(error => { if (!disposed && openGeneration === roomPanelGeneration) update({ message: error.message }); });
  } });
  const placement = parent.ownerDocument.createElement('style');
  placement.textContent = '@media (min-width:541px){.ce-roomui{left:160px;top:80px}}@media (max-width:540px){.ce-roomui{left:max(10px,env(safe-area-inset-left));top:max(100px,env(safe-area-inset-top))}}';
  parent.append(placement);
  function update(next) { Object.assign(view, next); ui.update(next); }
  function releaseLocal(message = '', { deferDisposal = false } = {}) {
    generation++;
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
  async function ensureWorld() {
    if (world) return world;
    if (!roadPackId()) throw new Error('The current map needs the packed road update before multiplayer can start.');
    const loaded = await (factories.loadWorldCollision ?? loadWorldCollision)({ manifestUrl: new URL('./world-data/v1/world-manifest.json', import.meta.url), maxCachedTiles: 48 });
    if (loaded.manifest.roadPack.buildId !== roadPackId()) throw new Error('The current map and multiplayer world differ. Reload the map.');
    world = loaded;
    return world;
  }
  async function ensureTransport() {
    if (!serverUrl) throw new Error(view.message || 'Multiplayer server is unavailable');
    if (transport) return transport;
    const loaded = await ensureWorld();
    const activeTransport = (factories.createTransport ?? createColyseusTransport)({ serverUrl,
      onStatus: detail => { if (transport !== activeTransport) return; connectionStatus = detail.status; session = transport.getSession() ?? session; const message = detail.status === 'waking' ? 'Starting multiplayer server… This can take about a minute.' : ['server-ready', 'cancelled'].includes(detail.status) ? '' : undefined; update({ connectionStatus, session: session ? { ...session, connectionStatus } : null, ...(typeof detail.locked === 'boolean' ? { locked: detail.locked } : {}), ...(message === undefined ? {} : { message }) }); },
      onDisconnect: detail => { if (detail.reconnecting || transport !== activeTransport) return; releaseLocal('Connection ended. Join a room to continue.'); onMessage('Multiplayer connection ended.'); },
    });
    transport = activeTransport;
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
          available: !vehicle.driverPlayerId || vehicle.driverPlayerId === state.snapshot.player.id,
          occupiedByOther: Boolean(vehicle.driverPlayerId && vehicle.driverPlayerId !== state.snapshot.player.id),
        }));
        const signature = JSON.stringify([players.map(player => [player.id, player.entityGeneration]), vehicles.map(vehicle => [vehicle.id, vehicle.available]), session?.isAdmin, state.mode, state.vehicleId]);
        if (signature !== lastViewSignature) { lastViewSignature = signature; update({ players, vehicles, session: session ? { ...session, vehicleId: state.vehicleId, connectionStatus } : null, selectedVehicleId: state.vehicleId }); }
      },
      onEvent: event => {
        if (transport !== activeTransport) return;
        if (event.type === 'world-version-mismatch') onMessage('Multiplayer world version differs from this map. Reload the page.');
        if (event.type === 'action-result' && event.ok === false) {
          const message = `Action unavailable: ${event.reason || 'server rejected it'}`;
          onMessage(message); update({ message });
        }
      },
    });
    return transport;
  }
  async function listRooms() {
    if (!serverUrl) return [];
    const openGeneration = roomPanelGeneration;
    const active = await ensureTransport();
    if (disposed || openGeneration !== roomPanelGeneration) return [];
    const response = await active.directory();
    if (disposed || openGeneration !== roomPanelGeneration) return [];
    const rooms = Array.isArray(response) ? response : response.rooms ?? [];
    const current = rooms.find(room => room.id === session?.roomId);
    update({ rooms, ...(current ? { locked: Boolean(current.locked) } : {}) });
    return rooms;
  }
  async function join(create, args) {
    const requestGeneration = roomPanelGeneration;
    const active = await ensureTransport();
    if (disposed || requestGeneration !== roomPanelGeneration) return { cancelled: true, message: 'Room request cancelled.' };
    await world.prefetch(world.stations[0].anchor.x, world.stations[0].anchor.z, 160);
    if (disposed || requestGeneration !== roomPanelGeneration) return { cancelled: true, message: 'Room request cancelled.' };
    try {
      const joined = create ? await active.createRoom() : await active.joinRoom(args.code, args.roomId);
      if (disposed || requestGeneration !== roomPanelGeneration) {
        if (active.getSession()?.playerId === joined?.playerId) await active.leave().catch(() => {});
        return { cancelled: true, message: 'Room request cancelled.' };
      }
      session = joined;
    } catch(error) {
      if (disposed || requestGeneration !== roomPanelGeneration) return { cancelled: true, message: 'Room request cancelled.' };
      session=null;update({session:null,connectionStatus:'error',message:error.message});throw error;
    }
    update({ session: { ...session, connectionStatus }, locked: false, message: '' });
    if (runtime.latestSnapshot && !entered) await activate();
    return session;
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
    if (target.driverPlayerId && target.driverPlayerId !== snapshot.player.id) return { error: true, message: 'That vehicle already has a driver.' };
    if (runtime.getState().vehicleId === vehicleId) return { error: true, message: 'You are already driving that vehicle.' };
    return sendAction({ type: 'selectVehicle', vehicleId }) || { error: true, message: 'Vehicle request could not be sent.' };
  }
  function sendAction(action) { if (!runtime || !session) return false; return runtime.sendAction(action); }
  function frame(deltaMs, controls) { if (!entered || !runtime) return null; return runtime.advanceFrame(deltaMs, controls); }
  function dispose() { if (disposed) return; disposed = true; releaseLocal(); ui.dispose(); placement.remove(); }
  update(view);
  return { ui, frame, sendAction, leaveRoom, dispose, get active() { return entered && Boolean(runtime?.latestSnapshot); }, get runtime() { return runtime; }, get world() { return world; }, get session() { return session; }, get serverUrl() { return serverUrl; } };
}
