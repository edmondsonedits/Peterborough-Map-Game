'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('city-explorer/app.js');
function section(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'production section exists: ' + start);
  return app.slice(a, b);
}
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.events = {}; this.inert = false; this.style = {}; this.className = ''; this.classes = new Set(); this.classList = { add: (...v) => v.forEach(x => this.classes.add(x)), remove: (...v) => v.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x), toggle: (x, on) => on ? this.classes.add(x) : this.classes.delete(x) }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  focus() { this.focused = true; }
  querySelectorAll() { return this.children.flatMap(n => [n, ...n.querySelectorAll()]); }
}
function bootHarness() {
  const loading = new Node(), canvas = new Node('canvas'), controls = new Node('nav'), appNode = new Node();
  appNode.children = [canvas, controls, loading];
  const document = { documentElement: new Node('html'), activeElement: controls, querySelector: s => s === '#loading-screen' ? loading : s === '#app' ? appNode : s === '#city-canvas' ? canvas : null, createElement: tag => new Node(tag), addEventListener() {}, exitPointerLock() {} };
  const context = vm.createContext({ document, Date, URL, location: { protocol: 'https:', href: 'https://example.test/city-explorer/' }, setTimeout: fn => fn(), CustomEvent: class { constructor(type) { this.type = type; } } });
  context.window = context; context.addEventListener = () => {}; context.dispatchEvent = () => {}; context.setInterval = () => 1; context.clearInterval = () => {};
  const html = read('city-explorer/index.html');
  const code = html.match(/<script>\s*\(\(\) => \{\s*const boot[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
  vm.runInContext(code, context);
  return { boot: context.__PTBO_EXPLORER_BOOTSTRAP__, document, loading, canvas, controls };
}
test('loading blocks background controls and ready restores focus only after the overlay closes', () => {
  const h = bootHarness();
  assert.equal(h.controls.inert, true);
  assert.equal(h.document.documentElement.dataset.explorerInteraction, 'blocked');
  h.boot.ready();
  assert.equal(h.controls.inert, false);
  assert.equal(h.document.documentElement.dataset.explorerInteraction, 'ready');
  assert.equal(h.loading.classList.contains('is-hidden'), true);
  assert.equal(h.controls.focused, true);
});
test('WebGL failure focuses a named recovery panel with 2D and all-games exits', () => {
  const h = bootHarness(); h.boot.fail('WebGL context creation failed');
  const nodes = h.loading.querySelectorAll();
  assert.equal(h.controls.inert, true);
  assert.equal(h.document.documentElement.dataset.explorerInteraction, 'failed');
  assert.match(nodes.map(n => n.textContent || '').join(' '), /WebGL|graphics/i);
  assert.ok(nodes.some(n => n.focused));
  assert.ok(nodes.some(n => n.attrs.href === '../'));
  assert.ok(nodes.some(n => n.attrs.href === '../response-simulator/play/'));
  assert.ok(nodes.some(n => n.tagName === 'details'));
  h.boot.ready(); assert.equal(h.controls.inert, true, 'late readiness cannot dismiss failure');
});
test('native and keyboard command paths share readiness, dialog and mode guards', () => {
  const calls = [];
  const context = vm.createContext({ document: { documentElement: { dataset: { explorerInteraction: 'blocked' } }, querySelector: () => null }, state: { mode: 'onFoot', emergencyLights: false }, cityEditor: null, enterOrExitVehicle: () => calls.push('vehicle'), cycleGameplayCameraDistance: () => calls.push('camera'), toggleSound: () => calls.push('sound'), showToast: () => {}, syncDrivingActions: () => {} });
  vm.runInContext(section('function runExplorerCommand(', 'function openExplorerDialog('), context);
  assert.equal(context.runExplorerCommand('vehicle'), false); assert.equal(calls.length, 0);
  context.document.documentElement.dataset.explorerInteraction = 'ready';
  assert.equal(context.runExplorerCommand('vehicle'), true);
  context.runExplorerCommand('camera'); context.runExplorerCommand('sound');
  assert.deepEqual(calls, ['vehicle', 'camera', 'sound']);
  assert.equal(context.runExplorerCommand('lights'), false);
  context.state.mode = 'driving'; context.runExplorerCommand('lights'); assert.equal(context.state.emergencyLights, true);
  context.document.querySelector = () => ({}); assert.equal(context.runExplorerCommand('vehicle'), false);
});
test('map drag and tap pan share bounded north-up coordinates, zoom and reset', () => {
  const context = vm.createContext({ state: { mode: 'map' }, camera: { position: { x: 0, y: 1000, z: 0 }, fov: 90, aspect: 2, up: { set() {} }, lookAt(x, y, z) { this.target = [x, y, z]; } }, CITY: { terrainSize: 10000, terrainCenter: { x: 0, z: 0 }, worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } }, THREE: { MathUtils: { clamp: (n,a,b) => Math.max(a,Math.min(b,n)), degToRad: n => n*Math.PI/180 } }, els: { canvas: { getBoundingClientRect: () => ({ width: 400, height: 200 }) } }, updateMapGuide() {} });
  vm.runInContext(section('function panMap(', 'function updateMapControls('), context);
  context.panMap(-10, -20); assert.equal(context.camera.position.x, -10); assert.equal(context.camera.position.z, -20);
  context.panMapFromPixels(1, 2); assert.ok(Math.abs(context.camera.position.x + 20) < 1e-9); assert.ok(Math.abs(context.camera.position.z + 40) < 1e-9);
  context.panMap(1000, -1000); assert.equal(context.camera.position.x, 100); assert.equal(context.camera.position.z, -100);
  context.zoomMap(-99999); assert.equal(context.camera.position.y, 500);
  context.zoomMap(99999); assert.equal(context.camera.position.y, 10500);
  context.resetMapView(); assert.equal(context.camera.position.x, 0); assert.equal(context.camera.position.z, 0);
  assert.equal(context.camera.target[0], 0); assert.equal(context.camera.target[2], 0);
});
function mobileHarness() {
  const ids = Object.fromEntries(['touch-controls', 'movement-joystick', 'mobile-action-button', 'mobile-action-label', 'mobile-action-detail', 'mobile-menu-toggle', 'mobile-menu-scrim', 'interaction-prompt', 'app', 'movement-buttons', 'movement-buttons-toggle'].map(id => [id, new Node()]));
  const knob = new Node(), hold = new Node('button'); hold.dataset.mobileCommand = 'KeyQ';
  ids['movement-joystick'].querySelector = () => knob;
  ids['movement-joystick'].closest = () => null;
  ids['touch-controls'].querySelectorAll = () => [hold];
  ids['interaction-prompt'].textContent = 'Enter truck'; ids['interaction-prompt'].classList.add('is-visible');
  const doc = { documentElement: new Node(), getElementById: id => ids[id], querySelector: () => new Node(), addEventListener() {} };
  Object.assign(doc.documentElement.dataset, { gameplayReady: 'true', gameplayMode: 'fly', explorerInteraction: 'ready' });
  const commands = [], holds = [], events = {}, timers = [];
  const c = vm.createContext({ document: doc, MutationObserver: class { observe() {} }, KeyboardEvent: class { constructor(type, v) { this.type = type; Object.assign(this,v); } }, __PTBO_EXPLORER_COMMANDS__: { activate: command => commands.push(command), hold: (key, down) => holds.push([key, down]) }, setTimeout: fn => timers.push(fn), clearTimeout() {} });
  c.window = c; c.addEventListener = (type, fn) => (events[type] ||= []).push(fn); c.dispatchEvent = event => (events[event.type] || []).forEach(fn => fn(event));
  vm.runInContext(read('city-explorer/mobile-controls-1.6.68.js'), c);
  const fire = (node, type, extra = {}) => (node.events[type] || []).forEach(fn => fn({ preventDefault() {}, cancelable: true, pointerId: 1, key: '', detail: 0, ...extra }));
  return { ids, hold, commands, holds, c, fire, timers, doc };
}
test('native mobile action click activates once without a duplicate pointer action', () => {
  const h = mobileHarness(); h.ids['mobile-action-button'].disabled = false;
  h.fire(h.ids['mobile-action-button'], 'pointerdown'); h.fire(h.ids['mobile-action-button'], 'pointerup');
  h.fire(h.ids['mobile-action-button'], 'click', { detail: 1 });
  assert.deepEqual(h.commands, ['vehicle']);
  h.fire(h.ids['mobile-action-button'], 'click'); assert.deepEqual(h.commands, ['vehicle', 'vehicle']);
});
test('native altitude supports keyboard hold, assistive step and cancellation', () => {
  const h = mobileHarness();
  h.fire(h.hold, 'keydown', { key: 'Enter' });
  assert.deepEqual(h.holds, [['KeyQ', true]]);
  h.fire(h.hold, 'keyup', { key: 'Enter' }); assert.deepEqual(h.holds.at(-1), ['KeyQ', false]);
  h.fire(h.hold, 'click'); assert.deepEqual(h.holds.at(-1), ['KeyQ', true]);
  h.timers.forEach(fn => fn()); assert.deepEqual(h.holds.at(-1), ['KeyQ', false]);
  h.fire(h.hold, 'pointerdown'); h.c.dispatchEvent({ type: 'ptbo-explorer-stop' });
  assert.deepEqual(h.holds.at(-1), ['KeyQ', false]); assert.equal(h.hold.classList.contains('is-pressed'), false);
});
test('canvas touch pan uses the same bounded map path and cancellation discards stale touches', () => {
  const events = {}, position = { x: 0, y: 1000, z: 0 }, state = { mode: 'map', previousTouch: null };
  const c = vm.createContext({ cityEditor: null, state, camera: { position, fov: 90, aspect: 2, up: { set() {} }, lookAt() {} }, CITY: { worldBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } }, THREE: { MathUtils: { clamp: (n,a,b) => Math.max(a,Math.min(b,n)), degToRad: n=>n*Math.PI/180 } }, document: { documentElement: { dataset: { explorerInteraction: 'ready' } }, querySelector: () => null }, els: { canvas: { getBoundingClientRect: () => ({width:400,height:200}), addEventListener: (name,fn) => events[name]=fn } }, updateMapGuide() {} });
  vm.runInContext(section('function panMap(', 'function updateMapControls('), c);
  vm.runInContext(section("  els.canvas.addEventListener('touchstart'", "  window.addEventListener('resize'"), c);
  events.touchstart({ touches: [{clientX: 10,clientY: 10}] });
  events.touchmove({ touches: [{clientX: 12,clientY: 11}] });
  assert.ok(Math.abs(position.x + 20) < 1e-9); assert.ok(Math.abs(position.z + 10) < 1e-9);
  events.touchcancel(); events.touchmove({ touches: [{clientX: 40,clientY:40}] });
  assert.ok(Math.abs(position.x + 20) < 1e-9);
  events.touchstart({ touches: [{clientX: 10,clientY:10},{clientX: 20,clientY:20}] });
  assert.equal(state.previousTouch, null);
});
test('blocking startup suppresses controller motion and latches held actions until release', () => {
  const calls = [], pad = { connected: true, mapping: 'standard', axes: [1, -1, 0, 0], buttons: Array.from({length: 11}, () => ({ pressed: false, value: 0 })) };
  pad.buttons[0].pressed = true;
  const c = vm.createContext({ document: { documentElement: {dataset: {explorerInteraction:'blocked'}}, querySelector: () => null }, state: { keys: new Set(), mode: 'onFoot' }, navigator: {getGamepads: () => [pad]}, gameplayAxesFromKeys: () => ({forward:0,strafe:0,steering:0,sprinting:false}), enterOrExitVehicle: () => calls.push('vehicle'), cycleGameplayCameraDistance: () => calls.push('camera'), gamepadActionDown: false, gamepadCameraDown: false });
  vm.runInContext(section('function currentGameplayAxes(', 'function updatePlayerActor('), c);
  assert.equal(c.currentGameplayAxes(0).forward, 0); assert.equal(calls.length, 0);
  c.document.documentElement.dataset.explorerInteraction = 'ready';
  c.currentGameplayAxes(0); assert.equal(calls.length, 0);
  pad.buttons[0].pressed = false; c.currentGameplayAxes(0);
  pad.buttons[0].pressed = true; c.currentGameplayAxes(0); assert.deepEqual(calls, ['vehicle']);
});
test('dialogs release motion on open and return to a visible invoker or the mobile menu', () => {
  const invoker = new Node('button'), menu = new Node('button'), canvas = new Node('canvas'), dialog = { showModal() {this.open = true;} };
  invoker.getClientRects = menu.getClientRects = () => [1];
  let hidden = false, stops = 0;
  const c = vm.createContext({document: {documentElement: {dataset: {explorerInteraction: 'ready'}}, exitPointerLock() {}, querySelector: () => menu}, els: {canvas}, stopFlyMotion: () => stops++, getComputedStyle: () => ({visibility: hidden ? 'hidden' : 'visible'})});
  vm.runInContext(section('function openExplorerDialog(', 'function wireEvents('), c);
  c.openExplorerDialog(dialog, invoker); assert.equal(stops, 1); assert.equal(dialog.open, true);
  c.restoreExplorerDialogFocus(dialog); assert.equal(invoker.focused, true);
  invoker.focused = false; hidden = true; c.restoreExplorerDialogFocus(dialog);
  assert.equal(invoker.focused, false); assert.equal(menu.focused, true);
});
test('mode changes expose exactly one pressed mode and station help uses the active base', () => {
  const playMode = new Node(), flyMode = new Node(), mapMode = new Node(), appNode = new Node();
  const c = vm.createContext({ state: {mode:'driving'}, els: {app: appNode, playMode, flyMode, mapMode, modeHint: new Node()}, document: {documentElement:{dataset:{}}}, syncDrivingActions() {}, FIRE_STATION_ONE: {name: 'Fire Station 3'} });
  vm.runInContext(section('function syncGameplayRootClasses(', 'function snapGameplayCamera('), c);
  c.syncGameplayRootClasses(); assert.equal(playMode.attrs['aria-pressed'], 'true'); assert.equal(flyMode.attrs['aria-pressed'], 'false'); assert.equal(mapMode.attrs['aria-pressed'], 'false');
  c.state.mode = 'map'; c.syncGameplayRootClasses(); assert.equal(playMode.attrs['aria-pressed'], 'false'); assert.equal(mapMode.attrs['aria-pressed'], 'true');
  c.state.mode = 'onFoot'; c.updateGameplayHint(); assert.match(c.els.modeHint.innerHTML, /Fire Station 3/);
});
test('quick travel preserves the active map pan and zoom for the next map entry', () => {
  const position = {x: 321, y: 4321, z: -987, set(x,y,z) {Object.assign(this,{x,y,z});}, copy(other) {Object.assign(this,{x:other.x,y:other.y,z:other.z});} };
  const state = {mode: 'map', keys: new Set(['KeyW']), lastFlyPosition: {copy(other) {Object.assign(this,other);}}, savedMapView: {x: 0, y: 17000, z: 0}};
  const camera = {position, fov: 58, aspect: 2, up: {set(x,y,z) {Object.assign(this,{x,y,z});}}, updateProjectionMatrix() {}, lookAt(x,y,z) {this.target = [x,y,z];}};
  const c = vm.createContext({ state, camera, cityEditor: null, document: {exitPointerLock() {}}, innerWidth: 1000, CITY: {terrainSize: 18000, terrainCenter: {x:0,z:0}, worldBounds: {minX:-9000,maxX:9000,minZ:-9000,maxZ:9000}}, THREE: {MathUtils: {clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),degToRad:n=>n*Math.PI/180}}, els: {app:new Node(), flyMode:new Node(), mapMode:new Node(), locationName:new Node(), modeHint:new Node(), canvas:new Node()}, mapRoadGroup:{visible:true}, streetLabelGroup:{visible:true}, project:()=>({x:20,y:40}), terrainHeightAtWorld:()=>10, stopFlyMotion:()=>state.keys.clear(), flyYawToward:()=>0, syncGameplayRootClasses() {}, updateMouseLookUi() {}, updateMapGuide() {}, showToast() {} });
  vm.runInContext(section('function panMap(', 'function updateMapControls('), c);
  vm.runInContext(section('function setMode(', 'function updateFlyControls('), c);
  vm.runInContext(section('function jumpTo(', 'function exposeCityQualityQa('), c);
  c.jumpTo(44.3, -78.3, 120, 'Test landmark');
  assert.equal(state.mode, 'fly'); assert.equal(state.keys.size, 0);
  assert.deepEqual({...state.savedMapView}, {x:321,y:4321,z:-987});
  assert.equal(position.x, 130); assert.equal(position.y, 130); assert.equal(position.z, 220);
  c.setMode('map');
  assert.deepEqual({x:position.x,y:position.y,z:position.z}, {x:321,y:4321,z:-987});
  assert.equal(camera.up.z, -1); assert.deepEqual(camera.target, [321,0,-987]);
});
