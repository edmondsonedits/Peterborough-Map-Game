'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const gearbox = require('../response-simulator/gearbox-core.js');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function button(id) {
  const classes = new Set();
  return {id, childNodes:[{nodeType:3,nodeValue:'Gas'}], disabled:false, hidden:false, attributes:{},
    classList:{add:x=>classes.add(x), remove:x=>classes.delete(x), toggle(x,value){if(value)classes.add(x);else classes.delete(x);}},
    setAttribute(key,value){this.attributes[key]=value;}, setPointerCapture(){}, contains(){return false;},
    getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
}
function simulator() {
  const controls = Object.fromEntries(['steering','gas-pedal','gear-down','gear-limit','reverse-pedal'].map(id=>[id,button(id)]));
  const parentEvents = {}, gameEvents = {};
  const addEvent = (events,type,fn) => (events[type] ||= []).push(fn);
  const parentDocument = {documentElement:{dataset:{}},getElementById:id=>controls[id]||null,
    querySelector:()=>null,addEventListener:(type,fn)=>addEvent(parentEvents,type,fn)};
  const telemetry = {};
  const c = vm.createContext({ console, Node:{TEXT_NODE:3},
    setTimeout:()=>0, requestAnimationFrame(){},
    localStorage:{getItem:()=> '1',setItem(){}},
    document:{getElementById:id=>id==='sld-speed'?{value:5}:id.startsWith('tel-')?(telemetry[id]||={}):null,
      createElement:()=>({}),head:{appendChild(){}},documentElement:{}},
    parent:{document:parentDocument,navigator:{},addEventListener(){}},
    addEventListener:(type,fn)=>addEvent(gameEvents,type,fn),
    keys:{ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false,w:false,a:false,s:false,d:false},
    simLat:44.30,simLng:-78.32,velocity:0,currentHeading:0,lastTimestamp:null,
    simulationState:'idle',STATES:{ENROUTE:'enroute'},vehicleMarker:null,
    mapInstance:{options:{},zoom:19,getZoom(){return this.zoom;},setView(_point,zoom){this.zoom=zoom;}},
    updateMapOrientation(){},evaluateDistanceToTarget(){},
    PTBO_GEARBOX:gearbox,PTBO_ARCADE_HANDLING:{state:{installed:false,settings:{}}},
    PTBO_VEHICLE_INSTRUMENTS:{state:{steeringMode:'directional'},setSteeringMode(){}},
  });
  c.window=c;
  const html=source('response-simulator/index.html');
  vm.runInContext(html.slice(html.indexOf('const FIXED_STEP_MS'),html.indexOf('window.addEventListener("keydown"')),c);
  vm.runInContext(source('response-simulator/directional-drive-zoom-1.5.8.js'),c);
  const api=c.PTBO_DIRECTIONAL_DRIVE_ZOOM;
  assert.equal(api.state.installed,true);
  function event(type,target,extra={}) {
    const e={target,pointerId:1,clientX:50,clientY:0,detail:1,preventDefault(){},stopImmediatePropagation(){},...extra};
    for(const fn of parentEvents[type]||[]) fn(e);
  }
  function gear(number){while(api.state.currentGear<number)api.shiftUp();while(api.state.currentGear>number)api.shiftDown();}
  return {c,api,controls,event,gear,gameEvents,speed:()=>c.velocity*gearbox.velocityToKmh};
}

test('six gear limits are exactly 50, 100, 150, 200, 250 and 999 km/h',()=>{
  assert.deepEqual(gearbox.gearSpeedsKmh,[50,100,150,200,250,999]);
});

test('every gear reaches and holds its limit through the real simulation step',()=>{
  const s=simulator();
  s.event('pointerdown',s.controls.steering);
  for(let gear=1;gear<=6;gear++) {
    s.gear(gear);
    const cap=gearbox.speedForGear(gear);
    for(let i=0;i<4500;i++) {
      const before=s.speed();
      s.c.simulationStep();
      assert.ok(s.speed()>=before-1e-8);
      assert.ok(s.speed()<=cap+1e-8);
      assert.ok(s.speed()-before<=18/60+0.001);
    }
    assert.ok(Math.abs(s.speed()-cap)<0.001,`Gear ${gear} reached ${s.speed()}`);
  }
});

test('gear six adds a steady 12 km/h per second and stops at 999',()=>{
  const s=simulator();s.gear(6);s.c.velocity=250/gearbox.velocityToKmh;
  s.event('pointerdown',s.controls.steering);
  for(let i=0;i<180;i++)s.c.simulationStep();
  assert.ok(Math.abs(s.speed()-286)<1e-8);
  s.c.velocity=998/gearbox.velocityToKmh;
  for(let i=0;i<600;i++)s.c.simulationStep();
  assert.ok(Math.abs(s.speed()-999)<1e-8);
});

test('downshifting preserves current speed, then slows smoothly to the lower cap',()=>{
  const s=simulator();s.gear(6);s.c.velocity=500/gearbox.velocityToKmh;
  s.event('pointerdown',s.controls.steering);
  assert.equal(s.api.shiftDown(),true);
  assert.ok(Math.abs(s.speed()-500)<1e-8);
  s.c.simulationStep();
  assert.ok(s.speed()<500&&s.speed()>499);
  for(let i=0;i<900;i++) {
    const before=s.speed();s.c.simulationStep();
    assert.ok(before-s.speed()<=45/60+0.001);
    assert.ok(s.speed()>=250-1e-8);
  }
  assert.ok(Math.abs(s.speed()-250)<0.001);
});

test('pointer and keyboard shifts work once, clamp at both ends, and preserve thumbstick drive',()=>{
  const s=simulator();s.event('pointerdown',s.controls.steering,{pointerId:10});
  assert.equal(s.controls['gear-down'].disabled,true);
  s.event('pointerdown',s.controls['gas-pedal'],{pointerId:20});
  s.event('pointerup',s.controls['gas-pedal'],{pointerId:20});
  s.event('click',s.controls['gas-pedal']);
  assert.equal(s.api.state.currentGear,2);
  assert.equal(s.api.state.directionalDriveActive,true);
  s.event('click',s.controls['gas-pedal'],{detail:0});
  assert.equal(s.api.state.currentGear,3);
  s.event('pointerdown',s.controls['gear-down'],{pointerId:20});
  s.event('pointerup',s.controls['gear-down'],{pointerId:20});
  s.event('click',s.controls['gear-down']);
  assert.equal(s.api.state.currentGear,2);
  s.gear(6);assert.equal(s.api.shiftUp(),false);
  assert.equal(s.controls['gas-pedal'].disabled,true);
  s.gear(1);assert.equal(s.api.shiftDown(),false);
  assert.equal(s.controls['gear-down'].disabled,true);
  assert.equal(s.controls['gear-limit'].textContent,'50 km/h');
});

test('gear driving remains identical at 30, 60 and 120 render FPS',()=>{
  const run=fps=>{
    const s=simulator();s.gear(6);s.event('pointerdown',s.controls.steering);
    for(let frame=0;frame<=fps*12;frame++)s.c.simulationLoop(frame*1000/fps);
    return [s.speed(),s.c.simLat,s.c.simLng];
  };
  assert.deepEqual(run(30),run(60));assert.deepEqual(run(120),run(60));
});

test('releasing the thumbstick coasts; reverse brakes through zero; collisions do not restore old speed',()=>{
  const s=simulator();s.gear(6);s.c.velocity=100/gearbox.velocityToKmh;
  s.event('pointerdown',s.controls.steering);s.event('pointerup',s.controls.steering);
  s.c.simulationStep();assert.ok(s.speed()<100&&s.speed()>99);
  s.c.keys.ArrowDown=true;
  for(let i=0;i<600;i++)s.c.simulationStep();
  assert.ok(s.speed()<0&&s.speed()>=-30);
  s.c.keys.ArrowDown=false;s.c.velocity=5/gearbox.velocityToKmh;
  s.event('pointerdown',s.controls.steering);s.c.simulationStep();
  assert.ok(s.speed()<5.3);
});

test('standard steering retains its Gas pedal and does not use the gearbox controller',()=>{
  const s=simulator();s.gear(6);s.c.PTBO_VEHICLE_INSTRUMENTS.state.steeringMode='standard';
  for(const fn of s.gameEvents['ptbo-steering-mode-change'])fn();
  assert.equal(s.controls['gas-pedal'].disabled,false);
  assert.equal(s.controls['gear-down'].hidden,true);
  assert.equal(s.controls['gas-pedal'].attributes['aria-label'],'Gas');
  assert.equal(s.api.driveStep(1/60),false);
});

test('reaching top or bottom gear releases the pressed button even if disabled buttons suppress pointerup',()=>{
  const s=simulator();s.gear(5);
  s.event('pointerdown',s.controls['gas-pedal'],{pointerId:1});
  assert.equal(s.api.state.currentGear,6);
  assert.equal(s.api.state.gasPointer,null);
  s.event('pointerdown',s.controls['gear-down'],{pointerId:2});
  assert.equal(s.api.state.currentGear,5);
  s.event('pointerup',s.controls['gear-down'],{pointerId:2});
  s.gear(2);s.event('pointerdown',s.controls['gear-down'],{pointerId:3});
  assert.equal(s.api.state.currentGear,1);assert.equal(s.api.state.gasPointer,null);
});
