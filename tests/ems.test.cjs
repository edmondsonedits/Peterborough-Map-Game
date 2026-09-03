'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const config = require('../response-simulator/service-config.js');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html = read('response-simulator/index.html');
const roads = JSON.parse(read('city-explorer/data/osm-public-roads.geojson'));

function node(id='') {
  return {id,value:id==='sld-size'?10:5,checked:true,disabled:false,style:{},dataset:{},children:[],attributes:{},
    innerText:'',textContent:'',className:'',
    get innerHTML(){return this._html ?? this.textContent.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');},
    set innerHTML(value){this._html=value;},
    setAttribute(key,value){this.attributes[key]=value;},getAttribute(key){return this.attributes[key];},
    addEventListener(){},dispatchEvent(){},appendChild(child){this.children.push(child);},replaceChildren(...children){this.children=children;},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},querySelector:()=>null,closest:()=>null};
}
function game() {
  let time=0,serial=0;
  const timers=new Map(),intervals=new Map(),elements=new Map(),spoken=[],alerts=[];
  const filters=[...html.matchAll(/data-sub="([^"]+)" checked/g)].map(match=>{
    const box=node();box.dataset.sub=match[1];box.attributes['data-sub']=match[1];return box;
  });
  const element=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
  const c=vm.createContext({console,URL,performance:{now:()=>time},Event:class{},CustomEvent:class{},
    setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{intervals.set(++serial,fn);return serial;},clearInterval:id=>intervals.delete(id),
    requestAnimationFrame(){},addEventListener(){},dispatchEvent(){},
    localStorage:{getItem:()=>null,setItem(){}},
    document:{addEventListener(){},getElementById:element,querySelector:()=>null,querySelectorAll:selector=>selector==='.filter-chk'?filters:selector==='.filter-chk:checked'?filters.filter(x=>x.checked):[],
      createElement:()=>node(),documentElement:{dataset:{}},head:node(),body:node()},
    parent:{document:{documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[]},ptboSetSelectedStation(){}},
    L:{divIcon:options=>options,circle:(_point,options)=>({options,addTo(){return this;},setStyle(){}})},
    alert:message=>alerts.push(message),fetch:async()=>({ok:true,json:async()=>roads}),
  });
  c.window=c;
  vm.runInContext(read('response-simulator/service-config.js'),c);
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=/.test(match[1]))vm.runInContext(match[2],c);
  c.map={getZoom:()=>19,setView(){},invalidateSize(){},removeLayer(){},
    distance:(a,b)=>Math.hypot((a[0]-b[0])*110540,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180))};
  c.marker={setLatLng(){},setRotationOrigin(){},setRotationAngle(){},setIcon(icon){this.icon=icon;}};
  c.speak=message=>spoken.push(message);
  vm.runInContext('mapInstance=map;vehicleMarker=marker;updateMapOrientation=()=>{};playDispatchAudioText=speak;',c);
  vm.runInContext(read('response-simulator/service-mode.js'),c);
  const run=source=>vm.runInContext(source,c);
  function advance(ms){time+=ms;for(const fn of intervals.values())fn();}
  function transition(){const id=run('sceneTransitionTimer');const fn=timers.get(id);assert.ok(fn);timers.delete(id);advance(4000);fn();}
  function arrive(){run('simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();');}
  return {c,run,filters,element,timers,intervals,spoken,alerts,advance,transition,arrive,service:c.PTBO_SERVICE};
}

test('choosing EMS changes bases and chassis and disables only alarm defaults; Fire preferences survive switching',()=>{
  const g=game();g.service.select('fire');
  g.filters.find(box=>box.dataset.sub==='Water & Ice Rescue').checked=false;
  g.service.select('ems');
  assert.equal(g.service.getBases().length,2);
  assert.equal(g.service.getBase().address,'310 Armour Rd');
  assert.match(g.c.marker.icon.className,/ambulance-container/);
  assert.match(g.c.marker.icon.html,/#2563eb/);
  for(const box of g.filters)assert.equal(box.checked,!config.alarmCategories.includes(box.dataset.sub));
  assert.equal(g.service.spawn(2),true);
  assert.equal(g.service.getBase().address,'1003 Clonsilla Ave');
  assert.equal(g.service.spawn(3),false);
  g.service.select('fire');
  assert.equal(g.service.getBases().length,3);
  assert.match(g.c.marker.icon.className,/fire-container/);
  assert.equal(g.filters.find(box=>box.dataset.sub==='Water & Ice Rescue').checked,false);
  assert.equal(g.filters.find(box=>box.dataset.sub==='Auto Alarm / Vehicle Fire').checked,true);
});

test('dispatch and movement wait for the initial service choice',()=>{
  const g=game();g.run('keys.w=true;simulationStep();triggerDispatchWorkflow();');
  assert.equal(g.run('velocity'),0);assert.equal(g.run('activeIncident'),null);
});

test('EMS call requires scene pickup and hospital delivery before one completion and Next Call',()=>{
  const g=game();g.service.select('ems');g.run('triggerDispatchWorkflow()');
  assert.equal(g.run('simulationState'),1);g.advance(12000);g.arrive();
  assert.equal(g.run('mission.phase'),'pickup');assert.equal(g.run('totalTrackedCalls'),0);
  assert.equal(g.element('hud-action-btn').disabled,true);
  g.run('triggerDispatchWorkflow();completeAssignment();');assert.equal(g.run('mission.phase'),'pickup');
  g.transition();assert.equal(g.run('simulationState'),4);assert.equal(g.run('mission.phase'),'transport');
  assert.equal(g.run('activeIncident.sub'),'Hospital Transport');
  assert.equal(g.run('totalTrackedCalls'),0);assert.equal(g.element('hud-action-btn').disabled,true);
  assert.match(g.element('hud-content').innerHTML,/PRHC|Peterborough Regional/);
  g.advance(18000);g.arrive();assert.equal(g.run('mission.phase'),'handover');
  assert.equal(g.run('totalTrackedCalls'),0);g.transition();
  assert.equal(g.run('totalTrackedCalls'),1);assert.equal(g.element('hud-action-btn').innerText,'Next Call');
  assert.equal(g.run('mission.responseMs'),12000);assert.equal(g.run('mission.transportMs'),18000);
  g.run('executeIncidentArrivalProcedures();completeAssignment();');assert.equal(g.run('totalTrackedCalls'),1);
  g.run('triggerDispatchWorkflow()');assert.equal(g.run('mission.phase'),'response');
  assert.equal(g.alerts.length,0);
});

test('Fire still completes at the scene without a hospital leg',()=>{
  const g=game();g.service.select('fire');g.run('triggerDispatchWorkflow()');g.advance(7000);g.arrive();g.transition();
  assert.equal(g.run('simulationState'),3);assert.equal(g.run('totalTrackedCalls'),1);
  assert.equal(g.run('mission.transportMs'),0);assert.equal(g.element('hud-action-btn').innerText,'Next Call');
});

test('changing service or base cancels delayed pickup and cannot award an old call',()=>{
  for(const action of ['service','base']) {
    const g=game();g.service.select('ems');g.run('triggerDispatchWorkflow()');g.arrive();
    const stale=[...g.timers.values()][0];
    if(action==='service')g.service.select('fire');else g.service.spawn(2);
    assert.equal(g.timers.size,0);assert.equal(g.intervals.size,0);
    g.run('triggerDispatchWorkflow()');stale();
    assert.equal(g.run('simulationState'),1);assert.equal(g.run('mission.phase'),'response');
    assert.equal(g.run('totalTrackedCalls'),0);
  }
});

test('switching to Fire during transport removes hospital target and resets the assignment',()=>{
  const g=game();g.service.select('ems');g.run('triggerDispatchWorkflow()');g.arrive();g.transition();
  g.service.select('fire');assert.equal(g.run('activeIncident'),null);assert.equal(g.run('mission'),null);
  assert.equal(g.run('simulationState'),0);assert.equal(g.run('totalTrackedCalls'),0);
});

test('EMS radio identifies ambulance crews and hospital transport; Fire retains station wording',()=>{
  const g=game();vm.runInContext(read('response-simulator/dispatch-voice-bridge-1.4.2.js'),g.c);
  g.service.select('ems');
  assert.match(g.c.buildPeterboroughDispatchPhrase({name:'Test scene',addr:'Main St',sub:'Difficulty Breathing'}),/Ambulance crew from Armour Road/);
  assert.match(g.c.buildPeterboroughDispatchPhrase(config.hospital),/Proceed to Peterborough Regional Health Centre/);
  g.service.select('fire');
  assert.match(g.c.buildPeterboroughDispatchPhrase({sub:'Structure Fire',name:'House',addr:'Main St'}),/All stations/);
});

test('both EMS base exits and hospital target connect to the shipped road network',async()=>{
  const g=game();vm.runInContext(read('response-simulator/road-collision-core.js'),g.c);await g.c.PTBO_ROAD_COLLISION.ready;
  for(const base of config.profiles.ems.bases) {
    const nearest=g.c.PTBO_ROAD_COLLISION.nearestRoad(base.lat,base.lng,120);
    assert.ok(nearest&&nearest.distance<120,`${base.name} needs an exit within 120 m`);
    assert.equal(g.c.PTBO_ROAD_COLLISION.beginStationExit(base.lat,base.lng),true);
  }
  const h=config.hospital;
  assert.equal(g.c.PTBO_ROAD_COLLISION.isPointDrivable(h.lat,h.lng),true);
  g.service.select('ems');g.run('triggerDispatchWorkflow()');g.arrive();g.transition();
  g.run('simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;simulationStep();');
  assert.equal(g.run('mission.phase'),'handover','hospital arrival must run through the collision-wrapped physics step');
});

test('EMS settings can re-enable alarms without losing that choice when switching services',()=>{
  const g=game();g.service.select('ems');
  const alarm=g.filters.find(box=>box.dataset.sub==='Auto Alarm / Vehicle Fire');alarm.checked=true;
  g.service.select('fire');g.service.select('ems');assert.equal(alarm.checked,true);
});

test('route guidance can calculate a connected hospital trip from each EMS base',async()=>{
  const g=game();
  vm.runInContext(read('response-simulator/route-reveal.js'),g.c);
  await g.c.PTBO_ROUTE_REVEAL.ready;
  for(const base of config.profiles.ems.bases) {
    const route=g.c.PTBO_ROUTE_REVEAL.calculateRoute(base.lat,base.lng,config.hospital.lat,config.hospital.lng);
    assert.ok(route&&route.coordinates.length>2,base.name);
    assert.ok(route.distance>500,base.name);
  }
});
