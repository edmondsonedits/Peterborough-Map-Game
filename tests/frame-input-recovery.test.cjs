'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../tools/location-report-tests/node_modules/jsdom');
const read = file => readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function simulator(t, {tuning = true, storageDenied = false} = {}) {
  const dom = new JSDOM('<div id="steering"><span id="steering-thumb"></span><span class="joystick-label"></span></div><button id="gas-pedal">Gas</button><button id="gear-down"></button><span id="gear-limit"></span><button id="reverse-pedal"></button><button id="audio-button"></button><button id="options-button"></button><button id="siren-button"></button><button id="recenter-button"></button><div class="control-hint"></div><iframe id="simulator"></iframe>', {url:'https://game.example.test/response-simulator/mobile/', runScripts:'outside-only'});
  const parent = dom.window, frame = parent.document.getElementById('simulator'), realms = [], errors = [];
  let current;
  const pendingTimers = new Map();
  // Retain retired windows so an event routed to stale closures is observable.
  // Only navigation/rendering/network scheduling is replaced; parent event propagation is real.
  Object.defineProperties(frame, {contentWindow:{get:()=>current}, contentDocument:{get:()=>current?.document}});
  t.after(() => { for (const realm of realms) realm.window.close(); dom.window.close(); assert.deepEqual(errors, [], 'input handlers must not throw'); });
  const onError = event => errors.push(event.error?.message || event.message);
  parent.addEventListener('error', onError);
  const steering = parent.document.getElementById('steering');
  const activeListeners = new Map();
  for (const target of [parent, parent.document, steering]) {
    const add = target.addEventListener, remove = target.removeEventListener, listeners = new Map();
    activeListeners.set(target, listeners);
    target.addEventListener = function(type, handler, options) {
      const key = `${type}:${typeof options === 'boolean' ? options : Boolean(options?.capture)}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(handler);
      return add.call(this, type, handler, options);
    };
    target.removeEventListener = function(type, handler, options) {
      const key = `${type}:${typeof options === 'boolean' ? options : Boolean(options?.capture)}`;
      listeners.get(key)?.delete(handler);
      return remove.call(this, type, handler, options);
    };
  }
  steering.getBoundingClientRect = () => ({left:0, top:0, width:100, height:100});
  for (const node of parent.document.querySelectorAll('button,#steering')) {
    node.setPointerCapture = () => {};
    node.releasePointerCapture = () => {};
  }
  const wrapper = read('response-simulator/mobile/index.html');
  parent.eval('var steering=document.getElementById("steering"),thumb=document.getElementById("steering-thumb"),gas=document.getElementById("gas-pedal"),reverse=document.getElementById("reverse-pedal"),audio=document.getElementById("audio-button"),options=document.getElementById("options-button"),siren=document.getElementById("siren-button"),recenter=document.getElementById("recenter-button"),frame=document.getElementById("simulator");var steeringPointer=null,fallbackSteeringKey=null,voiceEnabled=true,frameGeneration=0,trace=null;var VERSION="test";var pressed=new Set(),sim=()=>frame.contentWindow,haptic=()=>{};' + wrapper.slice(wrapper.indexOf('      function dispatchKey('), wrapper.indexOf('      function injectScript(')));
  const attachStart = wrapper.indexOf('      function initializeFrame()');
  parent.eval(wrapper.slice(attachStart, wrapper.indexOf('        try{const boot=', attachStart)) + '}\n' + wrapper.slice(wrapper.indexOf('      function releaseAll()'), wrapper.indexOf('updateAudio();', wrapper.indexOf('      function releaseAll()'))));

  function load({deferArcade = false, deferControls = false} = {}) {
    const inner = new JSDOM('<body><div id="control-panel"></div></body>', {url:'https://game.example.test/response-simulator/', runScripts:'outside-only'});
    realms.push(inner);
    current = inner.window;
    Object.defineProperty(current, 'parent', {value:parent});
    Object.defineProperty(current, 'frameElement', {value:frame, configurable:true});
    current.addEventListener('error', onError);
    current.requestAnimationFrame = () => 0;
    const pending = [];
    pendingTimers.set(current, pending);
    current.setTimeout = (callback, delay) => { if (delay === 50 || delay === 60) pending.push(callback); return 0; };
    current.setInterval = () => 0;
    current.initializeSimulator = () => {};
    current.localStorage.setItem('ptboMobileSteeringMode', 'directional');
    current.localStorage.setItem('ptboDirectionalSteeringDefaultV2', '1');
    current.localStorage.setItem('ptboArcadeHandlingDefaultV151', '1');
    current.localStorage.setItem('ptboDirectionalDriveZoomDefaultV158', '1');
    if (storageDenied) {
      Object.defineProperty(current, 'localStorage', {get(){throw new current.DOMException('Storage blocked', 'SecurityError');}});
      current.console.warn = () => {};
    }
    current.eval('var keys={ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false,w:false,a:false,s:false,d:false},currentHeading=0,velocity=0,simLat=44.3,simLng=-78.32,vehicleMarker=null,lastTimestamp=null,physicsAccumulator=0;var mapInstance={options:{},getZoom:()=>19,setView(){}};window.PTBO_FIXED_STEP=1/60;');
    const base = read('response-simulator/index.html');
    current.eval(base.slice(base.indexOf('        function drivingKey('), base.indexOf('        function playDispatchAudioText(')));
    parent.initializeFrame();
    if (!deferControls) current.eval(read('response-simulator/vehicle-instruments-core.js'));
    if (tuning) current.eval(read('response-simulator/directional-steering-tuning.js'));
    if (!deferArcade && !deferControls) current.eval(read('response-simulator/arcade-handling-1.5.1.js'));
    current.eval(read('response-simulator/gearbox-core.js'));
    current.eval(read('response-simulator/directional-drive-zoom-1.5.8.js'));
    assert.equal(current.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.installed, !deferArcade && !deferControls);
    return current;
  }
  function pointer(type, id, target = steering, extra = {}) {
    const event = new parent.Event(type, {bubbles:true, cancelable:true});
    Object.assign(event, {pointerId:id, pointerType:'touch', clientX:100, clientY:50, ...extra});
    target.dispatchEvent(event);
  }
  function click(id, detail) { parent.document.getElementById(id).dispatchEvent(new parent.MouseEvent('click', {bubbles:true, cancelable:true, detail})); }
  function snapshot(game) { return JSON.stringify({core:game.PTBO_VEHICLE_INSTRUMENTS.state,tuning:game.PTBO_DIRECTIONAL_STEERING_TUNING?.state,drive:game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state,keys:game.keys,heading:game.currentHeading}); }
  async function finishPending(game) {
    if (!game.PTBO_VEHICLE_INSTRUMENTS) game.eval(read('response-simulator/vehicle-instruments-core.js'));
    if (!game.PTBO_ARCADE_HANDLING) game.eval(read('response-simulator/arcade-handling-1.5.1.js'));
    for (const callback of pendingTimers.get(game).splice(0)) callback();
    await flush();
  }
  const listenerCounts = () => [...activeListeners.values()].map(listeners => [...listeners].filter(([key]) => /^(pointer|lostpointercapture|click|blur|visibilitychange)/.test(key)).map(([key, handlers]) => [key, handlers.size]));
  return {parent, load, pointer, click, snapshot, listenerCounts, finishPending, node:id=>parent.document.getElementById(id)};
}

test('two iframe reloads route joystick and single gear presses only to the current runtime', async t => {
  const s = simulator(t), retired = [];
  let firstListenerCounts;
  for (let generation = 0; generation < 3; generation++) {
    const game = s.load(), drive = game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state, tuning = game.PTBO_DIRECTIONAL_STEERING_TUNING.state;
    firstListenerCounts ??= s.listenerCounts();
    assert.deepEqual(s.listenerCounts(), firstListenerCounts, 'parent input listeners cannot grow across reloads');
    s.pointer('pointerdown', 10); await flush();
    assert.equal(drive.directionalDriveActive, true, `generation ${generation} owns drive`);
    assert.equal(game.keys.ArrowUp, true);
    assert.equal(tuning.targetHeading, 90, `generation ${generation} owns direction`);
    s.pointer('pointerdown', 20, s.node('gas-pedal'));
    s.pointer('pointerup', 20, s.node('gas-pedal')); s.click('gas-pedal', 1); await flush();
    assert.equal(drive.currentGear, 2); assert.equal(drive.gearPresses, 1, 'one pointer gesture shifts once');
    assert.equal(tuning.pointerActive, true, 'gear release cannot release the joystick owner');
    game.PTBO_DIRECTIONAL_DRIVE_ZOOM.beforeStep(); game.PTBO_DIRECTIONAL_STEERING_TUNING.step(1/60);
    assert.ok(game.currentHeading > 0);
    s.click('gas-pedal', 0); assert.equal(drive.currentGear, 3, 'keyboard/AT click shifts once');
    s.pointer('pointerup', 10, s.parent.document.body); await flush();
    assert.equal(game.keys.ArrowUp, false); assert.equal(tuning.pointerActive, false);
    for (const old of retired) assert.equal(s.snapshot(old.game), old.snapshot, 'retired input state stays untouched');
    // Leave a live gesture and gear press at navigation to test teardown releases.
    s.pointer('pointerdown', 30); s.pointer('pointerdown', 40, s.node('gas-pedal')); await flush();
    game.dispatchEvent(new game.PageTransitionEvent('pagehide')); await flush();
    assert.equal(game.keys.ArrowUp, false, 'navigation releases the retired throttle');
    assert.equal(tuning.pointerActive, false, 'navigation releases the retired steering owner');
    assert.equal(drive.gasPointer, null, 'navigation releases the retired gear owner');
    retired.push({game, snapshot:s.snapshot(game)});
  }
});

test('a replacement runtime also takes ownership when old pagehide delivery is delayed', async t => {
  const s = simulator(t), first = s.load();
  const second = s.load();
  const before = s.snapshot(first);
  s.pointer('pointerdown', 10); s.pointer('pointerdown', 20, s.node('gas-pedal')); await flush();
  assert.equal(second.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.directionalDriveActive, true);
  assert.equal(second.PTBO_DIRECTIONAL_STEERING_TUNING.state.targetHeading, 90);
  assert.equal(second.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.gearPresses, 1);
  assert.equal(s.snapshot(first), before);
  // Late dismissal of an old runtime must not remove the replacement's listeners.
  first.dispatchEvent(new first.PageTransitionEvent('pagehide')); await flush();
  assert.equal(second.keys.ArrowUp, true, 'old dismissal cannot release the new throttle');
  assert.equal(second.PTBO_DIRECTIONAL_STEERING_TUNING.state.pointerActive, true);
  s.pointer('pointerup', 10); s.pointer('pointerup', 20, s.node('gas-pedal'));
  s.pointer('pointerdown', 30); await flush();
  assert.equal(second.keys.ArrowUp, true);
  assert.equal(second.PTBO_DIRECTIONAL_STEERING_TUNING.state.pointerActive, true);
});

test('reverse key release and focus-loss resets still work after iframe replacement', async t => {
  const s = simulator(t), first = s.load();
  first.dispatchEvent(new first.PageTransitionEvent('pagehide')); await flush();
  const game = s.load();
  s.pointer('pointerdown', 10); s.pointer('pointerdown', 20, s.node('reverse-pedal')); await flush();
  game.PTBO_DIRECTIONAL_DRIVE_ZOOM.beforeStep();
  assert.equal(game.keys.ArrowDown, true); assert.equal(game.keys.ArrowUp, false);
  s.pointer('pointerup', 20, s.node('reverse-pedal')); game.PTBO_DIRECTIONAL_DRIVE_ZOOM.beforeStep();
  assert.equal(game.keys.ArrowDown, false); assert.equal(game.keys.ArrowUp, true);
  s.pointer('pointerdown', 30, s.node('reverse-pedal'));
  s.parent.dispatchEvent(new s.parent.Event('blur')); await flush();
  assert.equal(game.keys.ArrowDown, false); assert.equal(game.keys.ArrowUp, false);
  assert.equal(game.PTBO_DIRECTIONAL_STEERING_TUNING.state.pointerActive, false);
  s.pointer('pointermove', 10); await flush(); assert.equal(game.keys.ArrowUp, false);
  s.pointer('pointerdown', 40); await flush(); assert.equal(game.keys.ArrowUp, true);
  game.dispatchEvent(new game.KeyboardEvent('keydown', {key:'s',code:'KeyS',bubbles:true}));
  assert.equal(game.keys.s, true);
  game.dispatchEvent(new game.KeyboardEvent('keyup', {key:'S',code:'KeyS',bubbles:true}));
  assert.equal(game.keys.s, false);
  game.dispatchEvent(new game.Event('blur')); assert.equal(game.keys.ArrowUp, false);
});

test('the essential core reconnects without optional tuning after iframe replacement', async t => {
  const s = simulator(t, {tuning:false}), first = s.load();
  first.dispatchEvent(new first.PageTransitionEvent('pagehide')); await flush();
  const game = s.load(), before = s.snapshot(first);
  s.pointer('pointerdown', 10); await flush(); game.PTBO_VEHICLE_INSTRUMENTS.stepSteering(1/60);
  assert.ok(game.currentHeading > 0);
  assert.equal(game.keys.ArrowUp, true);
  s.pointer('pointerup', 10, s.parent.document.body);
  assert.equal(game.keys.ArrowUp, false);
  assert.equal(game.PTBO_VEHICLE_INSTRUMENTS.state.directionalTargetHeading, null);
  assert.equal(s.snapshot(first), before);
});

test('restoring a cached inner page reconnects each input layer once', async t => {
  const s = simulator(t), game = s.load(), initialListeners = s.listenerCounts();
  s.pointer('pointerdown', 10); await flush();
  game.dispatchEvent(new game.PageTransitionEvent('pagehide', {persisted:true})); await flush();
  assert.equal(game.keys.ArrowUp, false);
  game.dispatchEvent(new game.PageTransitionEvent('pageshow', {persisted:true})); await flush();
  assert.deepEqual(s.listenerCounts(), initialListeners);
  s.pointer('pointerdown', 20); s.pointer('pointerdown', 30, s.node('gas-pedal')); await flush();
  assert.equal(game.keys.ArrowUp, true);
  assert.equal(game.PTBO_DIRECTIONAL_STEERING_TUNING.state.targetHeading, 90);
  assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.gearPresses, 1);
});

test('cached-page restoration releases the wrapper reverse owner before a fresh press', async t => {
  const s = simulator(t), game = s.load();
  s.pointer('pointerdown', 10, s.node('reverse-pedal')); assert.equal(game.keys.ArrowDown, true);
  game.dispatchEvent(new game.PageTransitionEvent('pagehide', {persisted:true})); await flush();
  assert.equal(game.keys.ArrowDown, false, 'cached page dismissal releases the held reverse key');
  game.dispatchEvent(new game.PageTransitionEvent('pageshow', {persisted:true})); await flush();
  s.pointer('pointerdown', 20, s.node('reverse-pedal'));
  assert.equal(game.keys.ArrowDown, true);
  s.pointer('pointerup', 20, s.node('reverse-pedal')); assert.equal(game.keys.ArrowDown, false);
});

test('a new frame starts with fresh wrapper pedal ownership after a held reverse press', async t => {
  const s = simulator(t), first = s.load();
  s.pointer('pointerdown', 10, s.node('reverse-pedal'));
  assert.equal(first.keys.ArrowDown, true);
  first.dispatchEvent(new first.PageTransitionEvent('pagehide')); await flush();
  const game = s.load();
  s.pointer('pointerdown', 20, s.node('reverse-pedal'));
  assert.equal(game.keys.ArrowDown, true, 'a fresh reverse press must reach the replacement');
  s.pointer('pointerup', 20, s.node('reverse-pedal'));
  assert.equal(game.keys.ArrowDown, false);
});

test('late retired-frame mode changes and dismissal cannot release the replacement wrapper controls', async t => {
  const s = simulator(t), first = s.load(), game = s.load();
  s.pointer('pointerdown', 10, s.node('reverse-pedal'));
  assert.equal(game.keys.ArrowDown, true);
  first.dispatchEvent(new first.CustomEvent('ptbo-steering-mode-change', {detail:{mode:'standard'}}));
  first.dispatchEvent(new first.PageTransitionEvent('pagehide'));
  await flush();assert.equal(game.keys.ArrowDown, true);
  s.pointer('pointerup', 10, s.node('reverse-pedal'));assert.equal(game.keys.ArrowDown, false);
});

for (const deferred of ['arcade', 'controls', 'detached controls']) {
  test(`a retired frame waiting for ${deferred} cannot reclaim the replacement input`, async t => {
    const s = simulator(t), first = s.load(deferred === 'arcade' ? {deferArcade:true} : {deferControls:true});
    const game = s.load(), before = s.snapshot(game), listeners = s.listenerCounts();
    if (deferred === 'detached controls') Object.defineProperty(first, 'frameElement', {value:null});
    // Deliberately withhold old pagehide: late dependency completion must be harmless itself.
    await s.finishPending(first);
    assert.equal(s.snapshot(game), before, 'old installation cannot dispose or reset the replacement');
    assert.deepEqual(s.listenerCounts(), listeners);
    const retired = s.snapshot(first);
    s.pointer('pointerdown', 10); s.pointer('pointerdown', 20, s.node('gas-pedal')); await flush();
    assert.equal(game.keys.ArrowUp, true);
    assert.equal(game.PTBO_DIRECTIONAL_STEERING_TUNING.state.targetHeading, 90);
    assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.gearPresses, 1);
    assert.equal(s.snapshot(first), retired);
  });
}

test('cached restoration preserves a session Standard choice when optional storage is denied', async t => {
  const s = simulator(t, {storageDenied:true}), game = s.load();
  game.PTBO_VEHICLE_INSTRUMENTS.setSteeringMode('standard');
  game.dispatchEvent(new game.PageTransitionEvent('pagehide', {persisted:true})); await flush();
  game.dispatchEvent(new game.PageTransitionEvent('pageshow', {persisted:true})); await flush();
  assert.equal(game.PTBO_VEHICLE_INSTRUMENTS.state.steeringMode, 'standard');
  s.pointer('pointerdown', 10, s.node('gas-pedal')); assert.equal(game.keys.ArrowUp, true);
  assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.currentGear, 1);
});

test('cached restoration keeps the selected gear while releasing held input', async t => {
  const s = simulator(t), game = s.load();
  s.click('gas-pedal', 0); s.click('gas-pedal', 0);
  assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.currentGear, 3);
  game.dispatchEvent(new game.PageTransitionEvent('pagehide', {persisted:true})); await flush();
  game.dispatchEvent(new game.PageTransitionEvent('pageshow', {persisted:true})); await flush();
  assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.currentGear, 3);
  assert.equal(game.keys.ArrowUp, false);
  s.pointer('pointerdown', 10); await flush(); assert.equal(game.keys.ArrowUp, true);
});
