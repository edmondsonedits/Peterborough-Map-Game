'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sim = read('response-simulator/index.html');

function target(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
  }, extra);
}
function element(extra = {}) {
  return target({ dataset: {}, style: {}, innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
    setAttribute() {}, appendChild() {}, remove() {}, querySelector() { return element(); },
    ...extra });
}
function keyEvent(type, key, extra = {}) {
  return { type, key, target: { closest: () => null }, preventDefault() { this.prevented = true; }, ...extra };
}
function game({ mobile = false, savedMode = 'directional' } = {}) {
  const storage = new Map([['ptboMobileSteeringMode', savedMode], ['ptboArcadeHandlingDefaultV151', '1']]);
  const nodes = new Map();
  const document = target({ hidden: false,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element({ value: 5 })); return nodes.get(id); },
    querySelector: () => null, createElement: () => element(), head: { appendChild() {} },
    body: { appendChild() {} },
  });
  const c = vm.createContext(target({ console, URL, document,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    requestAnimationFrame() {}, setTimeout() {}, performance: { now: () => 0 },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    parent: target({ location: { pathname: mobile ? '/response-simulator/mobile/' : '/response-simulator/play/' },
      document: target({ getElementById: id => mobile && id === 'steering' ? element() : null,
        createElement: () => element(), head: { appendChild() {} } }) }),
    simLat: 44.3091, simLng: -78.3197, velocity: 0, currentHeading: 0, lastTimestamp: null,
    keys: { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false },
    simulationState: 'idle', STATES: { ENROUTE: 'enroute', ONSCENE: 'onscene', TRANSPORTING: 'transporting' },
    vehicleMarker: null, mapInstance: null, updateMapOrientation() {}, evaluateDistanceToTarget() {},
  }));
  c.window = c;
  vm.runInContext(sim.slice(sim.indexOf('const FIXED_STEP_MS'), sim.indexOf('        function playDispatchAudioText')), c);
  vm.runInContext(read('response-simulator/vehicle-instruments-core.js'), c);
  vm.runInContext(read('response-simulator/arcade-handling-1.5.1.js'), c);
  return { c, storage };
}

test('desktop drives and steers with arrows and WASD after playing mobile directional mode', () => {
  for (const [forward, right, code, steerCode] of [['ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowRight'], ['w', 'd', 'KeyW', 'KeyD'], ['W', 'D', 'KeyW', 'KeyD']]) {
    const { c, storage } = game();
    assert.equal(c.PTBO_VEHICLE_INSTRUMENTS.state.steeringMode, 'standard');
    c.dispatchEvent(keyEvent('keydown', forward, { code }));
    c.dispatchEvent(keyEvent('keydown', right, { code: steerCode }));
    for (let i = 0; i < 60; i++) c.simulationStep();
    assert.ok(c.velocity > 0, forward);
    assert.notEqual(c.simLat, 44.3091);
    assert.notEqual(c.currentHeading, 0, right);
    c.dispatchEvent(keyEvent('keyup', forward, { code }));
    c.dispatchEvent(keyEvent('keyup', right, { code: steerCode }));
    assert.ok(Object.values(c.keys).every(value => !value));
    assert.equal(storage.get('ptboMobileSteeringMode'), 'directional');
    c.PTBO_VEHICLE_INSTRUMENTS.setSteeringMode('directional');
    assert.equal(c.PTBO_VEHICLE_INSTRUMENTS.state.steeringMode, 'standard');
    assert.equal(storage.get('ptboMobileSteeringMode'), 'directional');
  }
});

test('mobile retains its selected steering mode and touch connection', () => {
  for (const savedMode of ['directional', 'standard']) {
    const { c, storage } = game({ mobile: true, savedMode });
    assert.equal(c.PTBO_VEHICLE_INSTRUMENTS.state.steeringMode, savedMode);
    assert.equal(c.PTBO_VEHICLE_INSTRUMENTS.state.mobileSteeringConnected, true);
    assert.equal(storage.get('ptboMobileSteeringMode'), savedMode);
  }
});

test('keyboard driving ignores typing and browser shortcuts; losing focus releases all controls', () => {
  const { c } = game();
  c.dispatchEvent(keyEvent('keydown', 'w', { ctrlKey: true }));
  c.dispatchEvent(keyEvent('keydown', 'ArrowUp', { target: { closest: () => ({}) } }));
  assert.ok(Object.values(c.keys).every(value => !value));
  c.dispatchEvent(keyEvent('keydown', 's', { code: 'KeyS' }));
  c.dispatchEvent(keyEvent('keydown', 'a', { code: 'KeyA' }));
  for (let i = 0; i < 20; i++) c.simulationStep();
  assert.ok(c.velocity < 0);
  assert.notEqual(c.currentHeading, 0);
  c.dispatchEvent({ type: 'blur' });
  assert.equal(c.velocity, 0);
  assert.ok(Object.values(c.keys).every(value => !value));
});

function wrapper({ mobile = false } = {}) {
  const { c: child } = game();
  child.KeyboardEvent = class { constructor(type, options) { Object.assign(this, keyEvent(type, options.key), options); } };
  const frame = element({ contentWindow: child });
  const document = target({ hidden: false, modal: false, getElementById: () => frame,
    querySelector() { return this.modal ? {} : null; } });
  const outer = vm.createContext(target({ document, location: { pathname: mobile ? '/response-simulator/mobile/' : '/response-simulator/play/' } }));
  outer.window = outer;
  vm.runInContext(read('response-simulator/desktop-keyboard.js'), outer);
  return { outer, child };
}

test('desktop toolbar focus forwards held keys and key releases into the actual game', () => {
  const { outer, child } = wrapper();
  outer.dispatchEvent(keyEvent('keydown', 'W', { code: 'KeyW' }));
  outer.dispatchEvent(keyEvent('keydown', 'ArrowRight', { code: 'ArrowRight' }));
  for (let i = 0; i < 40; i++) child.simulationStep();
  assert.ok(child.velocity > 0);
  assert.notEqual(child.currentHeading, 0);
  outer.dispatchEvent(keyEvent('keyup', 'w', { code: 'KeyW' }));
  outer.dispatchEvent(keyEvent('keyup', 'ArrowRight', { code: 'ArrowRight' }));
  assert.ok(Object.values(child.keys).every(value => !value));
  outer.dispatchEvent(keyEvent('keydown', 'w', { code: 'KeyW' }));
  outer.dispatchEvent({ type: 'blur' });
  assert.equal(child.velocity, 0);
  assert.ok(Object.values(child.keys).every(value => !value));
});

test('desktop forwarding respects dialogs, editable controls and tab visibility; it is inactive on mobile', () => {
  const { outer, child } = wrapper();
  outer.document.modal = true;
  outer.dispatchEvent(keyEvent('keydown', 'w'));
  outer.document.modal = false;
  outer.dispatchEvent(keyEvent('keydown', 'w', { target: { closest: () => ({}) } }));
  outer.dispatchEvent(keyEvent('keydown', 'w', { metaKey: true }));
  assert.equal(child.keys.w, false);
  outer.dispatchEvent(keyEvent('keydown', 'w'));
  outer.document.hidden = true;
  outer.document.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(child.keys.w, false);
  const mobile = wrapper({ mobile: true });
  mobile.outer.dispatchEvent(keyEvent('keydown', 'w'));
  assert.equal(mobile.child.keys.w, false);
});

test('launcher uses desktop for narrow windows and touchscreen laptops, mobile for phones and tablets', () => {
  const source = read('shared/city-selector.js');
  const routing = source.slice(source.indexOf('const touchMobile'), source.indexOf('const style')) + '\nresult = touchMobile;';
  const cases = [
    { label: 'narrow desktop', width: 600, touch: 0, coarse: false, fine: true, expected: false },
    { label: 'touchscreen laptop', width: 800, touch: 10, coarse: true, fine: true, expected: false },
    { label: 'desktop touch API exists', width: 600, touch: 0, coarse: false, fine: true, expected: false },
    { label: 'phone', width: 390, touch: 5, coarse: true, fine: false, expected: true },
    { label: 'landscape tablet', width: 1100, touch: 5, coarse: true, fine: false, expected: true },
    { label: 'phone with mouse', width: 700, touch: 5, coarse: false, fine: true, mobile: true, expected: true },
  ];
  for (const item of cases) {
    const c = vm.createContext({ navigator: { maxTouchPoints: item.touch, userAgentData: { mobile: !!item.mobile } },
      innerWidth: item.width, ontouchstart: null,
      matchMedia: query => ({ matches: query === '(pointer: coarse)' ? item.coarse : item.fine }) });
    c.window = c;
    vm.runInContext(routing, c);
    assert.equal(c.result, item.expected, item.label);
  }
});
