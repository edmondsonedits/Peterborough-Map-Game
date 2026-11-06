export function createRoomUi({ parent = document.body, callbacks = {}, onOpenChange = () => {} } = {}) {
  const doc = parent.ownerDocument || document;
  const win = doc.defaultView || window;
  const noop = () => {};
  const call = (name, args) => typeof callbacks[name] === 'function' ? (args === undefined ? callbacks[name]() : callbacks[name](args)) : undefined;
  let state = {};
  let isOpen = false;
  let disposed = false;
  let requestId = 0;
  let activeRequest = '';

  const style = doc.createElement('style');
  style.dataset.roomUiStyle = 'true';
  style.textContent = `
    .ce-roomui { --rui-ink:#edf3ee; --rui-muted:#aab6af; --rui-gold:#edd48d; --rui-line:rgba(200,172,102,.42); --rui-surface:rgba(5,17,24,.96); --rui-shadow:0 14px 42px rgba(0,0,0,.42); color:var(--rui-ink); font:500 14px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; position:fixed; z-index:30; left:max(12px,env(safe-area-inset-left)); top:max(12px,env(safe-area-inset-top)); width:min(310px,calc(100vw - 24px)); pointer-events:none; }
    .ce-roomui * { box-sizing:border-box; }
    .ce-roomui button,.ce-roomui input,.ce-roomui select { font:inherit; }
    .ce-roomui-toggle { pointer-events:auto; display:flex; align-items:center; gap:9px; min-height:46px; padding:0 14px; color:var(--rui-ink); background:rgba(5,17,24,.9); border:1px solid var(--rui-line); border-radius:6px; box-shadow:var(--rui-shadow); font-weight:750; letter-spacing:.04em; cursor:pointer; backdrop-filter:blur(8px); }
    .ce-roomui-toggle:hover,.ce-roomui-toggle:focus-visible { border-color:var(--rui-gold); outline:2px solid transparent; color:var(--rui-gold); }
    .ce-roomui-panel { pointer-events:auto; margin-top:9px; max-height:min(68vh,580px); max-height:min(var(--rui-available-height,68vh),580px); overflow:auto; overscroll-behavior:contain; padding:14px; border:1px solid var(--rui-line); border-radius:8px; background:var(--rui-surface); box-shadow:var(--rui-shadow); backdrop-filter:blur(12px); }
    .ce-roomui-panel[hidden] { display:none; }
    .ce-roomui-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:12px; }
    .ce-roomui-eyebrow { margin:0 0 3px; color:var(--rui-gold); font-size:10px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    .ce-roomui-title { margin:0; color:#f4f6f1; font-size:16px; line-height:1.2; }
    .ce-roomui-close { flex:none; width:44px; height:44px; margin:-7px -7px 0 0; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--rui-muted); font-size:22px; line-height:1; cursor:pointer; }
    .ce-roomui-close:hover,.ce-roomui-close:focus-visible { border-color:var(--rui-line); color:var(--rui-gold); outline:none; }
    .ce-roomui-section { border-top:1px solid rgba(200,172,102,.18); padding-top:12px; margin-top:12px; }
    .ce-roomui-label { display:block; margin:0 0 6px; color:#d5ddd7; font-size:12px; font-weight:700; }
    .ce-roomui-copy { margin:0 0 10px; color:var(--rui-muted); font-size:12px; }
    .ce-roomui-row { display:flex; gap:8px; align-items:stretch; }
    .ce-roomui-input,.ce-roomui-select { min-width:0; width:100%; min-height:46px; padding:0 11px; color:var(--rui-ink); border:1px solid rgba(141,170,150,.36); border-radius:5px; background:#091820; }
    .ce-roomui-input:focus,.ce-roomui-select:focus { border-color:var(--rui-gold); outline:2px solid rgba(237,212,141,.24); outline-offset:1px; }
    .ce-roomui-btn { min-height:46px; padding:0 12px; border:1px solid var(--rui-line); border-radius:5px; color:var(--rui-ink); background:rgba(23,38,42,.9); font-weight:750; cursor:pointer; touch-action:manipulation; }
    .ce-roomui-btn:hover,.ce-roomui-btn:focus-visible { border-color:var(--rui-gold); color:var(--rui-gold); outline:2px solid rgba(237,212,141,.22); outline-offset:1px; }
    .ce-roomui-btn--primary { color:#101910; border-color:#c8ac66; background:#d8bd77; }
    .ce-roomui-btn--primary:hover,.ce-roomui-btn--primary:focus-visible { color:#07131b; background:#f0d990; }
    .ce-roomui-btn--danger { border-color:rgba(221,125,106,.5); color:#ffd2c8; }
    .ce-roomui-btn[disabled] { opacity:.58; cursor:wait; }
    .ce-roomui-status { min-height:18px; margin:8px 0 0; color:var(--rui-muted); font-size:12px; }
    .ce-roomui-status[data-error="true"] { color:#ffb8a8; }
    .ce-roomui-list { display:grid; gap:7px; margin:0; padding:0; list-style:none; }
    .ce-roomui-room { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 0; border-bottom:1px solid rgba(200,172,102,.14); }
    .ce-roomui-room:last-child { border-bottom:0; }
    .ce-roomui-room-name { min-width:0; overflow-wrap:anywhere; color:#e6ece8; font-size:13px; font-weight:700; }
    .ce-roomui-room-meta { display:block; color:var(--rui-muted); font-size:11px; font-weight:500; }
    .ce-roomui-room .ce-roomui-btn { flex:none; min-width:68px; }
    .ce-roomui-player { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:36px; padding:6px 0; border-bottom:1px solid rgba(200,172,102,.12); font-size:13px; }
    .ce-roomui-player:last-child { border-bottom:0; }
    .ce-roomui-player-empty { color:var(--rui-muted); }
    .ce-roomui-player-note { color:var(--rui-muted); font-size:11px; }
    .ce-roomui-badge { color:var(--rui-gold); font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
    .ce-roomui-invite { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
    .ce-roomui-admin { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    .ce-roomui-admin .ce-roomui-btn { padding:0 7px; }
    .ce-roomui-transfer-target { grid-column:1 / -1; display:grid; gap:6px; }
    .ce-roomui-busy { opacity:.8; }
    @media (max-width:540px) { .ce-roomui { width:min(310px,calc(100vw - 20px)); left:max(10px,env(safe-area-inset-left)); top:max(10px,env(safe-area-inset-top)); } .ce-roomui-panel { max-height:min(var(--rui-available-height,65vh),520px); padding:12px; } }
    @media (max-height:440px) and (orientation:landscape) { .ce-roomui { top:max(6px,env(safe-area-inset-top)); } .ce-roomui-toggle { min-height:44px; } .ce-roomui-panel { margin-top:5px; max-height:var(--rui-available-height,calc(100dvh - 58px)); padding:10px; } .ce-roomui-head { margin-bottom:7px; } .ce-roomui-section { margin-top:8px; padding-top:8px; } }
    @media (prefers-reduced-motion:reduce) { .ce-roomui *, .ce-roomui *::before, .ce-roomui *::after { scroll-behavior:auto!important; transition:none!important; animation:none!important; } }
  `;
  const root = doc.createElement('div');
  root.className = 'ce-roomui';
  root.innerHTML = `
    <button class="ce-roomui-toggle" type="button" aria-expanded="false" aria-controls="ce-roomui-panel"><span aria-hidden="true">◉</span><span>Multiplayer</span><span class="ce-roomui-toggle-count"></span></button>
    <section class="ce-roomui-panel" id="ce-roomui-panel" aria-label="Multiplayer rooms" hidden>
      <header class="ce-roomui-head"><div><p class="ce-roomui-eyebrow">City Explorer</p><h2 class="ce-roomui-title">Multiplayer</h2></div><button type="button" class="ce-roomui-close" aria-label="Close multiplayer panel">×</button></header>
      <p class="ce-roomui-status" role="status" aria-live="polite"></p>
      <div class="ce-roomui-content"></div>
    </section>`;
  parent.append(style, root);
  const toggle = root.querySelector('.ce-roomui-toggle');
  const panel = root.querySelector('.ce-roomui-panel');
  const content = root.querySelector('.ce-roomui-content');
  const status = root.querySelector('.ce-roomui-status');
  const count = root.querySelector('.ce-roomui-toggle-count');
  const closeButton = root.querySelector('.ce-roomui-close');
  let roomNodes = [];
  let view = '';
  let sessionView = null;
  let focusBeforeOpen = null;

  function el(tag, cls, value, attrs = {}) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'type' || key === 'name' || key === 'value' || key === 'placeholder' || key === 'autocomplete' || key === 'inputmode') node.setAttribute(key, val);
      else if (key === 'disabled' || key === 'readOnly') node[key] = Boolean(val);
    }
    return node;
  }
  function button(label, action, cls = 'ce-roomui-btn', handler = noop) {
    const b = el('button', cls, label, { type: 'button' });
    b.addEventListener('click', handler);
    b.dataset.action = action;
    return b;
  }
  function heading(text) { return el('h3', 'ce-roomui-label', text); }
  function section(title) { const s = el('section', 'ce-roomui-section'); if (title) s.append(heading(title)); return s; }
  function updateStatus(message = '', isError = false) { status.textContent = message; status.dataset.error = isError ? 'true' : 'false'; }
  function setBusy(flag) { root.classList.toggle('ce-roomui-busy', Boolean(flag)); root.querySelectorAll('[data-request]').forEach((item) => { item.disabled = Boolean(flag); }); }
  function current(request) { return !disposed && request === requestId; }
  function updatePendingStatus() {
    if (!activeRequest) return false;
    if (typeof state.message === 'string' && state.message.startsWith('Starting multiplayer server')) updateStatus(state.message);
    else if (status.textContent.startsWith('Starting multiplayer server')) updateStatus('Connecting…');
    return true;
  }
  async function run(name, args, successMessage = '') {
    const id = ++requestId;
    activeRequest = name;
    setBusy(true);
    updateStatus('Connecting…');
    try {
      const result = await call(name, args);
      if (!current(id)) return result;
      activeRequest = ''; setBusy(false);
      if (result && result.error) updateStatus(result.message || 'That action could not be completed.', true);
      else updateStatus((result && result.message) || successMessage);
      return result;
    } catch (error) {
      if (current(id)) { activeRequest = ''; setBusy(false); updateStatus(error?.message || 'Connection failed. Try again.', true); }
      return null;
    }
  }
  function applyViewport() {
    if (disposed) return;
    const vv = win.visualViewport;
    const height = vv?.height || win.innerHeight || 640;
    const top = vv?.offsetTop || 0;
    const available = Math.max(130, height - top - (parseFloat(win.getComputedStyle(root).top) || 10) - 62);
    root.style.setProperty('--rui-available-height', `${available}px`);
    if (isOpen && doc.activeElement?.matches('.ce-roomui-input,.ce-roomui-select')) {
      const active = doc.activeElement;
      win.requestAnimationFrame?.(() => active.scrollIntoView?.({ block: 'nearest' }));
    }
  }
  function onEscape(event) { if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); close(); } }
  function onPanelClick(event) { event.stopPropagation(); }
  function onOpenChangeCall() { try { onOpenChange(isOpen); } catch {} }
  function open() {
    if (disposed || isOpen) return;
    isOpen = true; focusBeforeOpen = doc.activeElement; panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    onOpenChangeCall(); applyViewport();
    const target = root.querySelector('input:not([disabled]),button:not(.ce-roomui-toggle):not([disabled])');
    if (target) target.focus({ preventScroll: true });
  }
  function close() {
    if (disposed || !isOpen) return;
    isOpen = false; panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
    ++requestId; activeRequest = ''; setBusy(false); updateStatus('');
    onOpenChangeCall();
    const target = focusBeforeOpen && focusBeforeOpen !== doc.body && focusBeforeOpen !== doc.documentElement && focusBeforeOpen.isConnected ? focusBeforeOpen : toggle;
    target.focus?.({ preventScroll: true });
  }
  function buildLobby() {
    const fragment = doc.createDocumentFragment();
    const intro = el('p', 'ce-roomui-copy', 'Join a public room with its private code, or start a new drive.');
    fragment.append(intro);
    const create = section('Start a room');
    const createButton = button('Create room', 'create', 'ce-roomui-btn ce-roomui-btn--primary', () => run('createRoom', undefined, 'Room created.'));
    createButton.dataset.request = 'true'; create.append(createButton);
    fragment.append(create);
    const join = section('Join by code');
    const label = el('label', 'ce-roomui-label', 'Private room code');
    label.htmlFor = 'ce-roomui-join-code';
    const row = el('div', 'ce-roomui-row');
    const input = el('input', 'ce-roomui-input', undefined, { type: 'text', name: 'code', autocomplete: 'off', placeholder: 'Enter room code' });
    input.id = 'ce-roomui-join-code'; input.maxLength = 32; input.autocapitalize = 'characters'; input.spellcheck = false;
    input.addEventListener('input', () => { input.value = input.value.replace(/[^a-z0-9-]/gi, '').toUpperCase(); });
    const joinButton = button('Join', 'join', 'ce-roomui-btn ce-roomui-btn--primary', () => {
      const code = input.value.trim();
      if (!code) { updateStatus('Enter a room code to join.', true); input.focus(); return; }
      run('joinRoom', { code, ...(input.dataset.roomId ? { roomId: input.dataset.roomId } : {}) }, 'Joining room…');
    });
    joinButton.dataset.request = 'true'; row.append(input, joinButton); join.append(label, row); fragment.append(join);
    const directory = section('Public rooms');
    const refresh = button('Refresh', 'refresh', 'ce-roomui-btn', () => run('listRooms', undefined, 'Room list updated.'));
    refresh.dataset.request = 'true';
    const dirHead = el('div', 'ce-roomui-row'); dirHead.append(el('p', 'ce-roomui-copy', 'Room names and open seats are public.'), refresh); directory.append(dirHead);
    const list = el('ul', 'ce-roomui-list'); list.dataset.roomList = 'true'; directory.append(list); fragment.append(directory);
    content.replaceChildren(fragment); roomNodes = [...content.querySelectorAll('[data-room-list]')]; view = 'lobby';
  }
  function updateLobbyDirectory(rooms) {
    const list = content.querySelector('[data-room-list]');
    if (!list) return;
    const safeRooms = Array.isArray(rooms) ? rooms.filter((room) => room?.public !== false && room?.isPublic !== false).slice(0, 50) : [];
    const nodes = safeRooms.map((room) => {
      const li = el('li', 'ce-roomui-room');
      const info = el('div');
      info.append(el('span', 'ce-roomui-room-name', room?.name || 'Public room'));
      const capacity = Math.max(1, Math.min(8, Number(room?.capacity) || 8));
      const occupied = Math.max(0, Math.min(capacity, Number(room?.count) || 0));
      info.append(el('span', 'ce-roomui-room-meta', `${occupied} of ${capacity} players${room?.locked ? ' · Code required' : ' · Code required'}`));
      const b = button('Enter code', 'room-join', 'ce-roomui-btn', () => {
        const input = content.querySelector('#ce-roomui-join-code');
        if (input) { input.dataset.roomId = String(room?.id || ''); input.focus(); updateStatus('Enter the private code for this room.'); }
      });
      b.setAttribute('aria-label', `Enter code for ${room?.name || 'public room'}`);
      li.append(info, b); return li;
    });
    if (!nodes.length) nodes.push(el('li', 'ce-roomui-copy', state.roomsLoading ? 'Finding public rooms…' : 'No public rooms are open right now.'));
    list.replaceChildren(...nodes);
  }
  function sessionKey(session) { return `${session?.roomId || ''}|${session?.playerId || ''}|${session?.epoch ?? ''}`; }
  function buildSession(session) {
    const fragment = doc.createDocumentFragment();
    const card = section('Your room');
    const yourLine = el('p', 'ce-roomui-copy'); yourLine.dataset.sessionStatus = 'true';
    const list = el('ul', 'ce-roomui-list'); list.dataset.playerList = 'true';
    card.append(yourLine, list); fragment.append(card);

    const invite = section('Private invite code'); invite.dataset.invite = 'true';
    const inviteRow = el('div', 'ce-roomui-invite');
    const inviteInput = el('input', 'ce-roomui-input', undefined, { type: 'text', name: 'invite-code', readOnly: true });
    inviteInput.setAttribute('aria-label', 'Private invite code');
    const copy = button('Copy', 'copy-code', 'ce-roomui-btn', async () => {
      try {
        if (typeof win.navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
        await win.navigator.clipboard.writeText(inviteInput.value); updateStatus('Invite code copied.');
      } catch { inviteInput.focus(); inviteInput.select(); updateStatus('Code selected. Copy it to share privately.'); }
    });
    inviteRow.append(inviteInput, copy); invite.append(inviteRow); fragment.append(invite);

    const vehicleSection = section('Vehicle'); vehicleSection.dataset.vehicleSection = 'true';
    const vehicleSelect = el('select', 'ce-roomui-select', undefined, { name: 'vehicle' });
    vehicleSelect.setAttribute('aria-label', 'Choose a vehicle');
    vehicleSelect.addEventListener('change', () => {
      if (vehicleSelect.value) void run('selectVehicle', { vehicleId: vehicleSelect.value }, 'Vehicle request sent…');
    });
    vehicleSection.append(el('p', 'ce-roomui-copy', 'Choose an available vehicle to enter it anywhere on the map.'), vehicleSelect);
    fragment.append(vehicleSection);

    const admin = section('Host controls'); admin.dataset.adminSection = 'true';
    const grid = el('div', 'ce-roomui-admin');
    const lock = button('Lock room', 'admin-lock', 'ce-roomui-btn', () => run('admin', { type: lock.dataset.lockType }));
    const rotate = button('Rotate code', 'admin-rotate', 'ce-roomui-btn', () => run('admin', { type: 'rotate' }));
    const transferTargetWrap = el('div', 'ce-roomui-transfer-target');
    const transferTargetLabel = el('label', 'ce-roomui-label', 'New host');
    transferTargetLabel.htmlFor = 'ce-roomui-new-host';
    const transferTarget = el('select', 'ce-roomui-select', undefined, { name: 'new-host' });
    transferTarget.id = 'ce-roomui-new-host'; transferTarget.setAttribute('aria-label', 'New host');
    transferTargetWrap.append(transferTargetLabel, transferTarget);
    const transfer = button('Hand over host', 'admin-transfer', 'ce-roomui-btn', () => {
      const playerId = transferTarget.value;
      const currentSession = state.session;
      const eligible = eligibleTransferTargets(state.players, currentSession?.playerId);
      if (currentSession?.isAdmin !== true || !eligible.some((player) => player.playerId === playerId)) return;
      run('admin', { type: 'transfer', playerId });
    });
    const closeRoom = button('Close room', 'admin-close', 'ce-roomui-btn ce-roomui-btn--danger', () => run('admin', { type: 'close' }));
    grid.append(transferTargetWrap, lock, rotate, transfer, closeRoom);
    const kicks = [];
    for (let seat = 1; seat <= 8; seat += 1) {
      const kick = button(`Remove Player ${seat}`, 'admin-kick', 'ce-roomui-btn', () => run('admin', { type: 'kick', playerId: kick.dataset.playerId }));
      kick.dataset.seat = String(seat); kick.hidden = true; kicks.push(kick); grid.append(kick);
    }
    admin.append(grid); fragment.append(admin);

    const leave = section();
    const leaveButton = button('Leave room', 'leave', 'ce-roomui-btn ce-roomui-btn--danger', async () => {
      ++requestId; activeRequest = 'leaveRoom'; setBusy(true); updateStatus('Leaving room…');
      try {
        await call('leaveRoom');
        if (!disposed && activeRequest === 'leaveRoom') { activeRequest = ''; state.session = null; sessionView = null; setBusy(false); updateStatus('You left the room.'); render(); }
      } catch (error) {
        if (!disposed && activeRequest === 'leaveRoom') { activeRequest = ''; setBusy(false); updateStatus(error?.message || 'Could not leave the room.', true); }
      }
    }); leaveButton.dataset.request = 'true'; leave.append(leaveButton); fragment.append(leave);
    content.replaceChildren(fragment); view = 'session';
    sessionView = { key: sessionKey(session), yourLine, playerList: list, invite, inviteInput, vehicleSection, vehicleSelect, admin, lock, transferTarget, transfer, kicks };
  }
  function patchSession(session) {
    if (!sessionView || sessionView.key !== sessionKey(session)) buildSession(session);
    const view = sessionView;
    view.yourLine.textContent = `Player ${session.seat} · ${session.connectionStatus || state.connectionStatus || 'Connected'}${Number.isFinite(session.ping) ? ` · ${Math.round(session.ping)} ms` : ''}`;
    const players = Array.isArray(state.players) ? state.players.slice(0, 8) : [];
    const seats = [];
    for (let seat = 1; seat <= 8; seat += 1) {
      const player = players.find((entry) => Number(entry?.seat) === seat);
      const li = el('li', `ce-roomui-player${player ? '' : ' ce-roomui-player-empty'}`);
      li.append(el('span', '', `Player ${seat}`));
      if (!player || player.connected === false) li.append(el('span', 'ce-roomui-player-note', 'Not connected'));
      else if (player.playerId === session.playerId) li.append(el('span', 'ce-roomui-badge', 'You'));
      else if (player.isAdmin) li.append(el('span', 'ce-roomui-badge', 'Host'));
      li.setAttribute('aria-label', `Player ${seat}${!player || player.connected === false ? ', Not connected' : player.playerId === session.playerId ? ', you' : player.isAdmin ? ', host' : ''}`);
      seats.push(li);
    }
    view.playerList.replaceChildren(...seats);
    const hasInvite = Boolean(session.roomCode && session.canViewInviteCode !== false);
    view.invite.hidden = !hasInvite;
    if (hasInvite && view.inviteInput.value !== String(session.roomCode)) view.inviteInput.value = String(session.roomCode);

    const vehicles = Array.isArray(state.vehicles) ? state.vehicles : [];
    view.vehicleSection.hidden = vehicles.length === 0;
    const oldSelection = view.vehicleSelect.value;
    const preserveUserSelection = doc.activeElement === view.vehicleSelect;
    const desired = preserveUserSelection ? oldSelection : (state.selectedVehicleId ?? session.vehicleId ?? '');
    const placeholder = el('option', '', 'Select a vehicle…', { value: '' });
    placeholder.disabled = true;
    view.vehicleSelect.replaceChildren(placeholder, ...vehicles.map((vehicle) => {
      const name = vehicle.label || vehicle.name || vehicle.id;
      const option = el('option', '', vehicle.occupiedByOther ? `${name} · In use` : name, { value: String(vehicle.id) });
      option.disabled = vehicle.available === false;
      return option;
    }));
    view.vehicleSelect.value = vehicles.some((vehicle) => String(vehicle.id) === String(desired) && vehicle.available !== false) ? String(desired) : '';

    view.admin.hidden = session.isAdmin !== true;
    const locked = Boolean(state.locked);
    view.lock.textContent = locked ? 'Unlock room' : 'Lock room';
    view.lock.dataset.lockType = locked ? 'unlock' : 'lock';
    const eligibleTargets = eligibleTransferTargets(players, session.playerId);
    const previousTarget = view.transferTarget.value;
    view.transferTarget.replaceChildren(...eligibleTargets.map((player) => el('option', '', `Player ${player.seat}`, { value: player.playerId })));
    const selectedTarget = eligibleTargets.find((player) => player.playerId === previousTarget) ?? eligibleTargets[0];
    view.transferTarget.value = selectedTarget?.playerId ?? '';
    view.transferTarget.disabled = !selectedTarget;
    view.transfer.disabled = !selectedTarget || session.isAdmin !== true;
    for (const kick of view.kicks) {
      const player = players.find((entry) => Number(entry?.seat) === Number(kick.dataset.seat));
      const canKick = Boolean(player?.playerId && player.playerId !== session.playerId && session.isAdmin === true);
      kick.hidden = !canKick;
      kick.dataset.playerId = canKick ? String(player.playerId) : '';
    }
  }
  function eligibleTransferTargets(players, ownerPlayerId) {
    const byId = new Map();
    for (const player of Array.isArray(players) ? players : []) {
      const playerId = String(player?.playerId ?? '');
      const seat = Number(player?.seat);
      if (!playerId || playerId === String(ownerPlayerId ?? '') || player.connected === false || !Number.isInteger(seat) || seat < 1 || seat > 8) continue;
      if (!byId.has(playerId)) byId.set(playerId, { playerId, seat });
    }
    return [...byId.values()].sort((a, b) => a.seat - b.seat);
  }
  function render() {
    if (disposed) return;
    const session = state.session || null;
    count.textContent = session ? ` · ${state.players?.length || 1}/8` : '';
    if (state.available === false) {
      if (view !== 'unavailable') { content.replaceChildren(el('p', 'ce-roomui-copy', 'Multiplayer is not available yet.')); view = 'unavailable'; sessionView = null; }
      if (!updatePendingStatus()) updateStatus(state.message || ''); return;
    }
    if (session) {
      if (view !== 'session' || !sessionView || sessionView.key !== sessionKey(session)) buildSession(session);
      patchSession(session);
      if (!updatePendingStatus()) updateStatus(state.message || state.connectionStatus || ''); return;
    }
    sessionView = null;
    if (view !== 'lobby') buildLobby();
    updateLobbyDirectory(state.rooms || []);
    if (!updatePendingStatus()) updateStatus(state.message || '');
  }  function onRootClick(event) { event.stopPropagation(); }
  function onViewportEvent() { applyViewport(); }
  toggle.addEventListener('click', () => isOpen ? close() : open());
  closeButton.addEventListener('click', close);
  root.addEventListener('click', onRootClick);
  panel.addEventListener('click', onPanelClick);
  doc.addEventListener('keydown', onEscape, true);
  win.visualViewport?.addEventListener('resize', onViewportEvent);
  win.visualViewport?.addEventListener('scroll', onViewportEvent);
  win.addEventListener('resize', onViewportEvent);
  buildLobby(); render(); applyViewport();

  return {
    open,
    close,
    update(nextState = {}) { if (disposed) return; const hasSession = Object.prototype.hasOwnProperty.call(nextState, 'session'); const sessionChanged = hasSession && sessionKey(state.session) !== sessionKey(nextState.session); const unavailable = Object.prototype.hasOwnProperty.call(nextState, 'available') && nextState.available === false && state.available !== false; if (sessionChanged || unavailable) { ++requestId; activeRequest = ''; setBusy(false); } state = { ...state, ...nextState }; render(); applyViewport(); },
    async refreshRooms() { return run('listRooms', undefined, 'Room list updated.'); },
    dispose() {
      if (disposed) return;
      disposed = true; ++requestId; activeRequest = '';
      doc.removeEventListener('keydown', onEscape, true);
      win.visualViewport?.removeEventListener('resize', onViewportEvent);
      win.visualViewport?.removeEventListener('scroll', onViewportEvent);
      win.removeEventListener('resize', onViewportEvent);
      root.removeEventListener('click', onRootClick); panel.removeEventListener('click', onPanelClick);
      style.remove(); root.remove();
      if (isOpen) { isOpen = false; onOpenChangeCall(); }
    },
    get isOpen() { return isOpen; },
  };
}
