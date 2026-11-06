import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createRoomUi } from '../city-explorer/multiplayer/room-ui.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('../tools/location-report-tests/node_modules/jsdom');

function setup(callbacks = {}, onOpenChange = () => {}) {
  const dom = new JSDOM('<!doctype html><main id="game"></main>', { pretendToBeVisual: true });
  const parent = dom.window.document.querySelector('#game');
  const ui = createRoomUi({ parent, callbacks, onOpenChange });
  return { dom, parent, ui, cleanup: () => { ui.dispose(); dom.window.close(); } };
}

test('room drawer opens compactly, closes with Escape, and restores focus to its toggle', (t) => {
  const changes = [];
  const env = setup({}, (open) => changes.push(open)); t.after(env.cleanup);
  const toggle = env.parent.querySelector('.ce-roomui-toggle');
  const panel = env.parent.querySelector('.ce-roomui-panel');
  assert.equal(panel.hidden, true);
  toggle.click();
  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  env.dom.window.document.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(panel.hidden, true);
  assert.equal(env.dom.window.document.activeElement, toggle);
  assert.deepEqual(changes, [true, false]);
});

test('directory and status updates preserve join input value, focus, selection, and selected room id', async (t) => {
  const joins = [];
  const env = setup({ joinRoom: (payload) => joins.push(payload) }); t.after(env.cleanup);
  env.ui.update({ rooms: [{ id: 'room_42', name: 'Station 2', count: 2, capacity: 8 }] });
  env.ui.open();
  const input = env.parent.querySelector('#ce-roomui-join-code');
  input.value = 'ABCD-12'; input.focus(); input.setSelectionRange(2, 5);
  env.parent.querySelector('[data-action="room-join"]').click();
  env.ui.update({ rooms: [{ id: 'room_42', name: 'Station 2 · refreshed', count: 3, capacity: 8 }], message: 'Room list updated.' });
  assert.equal(env.parent.querySelector('#ce-roomui-join-code'), input);
  assert.equal(input.value, 'ABCD-12');
  assert.equal(env.dom.window.document.activeElement, input);
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 5);
  env.parent.querySelector('[data-action="join"]').click();
  await Promise.resolve();
  assert.deepEqual(joins, [{ code: 'ABCD-12', roomId: 'room_42' }]);
});

test('untrusted room and player names remain text, with fixed Player 1-8 seats and admin-only controls', (t) => {
  const env = setup(); t.after(env.cleanup);
  env.ui.update({ rooms: [{ id: 'r1', name: '<img src=x onerror=alert(1)>', count: 1, capacity: 8 }] });
  const roomName = env.parent.querySelector('.ce-roomui-room-name');
  assert.equal(roomName.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(env.parent.querySelector('.ce-roomui-room-name img'), null);
  env.ui.update({ session: { roomCode: 'SECRET', roomId: 'r1', playerId: 'p1', seat: 1, name: 'Player 1', epoch: 3, isAdmin: false }, players: [{ playerId: 'p1', seat: 1, name: '<svg onload=alert(1)>' }] });
  assert.equal(env.parent.querySelectorAll('.ce-roomui-player').length, 8);
  assert.equal(env.parent.querySelector('.ce-roomui-player').textContent, 'Player 1You');
  assert.equal(env.parent.querySelectorAll('.ce-roomui-player svg').length, 0);
  assert.equal(env.parent.querySelector('[data-admin-section]').hidden, true);
  assert.equal(env.parent.querySelector('.ce-roomui-invite input').value, 'SECRET');
  env.ui.update({ session: { roomCode: 'SECRET', roomId: 'r1', playerId: 'p1', seat: 1, name: 'Player 1', epoch: 3, isAdmin: true }, players: [{ playerId: 'p1', seat: 1, name: 'Player 1' }, { playerId: 'p2', seat: 2, name: 'Player 2' }] });
  assert.ok(env.parent.querySelector('[data-action="admin-lock"]'));
  assert.ok(env.parent.querySelector('[data-action="admin-rotate"]'));
  assert.ok(env.parent.querySelector('[data-action="admin-kick"]'));
});

test('admin callback uses transport command types and late async results are ignored after dispose', async (t) => {
  let adminArgs;
  let finishCreate;
  const env = setup({ admin: (args) => { adminArgs = args; }, createRoom: () => new Promise((resolve) => { finishCreate = resolve; }) }); t.after(() => env.dom.window.close());
  env.ui.update({ session: { roomCode: 'HOSTCODE', playerId: 'host', seat: 1, name: 'Player 1', isAdmin: true }, players: [{ playerId: 'host', seat: 1, name: 'Player 1' }], locked: false });
  env.ui.open();
  env.parent.querySelector('[data-action="admin-lock"]').click();
  await Promise.resolve();
  assert.deepEqual(adminArgs, { type: 'lock' });
  env.ui.close(); env.ui.update({ session: null, rooms: [] });
  env.parent.querySelector('[data-action="create"]').click();
  const status = env.parent.querySelector('.ce-roomui-status');
  assert.equal(status.textContent, 'Connecting…');
  env.ui.dispose();
  finishCreate({ message: 'Stale success' });
  await Promise.resolve();
  assert.equal(env.parent.querySelector('.ce-roomui'), null);
});

test('host transfer selects an eligible player and keeps its native selector stable across roster updates', (t) => {
  const commands = [];
  const env = setup({ admin: (args) => commands.push(args) }); t.after(env.cleanup);
  const session = { roomCode: 'HOSTCODE', roomId: 'room', playerId: 'host', seat: 1, isAdmin: true };
  env.ui.update({ session, players: [
    { playerId: 'host', seat: 1, connected: true },
    { playerId: 'player-2', seat: 2, connected: true },
    { playerId: 'player-3', seat: 3, connected: true },
  ] });
  env.ui.open();
  const target = env.parent.querySelector('select[name="new-host"]');
  const transfer = env.parent.querySelector('[data-action="admin-transfer"]');
  assert.ok(target, 'host transfer has an accessible native recipient selector');
  assert.equal(target.getAttribute('aria-label'), 'New host');
  assert.deepEqual([...target.options].map((option) => [option.value, option.textContent]), [['player-2', 'Player 2'], ['player-3', 'Player 3']]);
  assert.equal(target.value, 'player-2', 'the first eligible player is the default target');
  assert.equal(target.disabled, false);
  assert.equal(transfer.disabled, false);

  target.focus(); target.value = 'player-3';
  env.ui.update({ players: [
    { playerId: 'host', seat: 1, connected: true },
    { playerId: 'player-2', seat: 2, connected: true },
    { playerId: 'player-3', seat: 3, connected: true },
  ] });
  assert.equal(env.parent.querySelector('select[name="new-host"]'), target);
  assert.equal(env.dom.window.document.activeElement, target);
  assert.equal(target.value, 'player-3');
  transfer.click();
  assert.deepEqual(commands.at(-1), { type: 'transfer', playerId: 'player-3' });

  env.ui.update({ players: [
    { playerId: 'host', seat: 1, connected: true },
    { playerId: 'player-2', seat: 2, connected: true },
  ] });
  assert.equal(target.value, 'player-2', 'a removed selection falls back to a current eligible player');
  assert.equal(transfer.disabled, false);
  env.ui.update({ players: [{ playerId: 'host', seat: 1, connected: true }, { playerId: 'player-2', seat: 2, connected: false }] });
  assert.equal(target.disabled, true);
  assert.equal(transfer.disabled, true);
  transfer.click();
  assert.equal(commands.length, 1, 'no stale or empty target is sent');
  env.ui.update({ session: { ...session, isAdmin: false }, players: [
    { playerId: 'host', seat: 1, connected: true }, { playerId: 'player-2', seat: 2, connected: true },
  ] });
  assert.equal(env.parent.querySelector('[data-admin-section]').hidden, true, 'host controls disappear when this player loses the role');
  assert.equal(transfer.disabled, true, 'losing admin cannot leave a usable transfer action');
  transfer.click();
  assert.equal(commands.length, 1, 'role loss cannot send an already selected target');
});

test('unavailable endpoint gets a plain status instead of a fake hosted URL', (t) => {
  const env = setup(); t.after(env.cleanup);
  env.ui.update({ available: false }); env.ui.open();
  assert.match(env.parent.querySelector('.ce-roomui-content').textContent, /Multiplayer is not available yet/);
  assert.doesNotMatch(env.parent.textContent, /https?:\/\//);
});

test('pending create and join actions stay busy across unrelated room state updates', async (t) => {
  let finishCreate, finishJoin;
  let creates = 0, joins = 0;
  const env = setup({
    createRoom: () => { creates += 1; return new Promise((resolve) => { finishCreate = resolve; }); },
    joinRoom: () => { joins += 1; return new Promise((resolve) => { finishJoin = resolve; }); },
  }); t.after(env.cleanup);
  env.ui.open();
  const create = env.parent.querySelector('[data-action="create"]');
  create.click();
  assert.equal(creates, 1);
  env.ui.update({ message: 'Ping 22 ms' });
  assert.equal(create.disabled, true, 'message updates must not release the in-flight create button');
  create.click();
  assert.equal(creates, 1, 'the create callback must not run twice');
  env.ui.update({ rooms: [{ id: 'r1', name: 'Open room', count: 1 }], players: [] });
  assert.equal(create.disabled, true, 'directory/roster updates must not cancel create');
  finishCreate({ message: 'Room ready.' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(create.disabled, false);
  assert.equal(env.parent.querySelector('.ce-roomui-status').textContent, 'Room ready.');

  const input = env.parent.querySelector('#ce-roomui-join-code'); input.value = 'ROOM-2';
  env.parent.querySelector('[data-action="join"]').click();
  assert.equal(joins, 1);
  const join = env.parent.querySelector('[data-action="join"]');
  env.ui.update({ message: 'Ping 31 ms', rooms: [{ id: 'r2', name: 'Another room', count: 2 }], players: [] });
  assert.equal(join.disabled, true, 'room updates must not release the in-flight join button');
  join.click();
  assert.equal(joins, 1, 'the join callback must not run twice');
  finishJoin({ message: 'Joined.' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(join.disabled, false);
  assert.equal(env.parent.querySelector('.ce-roomui-status').textContent, 'Joined.');
});

test('roster and status updates keep the focused vehicle selector and current selection', (t) => {
  const env = setup(); t.after(env.cleanup);
  const session = { roomCode: 'CODE', roomId: 'r1', playerId: 'p1', seat: 1, epoch: 2, isAdmin: false, vehicleId: 'engine' };
  env.ui.update({ session, players: [{ playerId: 'p1', seat: 1 }], vehicles: [{ id: 'engine', label: 'Engine' }, { id: 'rescue', label: 'Rescue' }] });
  env.ui.open();
  const select = env.parent.querySelector('select[name="vehicle"]');
  select.focus(); select.value = 'rescue';
  env.ui.update({ players: [{ playerId: 'p1', seat: 1 }], connectionStatus: 'Connected · 22 ms' });
  assert.equal(env.parent.querySelector('select[name="vehicle"]'), select, 'roster patch must not replace the focused control');
  assert.equal(env.dom.window.document.activeElement, select);
  assert.equal(select.value, 'rescue');
  const seatTwo = env.parent.querySelectorAll('.ce-roomui-player')[1];
  assert.match(seatTwo.textContent, /Not connected/);
  assert.equal(seatTwo.getAttribute('aria-label'), 'Player 2, Not connected');
});
