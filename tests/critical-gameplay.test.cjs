'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sim = read('response-simulator/index.html');
const geo = read('geo-guesser/index.html');
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
function context(extra = {}) {
  const nodes = new Map();
  const ctx = vm.createContext({ console, URL, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame() {}, performance: { now: () => 0 },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: { currentScript: { src: 'https://example.com/shared/dispatch-locations.js' },
      querySelector: () => null, getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { value: 5, textContent: '', innerText: '' });
        return nodes.get(id);
      } },
    localStorage: { getItem: () => null, setItem() {} },
    location: { href: 'https://example.com/' }, dispatchEvent() {}, addEventListener() {},
    ...extra });
  ctx.window = ctx;
  return ctx;
}

test('all production HTML inline scripts and changed gameplay modules parse', () => {
  const html = ['index.html','dispatch-editor/index.html','response-simulator/index.html','response-simulator/play/index.html','response-simulator/mobile/index.html','geo-guesser/index.html','geo-guesser/desktop/index.html','geo-guesser/mobile/index.html'];
  for (const file of html) {
    for (const match of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc=/.test(match[1]) && !/type="module"/.test(match[1])) new vm.Script(match[2], { filename: file });
    }
  }
  for (const folder of ['shared','response-simulator','dispatch-editor']) {
    for (const name of fs.readdirSync(path.join(root, folder)).filter(n => n.endsWith('.js'))) {
      const source = read(`${folder}/${name}`);
      if (!/^\s*(import |export )/m.test(source)) new vm.Script(source, { filename: name });
    }
  }
});

test('random shifts draw ten unique calls even with no home-district calls', () => {
  const c = context();
  vm.runInContext(section(geo, 'function pickRandom(', '    initializeDistricts();'), c);
  for (const districts of [[2], [1,2,3]]) {
    const pool = Array.from({ length: 10 }, (_, i) => ({ id:i, district:districts[i % districts.length] }));
    for (let attempt = 0; attempt < 100; attempt++) {
      const chosen = c.chooseCalls(0, 10, pool);
      assert.equal(chosen.length, 10);
      assert.equal(new Set(chosen.map(x => x.id)).size, 10);
      assert.equal(pool.length, 10);
    }
  }
});

function drive(fps, mode) {
  const mobile = mode !== 'desktop';
  const c = context({ simLat:44.3091, simLng:-78.3197, velocity:0, currentHeading:0,
    keys:{ ArrowUp:true, ArrowRight: mode === 'desktop' }, lastTimestamp:null,
    vehicleMarker:null, mapInstance:null, simulationState:'idle', STATES:{ ENROUTE:'enroute' },
    updateMapOrientation() {}, evaluateDistanceToTarget() {},
    parent:{ location:{ pathname: mobile ? '/response-simulator/mobile/' : '/response-simulator/play/' } } });
  c.PTBO_VEHICLE_INSTRUMENTS = { state:{ mobileSteeringConnected:mobile,
    steeringMode:mode === 'directional' ? 'directional' : 'standard', steeringRaw:.5, steeringApplied:0 }, setSteeringMode() {} };
  c.PTBO_DIRECTIONAL_STEERING_TUNING = { state:{ pointerActive:true, targetHeading:90, stickMagnitude:.8 } };
  vm.runInContext(section(sim, 'const FIXED_STEP_MS', 'window.addEventListener("keydown"'), c);
  // Run the actual arcade and speed-streak modules, with only their UI surfaces stubbed.
  c.document.getElementById = id => id === 'sld-speed' ? {value:5} : id.startsWith('tel-') ? {} : null;
  vm.runInContext(read('response-simulator/arcade-handling-1.5.1.js'), c);
  vm.runInContext(read('response-simulator/speed-streak.js'), c);
  for (let frame=0; frame<=fps*5; frame++) c.simulationLoop(frame*1000/fps);
  return [c.simLat,c.simLng,c.velocity,c.currentHeading,c.PTBO_SPEED_STREAK.state.driveMilliseconds];
}
for (const mode of ['desktop','mobile','directional']) {
  test(`${mode} movement and steering agree at 30, 60 and 120 FPS`, () => {
    const baseline = drive(60, mode);
    for (const fps of [30,120]) drive(fps, mode).forEach((value,index) => assert.ok(Math.abs(value-baseline[index]) < 1e-10, `${mode} ${fps} FPS field ${index}: ${value} vs ${baseline[index]}`));
    assert.ok(baseline[2] > 0);
    assert.ok(baseline[3] !== 0);
  });
}

async function roads(geojson) {
  const c = context({ simLat:44.3091, simLng:-78.3197, velocity:.000001, currentHeading:0,
    vehicleMarker:null, mapInstance:null, simulationState:'enroute', STATES:{ENROUTE:'enroute'},
    simulationStep() {}, evaluateDistanceToTarget() {}, fetch:async () => ({ok:true,json:async () => geojson}) });
  c.document.getElementById = () => null;
  vm.runInContext(read('response-simulator/road-collision-core.js'), c);
  await c.PTBO_ROAD_COLLISION.ready;
  return c;
}
const lat = y => 44.3091+y/110540;
const lng = x => -78.3197+x/(111320*Math.cos(44.3091*Math.PI/180));
const road = (y,type) => ({ type:'Feature', properties:{highway:type}, geometry:{type:'LineString',coordinates:[[lng(-100),lat(y)],[lng(100),lat(y)]]} });

test('overlapping road widths remain drivable when the nearest narrow road excludes a point', async () => {
  const c = await roads({type:'FeatureCollection',features:[road(0,'service'),road(11,'primary')]});
  // y=5 is 5m from the narrow road (outside 4.35m) but 6m from the wide road (inside 7.85m).
  assert.equal(c.PTBO_ROAD_COLLISION.isPointDrivable(lat(5),lng(0)), true);
  assert.equal(c.PTBO_ROAD_COLLISION.isPointDrivable(lat(30),lng(0)), false);
});

test('all shipped calls receive a reachable arrival point without changing their location', async () => {
  const c = await roads(JSON.parse(read('city-explorer/data/osm-public-roads.geojson')));
  vm.runInContext(section(sim, 'function resolveIncidentArrival(', 'function escapeDispatchText('), c);
  const zlib = require('node:zlib');
  const payload = read('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD\s*=\s*'([^']+)'/)[1];
  const records = JSON.parse(zlib.gunzipSync(Buffer.from(payload,'base64')));
  let adjusted = 0;
  for (const record of records) {
    const before = JSON.stringify(record);
    const arrival = c.resolveIncidentArrival(record);
    assert.ok(arrival, record.name);
    const nearest = c.PTBO_ROAD_COLLISION.nearestRoad(arrival.lat, arrival.lng, 500);
    assert.ok(nearest.distance < arrival.radius, record.name);
    assert.equal(JSON.stringify(record), before);
    if (arrival.accessPoint) adjusted++;
  }
  assert.ok(adjusted > 0);
});

test('arrival uses the configured radius and road access point', () => {
  let arrivals = 0;
  const c = context({ activeIncident:{lat:1,lng:1}, activeArrivalPoint:{lat:2,lng:2}, activeArrivalRadius:80,
    simLat:2,simLng:2, simulationState:'enroute', STATES:{ENROUTE:'enroute'},
    mapInstance:{distance:(_from,to) => { assert.deepEqual(Array.from(to),[2,2]); return 65; }},
    executeIncidentArrivalProcedures:() => arrivals++ });
  vm.runInContext(section(sim, 'function evaluateDistanceToTarget()', 'window.onload =') || '',c);
  c.evaluateDistanceToTarget();
  assert.equal(arrivals,1);
});

test('failed persistence reports an error and leaves the previous store intact; export survives', async () => {
  const c = context();
  c.PTBO_DISPATCH_DATA_READY = Promise.resolve([{id:'a',name:'Original',lat:44.3,lng:-78.3,sources:['geo-guesser']}]);
  vm.runInContext(read('shared/dispatch-locations.js'),c);
  const store = c.PTBO_DISPATCH_STORE;
  await store.ready();
  const draft = [{id:'new',name:'Draft',lat:44.31,lng:-78.31,custom:true}];
  c.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  for (const mutation of [() => store.replaceAll(draft),() => store.upsert(draft[0]),() => store.remove('a'),() => store.reset()]) {
    assert.throws(mutation,/could not be saved/);
    assert.equal(store.getAll()[0].name,'Original');
  }
  const exported = context();
  vm.runInContext(store.exportText(draft),exported);
  assert.equal((await exported.PTBO_DISPATCH_DATA_READY)[0].name,'Draft');
  c.localStorage.setItem = () => {};
  store.replaceAll(draft);
  assert.equal(store.getAll()[0].name,'Draft');
});

test('editor-created calls are included when the Geo Guesser wrapper refreshes its data', async () => {
  const records = [{id:'geo',sources:['geo-guesser']},{id:'old-custom',sources:['shared-editor']},{id:'custom',custom:true},{id:'driving-only',sources:['driving-simulator']}];
  let injected;
  const child = { createElement: () => ({}), documentElement:{dataset:{}}, body:{appendChild:node => { injected=node.textContent; } } };
  const c = context({ PTBO_DISPATCH_DATA_READY:Promise.resolve(records) });
  c.top = {};
  c.document.createElement = () => ({});
  c.document.getElementById = () => ({contentDocument:{...child,readyState:'complete'},addEventListener(){}});
  c.PTBO_DISPATCH_STORE = {dataVersion:'1.4.20',ready:async()=>{},getAll:()=>records};
  for (const name of ['replaceAll','upsert','remove','createId','reset','exportText']) c.PTBO_DISPATCH_STORE[name]=()=>{};
  vm.runInContext(read('shared/dispatch-override-1.4.4.js'),c);
  await c.PTBO_DISPATCH_STORE.ready();
  await Promise.resolve();
  const game = context({locations:[]});
  vm.runInContext(injected,game);
  assert.deepEqual(Array.from(game.locations,x=>x.id),['geo','old-custom','custom']);
});

test('collision and arrival checks run per physics step, including free-driving mode', async () => {
  const c = await roads({type:'FeatureCollection',features:[road(0,'service')]});
  const api = c.PTBO_ROAD_COLLISION;
  let moved=0,arrived=0;
  api.state.originalLoop=()=>{moved++;c.simLat=lat(30);c.evaluateDistanceToTarget();};
  api.state.originalEvaluateDistance=()=>{arrived++;if(api.state.enabled)assert.ok(api.isPointDrivable(c.simLat,c.simLng));};
  for(let i=0;i<6;i++)c.simulationStep();
  assert.equal(moved,6);
  assert.equal(arrived,6);
  assert.ok(api.state.collisions>0);
  api.state.enabled=false;
  c.simulationStep();
  assert.equal(arrived,7);
});
