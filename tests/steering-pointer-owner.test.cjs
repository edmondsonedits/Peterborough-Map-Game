'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../tools/location-report-tests/node_modules/jsdom');
const read = file => readFileSync(path.join(__dirname,'..',file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function simulator(t, {mode = 'directional', drive = true, tuning = true} = {}) {
  const dom = new JSDOM(`<div id="steering"><span id="steering-thumb"></span><span class="joystick-label"></span></div><button id="gas-pedal">Gas</button><button id="gear-down"></button><span id="gear-limit"></span><button id="reverse-pedal"></button><button id="audio-button"></button><button id="options-button"></button><button id="siren-button"></button><button id="recenter-button"></button><div class="control-hint"></div><iframe id="simulator"></iframe>`, {url:'https://game.example.test/response-simulator/mobile/', runScripts:'outside-only'});
  const errors=[];
  t.after(() => {dom.window.close();assert.deepEqual(errors,[],'control handlers must not throw');});
  const parent = dom.window, game = parent.document.querySelector('iframe').contentWindow;
  for(const window of [parent,game])window.addEventListener('error',event=>errors.push(event.error?.message||event.message));
  const steering = parent.document.getElementById('steering');
  steering.getBoundingClientRect = () => ({left:0, top:0, width:100, height:100});
  // jsdom supplies real capture/target/bubble propagation; it has no native pointer capture or rendering.
  for (const node of parent.document.querySelectorAll('button,#steering')) {
    node.setPointerCapture = () => {};
    node.releasePointerCapture = () => {};
  }
  game.requestAnimationFrame = () => 0;
  game.setTimeout = () => 0;
  game.localStorage.setItem('ptboMobileSteeringMode', mode);
  game.localStorage.setItem('ptboDirectionalSteeringDefaultV2', '1');
  game.localStorage.setItem('ptboDirectionalDriveZoomDefaultV158', '1');
  game.eval(`var keys={ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false,w:false,a:false,s:false,d:false};var currentHeading=0,velocity=0,simLat=44.3,simLng=-78.32,vehicleMarker=null;var mapInstance={options:{},getZoom:()=>19,setView(){}};window.PTBO_FIXED_STEP=1/60;window.PTBO_ARCADE_HANDLING={state:{settings:{}}};`);
  // The legacy wrapper's real control binding runs before the inner core connects.
  const wrapper = read('response-simulator/mobile/index.html');
  parent.eval(`var steering=document.getElementById('steering'),thumb=document.getElementById('steering-thumb'),gas=document.getElementById('gas-pedal'),reverse=document.getElementById('reverse-pedal'),audio=document.getElementById('audio-button'),options=document.getElementById('options-button'),siren=document.getElementById('siren-button'),recenter=document.getElementById('recenter-button'),frame=document.getElementById('simulator');var steeringPointer=null,fallbackSteeringKey=null,voiceEnabled=true;var pressed=new Set(),sim=()=>frame.contentWindow,haptic=()=>{};` + wrapper.slice(wrapper.indexOf('      function dispatchKey('), wrapper.indexOf('      function injectScript(')));
  // Run the real frame-attachment prefix; exclude map/network startup beyond that boundary.
  game.initializeSimulator=()=>{};
  const attachStart=wrapper.indexOf('      function initializeFrame()');
  const releaseAll=wrapper.slice(wrapper.indexOf('      function releaseAll()')).split('\n')[0];
  parent.eval(`const VERSION='1.6.135';var frameGeneration=0,trace=null;`+releaseAll+wrapper.slice(attachStart,wrapper.indexOf('        try{const boot=',attachStart))+'}\ninitializeFrame();');
  game.eval(read('response-simulator/vehicle-instruments-core.js'));
  if(tuning)game.eval(read('response-simulator/directional-steering-tuning.js'));
  if (drive) {
    game.eval(read('response-simulator/gearbox-core.js'));
    game.eval(read('response-simulator/directional-drive-zoom-1.5.8.js'));
    assert.equal(game.PTBO_DIRECTIONAL_DRIVE_ZOOM.state.installed, true);
  }
  function pointer(type, id, target = steering, extra = {}) {
    const event = new parent.Event(type, {bubbles:true, cancelable:true});
    Object.assign(event, {pointerId:id, pointerType:'touch', clientX:100, clientY:50, ...extra});
    target.dispatchEvent(event);
  }
  return {parent, game, steering, pointer, tuning:game.PTBO_DIRECTIONAL_STEERING_TUNING?.state, drive:game.PTBO_DIRECTIONAL_DRIVE_ZOOM?.state, node:id=>parent.document.getElementById(id)};
}

for (const release of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`${release} from a gear or unrelated second touch preserves held steering`, async t => {
    const s = simulator(t);s.pointer('pointerdown', 10);await flush();
    assert.equal(s.tuning.targetHeading,90);
    s.pointer('pointerdown',20,s.node('gas-pedal'));s.pointer(release,20,s.node('gas-pedal'));await flush();
    assert.equal(s.drive.currentGear,2);assert.equal(s.tuning.pointerActive,true);assert.equal(s.tuning.targetHeading,90);
    s.pointer('pointermove',20,s.parent.document.body,{clientX:0});s.pointer(release,20,s.parent.document.body);await flush();
    s.game.PTBO_DIRECTIONAL_DRIVE_ZOOM.beforeStep();s.game.PTBO_DIRECTIONAL_STEERING_TUNING.step(1/60);
    assert.ok(s.game.currentHeading>0,'the truck must still turn toward the held stick');
    assert.equal(s.game.keys.ArrowUp,true);assert.equal(s.drive.steeringPointer,10);
  });
  test(`the joystick owner's ${release} clears steering and throttle even outside the control`, async t => {
    const s=simulator(t);s.pointer('pointerdown',0);await flush();
    s.pointer(release,0,s.parent.document.body);await flush();
    assert.equal(s.tuning.pointerActive,false);assert.equal(s.tuning.targetHeading,null);assert.equal(s.game.keys.ArrowUp,false);
    assert.equal(s.drive.directionalDriveActive,false);
    s.pointer('pointermove',0);await flush();assert.equal(s.tuning.pointerActive,false,'moving without a new press cannot reacquire');
  });
}
test('a second finger on the joystick cannot replace the first owner or its direction',async t=>{
  const s=simulator(t);s.pointer('pointerdown',10, s.steering,{isPrimary:false});await flush();
  s.pointer('pointerdown',20,s.steering,{clientX:0});s.pointer('pointermove',20,s.steering,{clientX:0});await flush();
  assert.equal(s.tuning.targetHeading,90);assert.equal(s.drive.steeringPointer,10);
  s.pointer('pointerup',20);await flush();assert.equal(s.tuning.pointerActive,true);
  s.pointer('pointermove',10,s.steering,{clientX:50,clientY:0});await flush();assert.equal(s.tuning.targetHeading,0);
});
for (const reset of ['blur','hidden','mode']) {
  test(`${reset} releases all ownership and requires a fresh press`,async t=>{
    const s=simulator(t);s.pointer('pointerdown',10);await flush();
    if(reset==='blur')s.parent.dispatchEvent(new s.parent.Event('blur'));
    if(reset==='hidden'){Object.defineProperty(s.parent.document,'hidden',{configurable:true,value:true});s.parent.document.dispatchEvent(new s.parent.Event('visibilitychange'));}
    if(reset==='mode'){s.game.PTBO_VEHICLE_INSTRUMENTS.setSteeringMode('standard');s.game.PTBO_VEHICLE_INSTRUMENTS.setSteeringMode('directional');}
    await flush();s.pointer('pointermove',10);await flush();
    assert.equal(s.tuning.pointerActive,false);assert.equal(s.tuning.targetHeading,null);assert.equal(s.game.keys.ArrowUp,false);
    s.pointer('pointerdown',30);await flush();assert.equal(s.tuning.targetHeading,90);assert.equal(s.game.keys.ArrowUp,true);
  });
}
test('hover never starts steering',async t=>{
  const s=simulator(t);s.pointer('pointermove',5,s.steering,{pointerType:'mouse',buttons:0});await flush();
  assert.equal(s.tuning.pointerActive,false);assert.equal(s.tuning.targetHeading,null);assert.equal(s.game.PTBO_VEHICLE_INSTRUMENTS.state.directionalTargetHeading,null);
  s.game.PTBO_VEHICLE_INSTRUMENTS.stepSteering(1);assert.equal(s.game.currentHeading,0);
});
test('base steering remains usable when optional tuning is unavailable',async t=>{
  const s=simulator(t,{tuning:false});s.pointer('pointermove',5,s.steering,{pointerType:'mouse',buttons:0});
  s.game.PTBO_VEHICLE_INSTRUMENTS.stepSteering(1);assert.equal(s.game.currentHeading,0);
  s.pointer('pointerdown',10);s.pointer('pointerdown',20,s.node('reverse-pedal'));s.pointer('pointerup',20,s.node('reverse-pedal'));
  s.game.PTBO_VEHICLE_INSTRUMENTS.stepSteering(1/60);assert.ok(s.game.currentHeading>0);
  s.pointer('pointerup',10);assert.equal(s.game.keys.ArrowUp,false);
});
test('late capture loss and deferred old release cannot clear a newly pressed joystick',async t=>{
  const s=simulator(t);s.pointer('pointerdown',10);await flush();
  s.pointer('pointerup',10);s.pointer('pointerdown',30);s.pointer('lostpointercapture',10);await flush();
  assert.equal(s.tuning.pointerActive,true);assert.equal(s.tuning.targetHeading,90);assert.equal(s.game.keys.ArrowUp,true);
  s.pointer('pointerup',30);s.pointer('lostpointercapture',30);await flush();assert.equal(s.tuning.pointerActive,false);
});
test('a new press in the deadzone cannot inherit a previous owner\'s pending direction',async t=>{
  const s=simulator(t);s.pointer('pointerdown',10);await flush();
  s.pointer('pointerup',10);s.pointer('pointerdown',30,s.steering,{clientX:50,clientY:50});await flush();
  s.game.PTBO_DIRECTIONAL_STEERING_TUNING.step(1/60);
  assert.equal(s.tuning.targetHeading,null);assert.equal(s.tuning.stickMagnitude,0);assert.equal(s.game.currentHeading,0);assert.equal(s.game.keys.ArrowUp,false);
});
test('standard steering also keeps the first finger through legacy wrapper bindings',async t=>{
  const s=simulator(t,{mode:'standard',drive:false});s.pointer('pointerdown',10);
  s.pointer('pointerdown',20,s.steering,{clientX:0});s.pointer('pointermove',20,s.steering,{clientX:0});s.pointer('pointerup',20);
  assert.ok(s.game.PTBO_VEHICLE_INSTRUMENTS.state.steeringTarget>0);
  s.pointer('pointerup',10);assert.equal(s.game.PTBO_VEHICLE_INSTRUMENTS.state.steeringTarget,0);
});
test('switching steering modes clears the legacy owner before a new standard gesture',async t=>{
  const s=simulator(t,{mode:'standard',drive:false});s.pointer('pointerdown',10);
  s.game.PTBO_VEHICLE_INSTRUMENTS.setSteeringMode('directional');s.game.PTBO_VEHICLE_INSTRUMENTS.setSteeringMode('standard');
  s.pointer('pointerdown',30);s.pointer('pointerup',10);
  assert.ok(s.game.PTBO_VEHICLE_INSTRUMENTS.state.steeringTarget>0,'an old wrapper owner cannot clear the new gesture');
  s.pointer('pointerup',30);assert.equal(s.game.PTBO_VEHICLE_INSTRUMENTS.state.steeringTarget,0);
});
test('focus moving between auxiliary buttons does not simulate leaving the game',async t=>{
  const s=simulator(t);s.node('options-button').focus();s.pointer('pointerdown',10);await flush();
  s.node('siren-button').focus();await flush();
  assert.equal(s.tuning.pointerActive,true);assert.equal(s.tuning.targetHeading,90);assert.equal(s.game.keys.ArrowUp,true);
});

test('the steering loader uses its release token for nested core and tuning assets',async t=>{
  const dom=new JSDOM('<body></body>',{url:'https://game.example.test/response-simulator/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,script=w.document.createElement('script');script.src='https://game.example.test/response-simulator/vehicle-instruments.js?v=1.6.135';
  Object.defineProperty(w.document,'currentScript',{value:script});const urls=[];
  w.document.body.appendChild=script=>{urls.push(new URL(script.src));if(script.src.includes('vehicle-instruments-core.js'))w.PTBO_VEHICLE_INSTRUMENTS={state:{}};queueMicrotask(()=>script.onload());return script;};
  w.eval(read('response-simulator/vehicle-instruments.js'));await w.PTBO_VEHICLE_INSTRUMENTS_READY;
  assert.equal(urls.find(u=>u.pathname.endsWith('/vehicle-instruments-core.js')).searchParams.get('v'),'1.6.135-core');
  assert.equal(urls.find(u=>u.pathname.endsWith('/directional-steering-tuning.js')).searchParams.get('v'),'1.6.135-tuning');
});
test('the canonical build overrides an older steering-loader query token',async t=>{
  const dom=new JSDOM('<body></body>',{url:'https://game.example.test/response-simulator/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,script=w.document.createElement('script');script.src='https://game.example.test/response-simulator/vehicle-instruments.js?v=1.6.15';
  Object.defineProperty(w.document,'currentScript',{value:script});w.PTBO_BUILD={version:'1.6.136'};const urls=[];
  w.document.body.appendChild=script=>{urls.push(new URL(script.src));if(script.src.includes('vehicle-instruments-core.js'))w.PTBO_VEHICLE_INSTRUMENTS={state:{}};queueMicrotask(()=>script.onload());return script;};
  w.eval(read('response-simulator/vehicle-instruments.js'));await w.PTBO_VEHICLE_INSTRUMENTS_READY;
  assert.equal(urls.find(u=>u.pathname.endsWith('/vehicle-instruments-core.js')).searchParams.get('v'),'1.6.136-core');
  assert.equal(urls.find(u=>u.pathname.endsWith('/directional-steering-tuning.js')).searchParams.get('v'),'1.6.136-tuning');
});
test('the legacy readiness entry requests the current vehicle loader',async t=>{
  const dom=new JSDOM('<body></body>',{url:'https://game.example.test/response-simulator/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,script=w.document.createElement('script');script.src='https://game.example.test/response-simulator/simulator-readiness-1.4.5.js?v=1.6.136';
  Object.defineProperty(w.document,'currentScript',{value:script});w.PTBO_BUILD={version:'1.6.136'};let loaded;
  w.document.body.appendChild=script=>{loaded=new URL(script.src);queueMicrotask(()=>script.onload());return script;};
  const source=read('response-simulator/simulator-readiness-1.4.5.js');
  w.eval(source.slice(0,source.indexOf('  async function waitForValue('))+'window.requestVehicle=()=>injectScript("vehicle-instruments.js","data-ptbo-readiness-vehicle");})();');
  await w.requestVehicle();assert.equal(loaded.searchParams.get('v'),'1.6.136');
});
test('the stations bridge cannot start an obsolete vehicle-loader request',t=>{
  const dom=new JSDOM('<body><iframe></iframe></body>',{url:'https://game.example.test/response-simulator/mobile/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,frame=w.document.querySelector('iframe'),game=frame.contentWindow;
  game.initializeSimulator=()=>{};game.toggleAllLocations=()=>{};
  const source=read('shared/stations.js');
  const loader=source.slice(source.indexOf('  function loadSimulatorTool('),source.indexOf('  function installMobileLayoutPolish('));
  const patch=source.slice(source.indexOf('  function patchSimulator('),source.indexOf('    const apply = async () => {'))+'}';
  w.eval('var VERSION="1.6.13",CACHE_VERSION="1.6.136",sourceUrl="https://game.example.test/shared/stations.js?v=1.6.136";function installMobileLayoutPolish(){}function removeLegacyEditorControls(){}'+loader+patch+';patchSimulator(document.querySelector("iframe"),{});');
  const loaded=new URL(game.document.querySelector('script[data-ptbo-vehicle-instruments]').src);
  assert.equal(loaded.searchParams.get('v'),'1.6.136');
});
