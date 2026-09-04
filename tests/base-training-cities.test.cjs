'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cities = ['oshawa','belleville','scarborough','pickering','markham','toronto'];

function browserContext(extra = {}) {
  const events = [], nodes = [], storage = new Map();
  const ctx = vm.createContext({
    console, URL, AbortController, setTimeout, clearTimeout, queueMicrotask,
    performance:{now:()=>0},
    CustomEvent:class { constructor(type,options){this.type=type;this.detail=options?.detail;} },
    location:{href:'https://example.com/response-simulator/index.html?city=test'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    document:{currentScript:{src:'https://example.com/cities/preview-package-factory.js'},readyState:'complete',documentElement:{dataset:{}},head:{appendChild:node=>nodes.push(node)},body:{appendChild:node=>nodes.push(node)},createElement:tag=>({tagName:String(tag).toUpperCase(),dataset:{},setAttribute(){},addEventListener(){},remove(){}}),getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},
    dispatchEvent:event=>events.push(event),addEventListener(){},...extra,
  });
  ctx.window=ctx;ctx.parent=ctx;ctx.__events=events;return ctx;
}

const noChangesDiff = (before,after) => ({
  schema:1,
  updated:[],
  added:after.filter(item=>!before.some(seed=>seed.id===item.id)),
  deleted:[],
});

test('city registry exposes Peterborough full dispatch plus six base-training cities', () => {
  const c=browserContext();vm.runInContext(read('cities/city-registry.js'),c);assert.equal(c.PTBO_CITIES.length,7);
  const peterborough=c.PTBO_CITIES.find(city=>city.id==='peterborough');assert.equal(peterborough.playable,true);assert.equal(peterborough.status,'playable');
  for(const id of cities){const city=c.PTBO_CITIES.find(item=>item.id===id);assert.ok(city,id);assert.equal(city.playable,true,id);assert.equal(city.status,'base-training',id);assert.match(city.note,/Calls unavailable/i,id);assert.ok(city.dispatch.desktop&&city.dispatch.mobile,id)}
});

test('every base-training city ships a v1.6.13 package and deliberately empty dispatch descriptor', () => {
  for(const id of cities){const packageSource=read(`cities/${id}/package.js`),dispatchSource=read(`cities/${id}/dispatch-data.js`);assert.match(packageSource,/const VERSION='1\.6\.13'/,id);assert.match(packageSource,/PTBO_PREVIEW_CITY_FACTORY/,id);assert.match(dispatchSource,/available:false/,id)}
});

test('every base-training city has packaged coordinates for startup without live services', () => {
  for(const id of cities){const source=read(`cities/${id}/package.js`);assert.match(source,/lat:\d/,`${id} latitude`);assert.match(source,/lng:-\d/,`${id} longitude`);if(!['oshawa','pickering'].includes(id))assert.match(source,/preferFallback:true|type:'static'/,`${id} packaged source`)}
});

test('all six base-training city packages start when every external request fails', async () => {
  for(const id of cities){
    let fetchCount=0;
    const c=browserContext({fetch:async()=>{fetchCount+=1;throw new Error('network unavailable')}});
    vm.runInContext(read('cities/preview-package-factory.js'),c);
    c.document.currentScript.src=`https://example.com/cities/${id}/package.js`;
    vm.runInContext(read(`cities/${id}/package.js`),c);
    await Promise.race([c.PTBO_CITY_PACKAGE_READY,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${id} timed out`)),100))]);
    assert.equal(c.PTBO_CITY_PACKAGE.id,id);
    assert.ok(c.PTBO_SERVICE_CONFIG.profiles.fire.bases.length,`${id} fire bases`);
    assert.ok(c.PTBO_SERVICE_CONFIG.profiles.ems.bases.length,`${id} EMS bases`);
    assert.equal(fetchCount,0,`${id} startup must not call external services`);
  }
});

test('preview package factory resolves Fire and EMS bases while keeping calls and road protection disabled', async () => {
  const c=browserContext();vm.runInContext(read('cities/preview-package-factory.js'),c);c.document.currentScript.src='https://example.com/cities/test/package.js';
  const config={id:'test',name:'Test City',sourceUrl:new URL('https://example.com/cities/test/package.js'),map:{defaultCenter:[44,-79],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.5,-79.5],[44.5,-78.5]]},sources:{fire:{type:'static',entries:[{number:1,name:'Fire Station 1',address:'1 Fire Rd',lat:44.01,lng:-79.01}]},ems:{type:'static',entries:[{number:1,name:'Paramedic Base 1',address:'1 EMS Rd',lat:44.02,lng:-79.02}]}}};
  await c.PTBO_PREVIEW_CITY_FACTORY.create(config);assert.equal(c.PTBO_CITY_PACKAGE.features.baseTraining,true);assert.equal(c.PTBO_CITY_PACKAGE.dispatch.available,false);assert.equal(c.PTBO_CITY_PACKAGE.roads.available,false);assert.equal(c.PTBO_SERVICE_CONFIG.profiles.fire.bases.length,1);assert.equal(c.PTBO_SERVICE_CONFIG.profiles.ems.bases.length,1);assert.equal(c.PTBO_ROAD_COLLISION.state.enabled,false);assert.equal(c.PTBO_ROAD_COLLISION.isPointDrivable(0,0),true);
});

test('duplicate Oshawa EMS names receive unique IDs and survive the strict base store', async () => {
  const gisPayload={features:[
    {attributes:{NAME:'Oshawa Paramedic Base',ADDRESS:'100 First St',TOWN:'OSHAWA',MUNICIPALITY:'OSHAWA'},geometry:{x:-78.861,y:43.901}},
    {attributes:{NAME:'Oshawa Paramedic Base',ADDRESS:'200 Second St',TOWN:'OSHAWA',MUNICIPALITY:'OSHAWA'},geometry:{x:-78.872,y:43.912}},
  ]};
  const c=browserContext({fetch:async()=>({ok:true,status:200,json:async()=>gisPayload}),PTBO_LOCATION_CHANGES:{diff:noChangesDiff}});
  vm.runInContext(read('cities/preview-package-factory.js'),c);
  c.document.currentScript.src='https://example.com/cities/oshawa/package.js';
  const config={id:'oshawa',name:'Oshawa',sourceUrl:new URL('https://example.com/cities/oshawa/package.js'),map:{defaultCenter:[43.8971,-78.8658],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.83,-78.98],[44.01,-78.76]]},sources:{fire:{type:'static',entries:[{number:1,name:'Fire Station 1',shortName:'Stn 1',address:'199 Adelaide Ave W',lat:43.900,lng:-78.870}]},ems:{type:'durham-paramedic',municipality:'OSHAWA',url:'https://example.com/durham/9',outFields:'NAME,ADDRESS,TOWN,MUNICIPALITY'}}};
  await c.PTBO_PREVIEW_CITY_FACTORY.create(config);
  const imported=c.PTBO_SERVICE_CONFIG.profiles.ems.bases;
  assert.equal(imported.length,2);assert.equal(new Set(imported.map(base=>base.id)).size,2,'imported EMS base IDs must be unique');assert.equal(new Set(imported.map(base=>base.number)).size,2,'imported EMS base numbers must be unique');
  vm.runInContext(read('shared/base-locations.js'),c);
  const stored=c.PTBO_BASE_STORE.getBases('ems');assert.equal(stored.length,2);assert.equal(new Set(stored.map(base=>base.id)).size,2,'base store must preserve unique repaired IDs');
});

test('base store independently repairs duplicate source IDs as a defensive fallback', () => {
  const fire=[{id:'duplicate',number:1,name:'Station A',shortName:'A',address:'1 A St',lat:44.01,lng:-79.01},{id:'duplicate',number:2,name:'Station B',shortName:'B',address:'2 B St',lat:44.02,lng:-79.02}];
  const ems=[{id:'duplicate',number:1,name:'Base C',shortName:'C',address:'3 C St',lat:44.03,lng:-79.03}];
  const hospital={id:'none',name:'Unavailable',addr:'Unavailable',lat:44,lng:-79,radius:30};
  const c=browserContext({PTBO_CITY_PACKAGE:{id:'test',name:'Test City',features:{baseTraining:true},roads:{center:[44,-79]},map:{defaultCenter:[44,-79]}},PTBO_SERVICE_CONFIG:{profiles:{fire:{id:'fire',bases:fire},ems:{id:'ems',bases:ems}},hospital,alarmCategories:[]},PTBO_LOCATION_CHANGES:{diff:noChangesDiff}});
  assert.doesNotThrow(()=>vm.runInContext(read('shared/base-locations.js'),c));const all=c.PTBO_BASE_STORE.getAll();assert.equal(all.length,3);assert.equal(new Set(all.map(base=>base.id)).size,3);
});

test('base store refreshes when an asynchronous city package fills its base arrays', () => {
  const fire=[],ems=[],hospital={id:'none',name:'Unavailable',addr:'Unavailable',lat:44,lng:-79,radius:30};
  const c=browserContext({PTBO_CITY_PACKAGE:{id:'test',name:'Test City',features:{baseTraining:true},roads:{center:[44,-79]},map:{defaultCenter:[44,-79]}},PTBO_SERVICE_CONFIG:{profiles:{fire:{id:'fire',bases:fire},ems:{id:'ems',bases:ems}},hospital,alarmCategories:[]},PTBO_LOCATION_CHANGES:{diff:noChangesDiff}});
  vm.runInContext(read('shared/base-locations.js'),c);assert.equal(c.PTBO_BASE_STORE.getAll().length,0);fire.push({id:'fire-1',number:1,name:'Fire Station 1',shortName:'Stn 1',address:'1 Fire Rd',lat:44.01,lng:-79.01,yardSize:120,yardRotation:0});ems.push({id:'ems-1',number:1,name:'Paramedic Base 1',shortName:'Base 1',address:'1 EMS Rd',lat:44.02,lng:-79.02,yardSize:120,yardRotation:0});assert.equal(c.PTBO_BASE_STORE.refreshFromCityPackage(),true);assert.equal(c.PTBO_BASE_STORE.getBases('fire').length,1);assert.equal(c.PTBO_BASE_STORE.getBases('ems').length,1);
});

test('v1.6.17 readiness uses bounded stale-safe module loading', () => {
  const readiness=read('response-simulator/simulator-readiness-1.6.17.js');
  assert.match(readiness,/const VERSION = '1\.6\.17'/);
  assert.match(readiness,/SCRIPT_TIMEOUT_MS = 6000/);
  assert.match(readiness,/existing\.remove\(\)/);
  assert.match(readiness,/Timed out loading/);
  assert.match(readiness,/PTBO_SIMULATOR_READY_ERROR/);
  assert.match(readiness,/roadRequired\s*=\s*city\.features\?\.roadBoundaries\s*!==\s*false/);
  assert.match(readiness,/base-training-free-drive/);
  assert.match(readiness,/installFreeDriveRoadApi/);
  assert.match(readiness,/waitForAuthoritativeRuntime/);
  assert.match(readiness,/PTBO_STARTUP_STAGE/);
  assert.match(readiness,/waiting-compact-settings/);
});

test('v1.6.17 vehicle bootstrap cannot wait forever on nested steering modules', () => {
  const source=read('response-simulator/vehicle-instruments.js');
  assert.match(source,/const VERSION = '1\.6\.17'/);
  assert.match(source,/SCRIPT_TIMEOUT_MS = 6000/);
  assert.match(source,/Timed out loading/);
  assert.match(source,/data-ptbo-bootstrap-file/);
  assert.match(source,/existing\.remove\(\)/);
});

test('base-training mode permanently blocks every dispatch entry point', () => {
  const source=read('response-simulator/base-training-mode-1.6.8.js');for(const name of ['triggerDispatchWorkflow','fireRandomIncidentDispatch','toggleAllLocations','recordCurrentLocation','exportUpdatedDatabase'])assert.match(source,new RegExp(`window\\.${name}=blockedDispatch`),name);assert.match(source,/Calls Unavailable/);assert.match(source,/Dispatch calls unavailable/);assert.match(source,/const VERSION = '1\.6\.13'/);
});

test('v1.6.17 enhancement loader creates readiness before releasing the city runtime gate', () => {
  const build=read('shared/build-version.js'),runtime=read('response-simulator/city-runtime-bootstrap-1.6.17.js'),service=read('response-simulator/service-selection.js');
  assert.match(build,/const VERSION = '1\.6\.17'/);
  assert.match(build,/simulator-readiness-1\.6\.17\.js/);
  assert.match(build,/city-runtime-bootstrap-1\.6\.17\.js/);
  assert.match(build,/data-ptbo-simulator-readiness/);
  assert.ok(build.indexOf('simulator-readiness-1.6.17.js') < build.indexOf('city-runtime-bootstrap-1.6.17.js'),'readiness script must load before city runtime resolves');
  assert.match(build,/readiness-gate-created/);
  assert.match(build,/PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION/);
  assert.match(build,/Timed out loading/);
  assert.match(build,/optionalInnerModule/);
  assert.match(build,/PTBO_ENHANCEMENT_STAGE/);
  assert.match(build,/void optionalInnerModule\(doc, 'ptbo-base-training-mode'/);
  assert.doesNotMatch(build,/if\s*\(baseTraining\)\s*await\s+injectIntoFrame/);
  assert.match(runtime,/const VERSION = '1\.6\.17'/);assert.match(runtime,/PTBO_CITY_RUNTIME_READY_VERSION/);assert.match(runtime,/PTBO_BASE_STORE/);assert.match(runtime,/PTBO_SERVICE/);assert.doesNotMatch(runtime,/function loadScript|loadScript\(/);assert.match(runtime,/loader:\s*'service-config'/);assert.match(runtime,/PTBO_STARTUP_STAGE/);
  assert.match(service,/runtimeReady\(game\)/);assert.match(service,/PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION/);
});

test('desktop and mobile request v1.6.17 startup assets and keep bounded wrapper injection', () => {
  for(const file of ['response-simulator/play/index.html','response-simulator/mobile/index.html']){
    const source=read(file);
    assert.match(source,/1\.6\.17/,file);
    assert.match(source,/url\.searchParams\.set\('city',city\)/,file);
    assert.match(source,/url\.searchParams\.set\('fresh'/,file);
    assert.match(source,/startup-trace-1\.6\.17\.js\?v=1\.6\.17/,file);
    assert.match(source,/shared\/build-version\.js\?v=1\.6\.17/,file);
    assert.match(source,/Timed out loading/,file);
    assert.match(source,/diagnostic/,file);
    assert.match(source,/startupPoll/,file);
    assert.match(source,/PTBO_STARTUP_TRACE/,file);
    assert.doesNotMatch(source,/loading\.innerHTML=`<div><strong>Simulator did not finish loading/);
  }
});

test('v1.6.17 startup trace distinguishes missing readiness from a readiness failure', () => {
  const source=read('response-simulator/startup-trace-1.6.17.js');
  assert.match(source,/Live startup trace/);
  assert.match(source,/PTBO_SIMULATOR_READY_ERROR/);
  assert.match(source,/simulator-readiness script has not created its startup gate/);
  assert.match(source,/PTBO_CITY_RUNTIME_READY_VERSION/);
  assert.match(source,/PTBO_ENHANCEMENT_STAGE/);
  assert.match(source,/PTBO_BUILD_ERRORS/);
  assert.match(source,/Inner-frame JavaScript error/);
  assert.match(source,/unchanged for/);
});

test('city selector launches with a fresh URL so mobile caches cannot replay an old wrapper', () => {
  const source=read('shared/city-selector.js');assert.match(source,/const VERSION = '1\.6\.13'/);assert.match(source,/url\.searchParams\.set\('fresh', String\(Date\.now\(\)\)\)/);
});

test('production wrapper build is v1.6.17 while packaged inner assets remain compatible with v1.6.13', () => {
  assert.match(read('shared/build-version.js'),/const VERSION = '1\.6\.17'/);assert.match(read('shared/base-locations.js'),/const VERSION = '1\.6\.13'/);assert.match(read('index.html'),/shared\/build-version\.js\?v=1\.6\.13/);assert.match(read('cities/preview-package-factory.js'),/const VERSION = '1\.6\.13'/);assert.match(read('cities/peterborough/package.js'),/const VERSION = '1\.6\.13'/);assert.match(read('response-simulator/vehicle-instruments.js'),/const VERSION = '1\.6\.17'/);
});

test('inner simulator initialization is idempotent for wrapper polling', () => {
  assert.match(read('response-simulator/index.html'),/function initializeSimulator\(\) \{\s+if \(mapInstance\) return;/);
});

test('inner simulator loads its mapping runtime locally without a blocking CDN dependency', () => {
  const source=read('response-simulator/index.html');assert.doesNotMatch(source,/unpkg\.com\/leaflet/);for(const file of ['leaflet.js','leaflet.css','leaflet.edgebuffer.js','leaflet.rotatedMarker.js']){assert.ok(source.includes(`vendor/leaflet-1.9.4/${file}?v=1.6.13`),file);assert.ok(fs.statSync(path.join(root,'response-simulator/vendor/leaflet-1.9.4',file)).size>100,file)}
});
