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
    document:{
      currentScript:{src:'https://example.com/cities/preview-package-factory.js'},
      readyState:'complete',baseURI:'https://example.com/response-simulator/',
      documentElement:{dataset:{}},
      head:{appendChild:node=>nodes.push(node)},body:{appendChild:node=>nodes.push(node)},
      createElement:tag=>({tagName:String(tag).toUpperCase(),dataset:{},style:{},setAttribute(){},addEventListener(){},remove(){}}),
      getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},
    },
    dispatchEvent:event=>events.push(event),addEventListener(){},...extra,
  });
  ctx.window=ctx;ctx.parent=ctx;ctx.__events=events;return ctx;
}

const noChangesDiff = (before,after) => ({
  schema:1,updated:[],added:after.filter(item=>!before.some(seed=>seed.id===item.id)),deleted:[],
});

test('all cities launch through the same Peterborough desktop and mobile simulator wrappers', () => {
  const c=browserContext();
  vm.runInContext(read('cities/city-registry.js'),c);
  assert.equal(c.PTBO_CITIES.length,7);
  for(const city of c.PTBO_CITIES){
    assert.equal(city.playable,true,city.id);
    assert.equal(city.dispatch.desktop,'response-simulator/play/',`${city.id} desktop route`);
    assert.equal(city.dispatch.mobile,'response-simulator/mobile/',`${city.id} mobile route`);
  }
  for(const id of cities){
    const city=c.PTBO_CITIES.find(item=>item.id===id);
    assert.equal(city.status,'base-training',id);
    assert.match(city.note,/Peterborough controls/i,id);
    assert.match(city.note,/Calls unavailable/i,id);
  }
});

test('base-training routes no longer reference the separate base-training wrapper', () => {
  const registry=read('cities/city-registry.js');
  assert.doesNotMatch(registry,/response-simulator\/base-training\//);
  assert.match(registry,/response-simulator\/play\//);
  assert.match(registry,/response-simulator\/mobile\//);
});

test('every base-training city ships a packaged city definition and deliberately empty dispatch descriptor', () => {
  for(const id of cities){
    const packageSource=read(`cities/${id}/package.js`);
    const dispatchSource=read(`cities/${id}/dispatch-data.js`);
    assert.match(packageSource,/PTBO_PREVIEW_CITY_FACTORY/,id);
    assert.match(packageSource,/lat:\d/,`${id} latitude`);
    assert.match(packageSource,/lng:-\d/,`${id} longitude`);
    assert.match(dispatchSource,/available:false/,id);
  }
});

test('all six base-training city packages start without live network services', async () => {
  for(const id of cities){
    let fetchCount=0;
    const c=browserContext({fetch:async()=>{fetchCount+=1;throw new Error('network unavailable')}});
    vm.runInContext(read('cities/preview-package-factory.js'),c);
    c.document.currentScript.src=`https://example.com/cities/${id}/package.js`;
    vm.runInContext(read(`cities/${id}/package.js`),c);
    await Promise.race([
      c.PTBO_CITY_PACKAGE_READY,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${id} timed out`)),100)),
    ]);
    assert.equal(c.PTBO_CITY_PACKAGE.id,id);
    assert.ok(c.PTBO_SERVICE_CONFIG.profiles.fire.bases.length,`${id} fire bases`);
    assert.ok(c.PTBO_SERVICE_CONFIG.profiles.ems.bases.length,`${id} EMS bases`);
    assert.equal(fetchCount,0,`${id} startup must use packaged coordinates`);
  }
});

test('preview city packages keep dispatch unavailable while exposing unrestricted movement to the shared driving stack', async () => {
  const c=browserContext();
  vm.runInContext(read('cities/preview-package-factory.js'),c);
  c.document.currentScript.src='https://example.com/cities/test/package.js';
  const config={
    id:'test',name:'Test City',sourceUrl:new URL('https://example.com/cities/test/package.js'),
    map:{defaultCenter:[44,-79],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.5,-79.5],[44.5,-78.5]]},
    sources:{
      fire:{type:'static',entries:[{number:1,name:'Fire Station 1',address:'1 Fire Rd',lat:44.01,lng:-79.01}]},
      ems:{type:'static',entries:[{number:1,name:'Paramedic Base 1',address:'1 EMS Rd',lat:44.02,lng:-79.02}]},
    },
  };
  await c.PTBO_PREVIEW_CITY_FACTORY.create(config);
  assert.equal(c.PTBO_CITY_PACKAGE.features.baseTraining,true);
  assert.equal(c.PTBO_CITY_PACKAGE.dispatch.available,false);
  assert.equal(c.PTBO_ROAD_COLLISION.state.enabled,false);
  assert.equal(c.PTBO_ROAD_COLLISION.isPointDrivable(0,0),true);
});

test('duplicate EMS source names still receive unique IDs before entering the shared simulator', async () => {
  const gisPayload={features:[
    {attributes:{NAME:'Oshawa Paramedic Base',ADDRESS:'100 First St',TOWN:'OSHAWA',MUNICIPALITY:'OSHAWA'},geometry:{x:-78.861,y:43.901}},
    {attributes:{NAME:'Oshawa Paramedic Base',ADDRESS:'200 Second St',TOWN:'OSHAWA',MUNICIPALITY:'OSHAWA'},geometry:{x:-78.872,y:43.912}},
  ]};
  const c=browserContext({fetch:async()=>({ok:true,status:200,json:async()=>gisPayload}),PTBO_LOCATION_CHANGES:{diff:noChangesDiff}});
  vm.runInContext(read('cities/preview-package-factory.js'),c);
  c.document.currentScript.src='https://example.com/cities/oshawa/package.js';
  const config={
    id:'oshawa',name:'Oshawa',sourceUrl:new URL('https://example.com/cities/oshawa/package.js'),
    map:{defaultCenter:[43.8971,-78.8658],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.83,-78.98],[44.01,-78.76]]},
    sources:{fire:{type:'static',entries:[{number:1,name:'Fire Station 1',address:'199 Adelaide Ave W',lat:43.9,lng:-78.87}]},ems:{type:'durham-paramedic',municipality:'OSHAWA',url:'https://example.com/durham/9',outFields:'NAME,ADDRESS,TOWN,MUNICIPALITY'}},
  };
  await c.PTBO_PREVIEW_CITY_FACTORY.create(config);
  const imported=c.PTBO_SERVICE_CONFIG.profiles.ems.bases;
  assert.equal(imported.length,2);
  assert.equal(new Set(imported.map(base=>base.id)).size,2);
  assert.equal(new Set(imported.map(base=>base.number)).size,2);
});

test('v1.6.24 build uses the stable v1.6.17 city-runtime protocol instead of the build number', () => {
  const build=read('shared/build-version.js');
  assert.match(build,/const VERSION = '1\.6\.24'/);
  assert.match(build,/const CITY_RUNTIME_VERSION = '1\.6\.17'/);
  assert.match(build,/PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION = CITY_RUNTIME_VERSION/);
  assert.match(build,/simulator-readiness-1\.6\.17\.js/);
  assert.match(build,/city-runtime-bootstrap-1\.6\.17\.js/);
  assert.match(build,/base-training-mode-1\.6\.8\.js/);
  assert.match(build,/directional-drive-zoom-1\.5\.8\.js/);
  assert.match(build,/mobile-ui-layout-1\.5\.9\.js/);
  assert.match(build,/satellite-map-1\.5\.6\.js/);
  assert.match(build,/site-analytics-1\.6\.24\.js/);
  assert.match(build,/window\.top !== window/);
  assert.match(build,/const SCRIPT_TIMEOUT_MS = 12000/);
  assert.match(build,/data-ptbo-simulator-readiness'[\s\S]*?15000/);
});

test('v1.6.24 automatically selects the Peterborough mobile or desktop wrapper', () => {
  const build=read('shared/build-version.js');
  const selector=read('shared/city-selector.js');
  assert.match(build,/PTBO_DEVICE_SURFACE/);
  assert.match(build,/function prefersMobileSurface\(\)/);
  assert.match(build,/Android\|webOS\|iPhone\|iPad\|iPod/);
  assert.match(build,/function redirectWrongSimulatorSurface\(\)/);
  assert.match(build,/wantsMobile \? '\.\.\/mobile\/' : '\.\.\/play\/'/);
  assert.match(build,/location\.replace\(target\.href\)/);
  assert.match(selector,/PTBO_DEVICE_SURFACE/);
  assert.match(selector,/const route = mobile \? city\.dispatch\?\.mobile : city\.dispatch\?\.desktop/);
  assert.doesNotMatch(selector,/window\.innerWidth\s*<=\s*900/);
});

test('base-training mode only disables dispatch and keeps the shared simulator surface', () => {
  const source=read('response-simulator/base-training-mode-1.6.8.js');
  assert.match(source,/const VERSION = '1\.6\.22'/);
  assert.match(source,/Peterborough simulator controls/);
  assert.match(source,/ptbo-incident-types-summary-label/);
  assert.match(source,/startsWith\('Incident Types'\)/);
  for(const name of ['triggerDispatchWorkflow','fireRandomIncidentDispatch','toggleAllLocations','recordCurrentLocation','exportUpdatedDatabase']){
    assert.match(source,new RegExp(`window\\.${name}=blockedDispatch`),name);
  }
  const applyBody=source.match(/function apply\(\) \{([\s\S]*?)\n  \}/)?.[1]||'';
  assert.doesNotMatch(applyBody,/refreshFromCityPackage/,'apply must not recurse through base-store refresh events');
  assert.match(source,/let applying=false/);
});

test('compact settings accepts the base-training Incident Types label instead of blocking startup', () => {
  const source=read('response-simulator/settings-menu-compact-1.5.3.js');
  assert.match(source,/const VERSION = '1\.6\.22'/);
  assert.match(source,/startsWith\('Incident Types'\)/);
  assert.match(source,/existingDetails[\s\S]*state\.installed = true/);
  assert.doesNotMatch(source,/node\.textContent\.trim\(\) === 'Incident Types'/);
});

test('city selector keeps the shared mobile and desktop wrapper URLs', () => {
  const source=read('shared/city-selector.js');
  assert.match(source,/const VERSION = '1\.6\.22'/);
  assert.match(source,/same Peterborough driving controls/);
  assert.match(source,/url\.searchParams\.set\('surface', mobile \? 'mobile' : 'desktop'\)/);
  assert.match(source,/url\.searchParams\.set\('fresh', String\(Date\.now\(\)\)\)/);
});

test('main menu exposes the password-locked Dispatch Editor and hides Website Stats behind ten taps', () => {
  const source=read('index.html');
  const editorTag=source.match(/<a id="dispatch-editor-link"[^>]*>/)?.[0]||'';
  assert.match(editorTag,/locked-card/);
  assert.doesNotMatch(editorTag,/\shidden(?:\s|>)/);
  assert.match(source,/<a id="site-stats-link"[^>]*hidden/);
  assert.match(source,/const accessHash='435c554a2e9cd54d2d3431b8af2b5d7ba740c64f1dca92b7af8a76b05d484ef3'/);
  assert.match(source,/Dispatch Editor password:/);
  assert.match(source,/Website Stats password:/);
  assert.match(source,/tapCount<10/);
  assert.match(source,/localStorage\.setItem\(statsKey,'enabled'\)/);
  assert.match(source,/href="site-stats\//);
  assert.match(source,/shared\/site-analytics-1\.6\.24\.js/);
  assert.match(source,/shared\/build-version\.js\?v=1\.6\.24/);
});

test('v1.6.24 detailed analytics tracks play time, dispatch behaviour and controls without storing exact routes', () => {
  const tracker=read('shared/site-analytics-1.6.24.js');
  const dashboard=read('site-stats/index.html');
  assert.match(tracker,/const VERSION='1\.6\.24'/);
  assert.match(tracker,/recordType:'session_summary'/);
  for(const metric of ['activeSeconds','drivingSeconds','stationarySeconds','distanceMeters','callsStarted','callsCompleted','callsAbandoned','responseMsTotal','transportMsTotal','sirenToggles','recenterUses','reverseUses','acceleratorUses','steeringUses','startupSuccesses','startupFailures']){
    assert.match(tracker,new RegExp(metric),metric);
  }
  assert.match(tracker,/attachSimulatorFrame/);
  assert.match(tracker,/attachGeoFrame/);
  assert.match(tracker,/haversine/);
  assert.match(tracker,/incident_/);
  assert.match(tracker,/city_seconds_/);
  assert.doesNotMatch(tracker,/getCurrentPosition|navigator\.geolocation/);
  assert.match(dashboard,/ptbo-emergency-stats-mode/);
  assert.match(dashboard,/Active time/);
  assert.match(dashboard,/Calls started/);
  assert.match(dashboard,/Distance driven/);
  assert.match(dashboard,/Incident types/);
  assert.match(dashboard,/Startup reliability/);
  assert.match(dashboard,/Detailed gameplay tracking begins with v1\.6\.24/);
});

test('Peterborough desktop and mobile wrappers remain the canonical control surfaces', () => {
  for(const file of ['response-simulator/play/index.html','response-simulator/mobile/index.html']){
    const source=read(file);
    assert.match(source,/url\.searchParams\.set\('city',city\)/,file);
    assert.match(source,/url\.searchParams\.set\('fresh'/,file);
    assert.match(source,/PTBO_STARTUP_TRACE/,file);
  }
  const mobile=read('response-simulator/mobile/index.html');
  assert.match(mobile,/id="steering"/);
  assert.match(mobile,/id="reverse-pedal"/);
  assert.match(mobile,/id="gas-pedal"/);
  assert.match(mobile,/id="recenter-button"/);
  const desktop=read('response-simulator/play/index.html');
  assert.match(desktop,/id="recenter-button"/);
  assert.match(desktop,/id="siren-button"/);
  assert.match(desktop,/station-shortcuts/);
});

test('inner simulator still uses fixed-step physics and the shared gear/vehicle modules', () => {
  const source=read('response-simulator/index.html');
  assert.match(source,/const FIXED_STEP_MS = 1000 \/ 60/);
  assert.match(source,/PTBO_DIRECTIONAL_DRIVE_ZOOM/);
  assert.match(source,/PTBO_ARCADE_HANDLING/);
  assert.match(source,/gearbox-core\.js/);
  assert.match(source,/vehicleMarker\.setRotationAngle/);
});

test('inner simulator loads Leaflet locally without a blocking CDN dependency', () => {
  const source=read('response-simulator/index.html');
  assert.doesNotMatch(source,/unpkg\.com\/leaflet/);
  for(const file of ['leaflet.js','leaflet.css','leaflet.edgebuffer.js','leaflet.rotatedMarker.js']){
    assert.ok(source.includes(`vendor/leaflet-1.9.4/${file}?v=1.6.13`),file);
    assert.ok(fs.statSync(path.join(root,'response-simulator/vendor/leaflet-1.9.4',file)).size>100,file);
  }
});