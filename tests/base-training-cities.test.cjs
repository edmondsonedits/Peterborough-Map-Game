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
  const events = [];
  const nodes = [];
  const storage = new Map();
  const ctx = vm.createContext({
    console, URL, AbortController,
    setTimeout, clearTimeout,
    queueMicrotask,
    performance:{now:()=>0},
    CustomEvent:class { constructor(type,options){this.type=type;this.detail=options?.detail;} },
    location:{href:'https://example.com/response-simulator/index.html?city=test'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    document:{
      currentScript:{src:'https://example.com/cities/preview-package-factory.js'},
      readyState:'complete',
      documentElement:{dataset:{}},
      head:{appendChild:node=>nodes.push(node)},
      body:{appendChild:node=>nodes.push(node)},
      createElement:tag=>({tagName:String(tag).toUpperCase(),dataset:{},setAttribute(){},addEventListener(){},remove(){}}),
      getElementById:()=>null,
      querySelector:()=>null,
      querySelectorAll:()=>[],
      addEventListener(){},
    },
    dispatchEvent:event=>events.push(event),
    addEventListener(){},
    ...extra,
  });
  ctx.window = ctx;
  ctx.parent = ctx;
  ctx.__events = events;
  return ctx;
}

test('city registry exposes Peterborough full dispatch plus six base-training cities', () => {
  const c = browserContext();
  vm.runInContext(read('cities/city-registry.js'), c);
  assert.equal(c.PTBO_CITIES.length, 7);
  const peterborough = c.PTBO_CITIES.find(city => city.id === 'peterborough');
  assert.equal(peterborough.playable, true);
  assert.equal(peterborough.status, 'playable');
  for (const id of cities) {
    const city = c.PTBO_CITIES.find(item => item.id === id);
    assert.ok(city, id);
    assert.equal(city.playable, true, id);
    assert.equal(city.status, 'base-training', id);
    assert.match(city.note, /Calls unavailable/i, id);
    assert.ok(city.dispatch.desktop && city.dispatch.mobile, id);
  }
});

test('every base-training city ships a v1.6.8 package and deliberately empty dispatch descriptor', () => {
  for (const id of cities) {
    const packageSource = read(`cities/${id}/package.js`);
    const dispatchSource = read(`cities/${id}/dispatch-data.js`);
    assert.match(packageSource, /const VERSION='1\.6\.8'/, id);
    assert.match(packageSource, /PTBO_PREVIEW_CITY_FACTORY/, id);
    assert.match(dispatchSource, /available:false/, id);
  }
});

test('preview package factory resolves Fire and EMS bases while keeping calls and road protection disabled', async () => {
  const c = browserContext();
  vm.runInContext(read('cities/preview-package-factory.js'), c);
  c.document.currentScript.src = 'https://example.com/cities/test/package.js';
  const config = {
    id:'test',name:'Test City',sourceUrl:new URL('https://example.com/cities/test/package.js'),
    map:{defaultCenter:[44,-79],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.5,-79.5],[44.5,-78.5]]},
    sources:{
      fire:{type:'static',entries:[{number:1,name:'Fire Station 1',address:'1 Fire Rd',lat:44.01,lng:-79.01}]},
      ems:{type:'static',entries:[{number:1,name:'Paramedic Base 1',address:'1 EMS Rd',lat:44.02,lng:-79.02}]},
    },
  };
  await c.PTBO_PREVIEW_CITY_FACTORY.create(config);
  assert.equal(c.PTBO_CITY_PACKAGE.features.baseTraining, true);
  assert.equal(c.PTBO_CITY_PACKAGE.dispatch.available, false);
  assert.equal(c.PTBO_CITY_PACKAGE.roads.available, false);
  assert.equal(c.PTBO_SERVICE_CONFIG.profiles.fire.bases.length, 1);
  assert.equal(c.PTBO_SERVICE_CONFIG.profiles.ems.bases.length, 1);
  assert.equal(c.PTBO_ROAD_COLLISION.state.enabled, false);
  assert.equal(c.PTBO_ROAD_COLLISION.isPointDrivable(0,0), true);
});

test('base store refreshes when an asynchronous city package fills its base arrays', () => {
  const fire = [];
  const ems = [];
  const hospital = {id:'none',name:'Unavailable',addr:'Unavailable',lat:44,lng:-79,radius:30};
  const c = browserContext({
    PTBO_CITY_PACKAGE:{id:'test',name:'Test City',features:{baseTraining:true},roads:{center:[44,-79]},map:{defaultCenter:[44,-79]}},
    PTBO_SERVICE_CONFIG:{profiles:{fire:{id:'fire',bases:fire},ems:{id:'ems',bases:ems}},hospital,alarmCategories:[]},
    PTBO_LOCATION_CHANGES:{diff:(before,after)=>({schema:1,updated:[],added:after.filter(item=>!before.some(seed=>seed.id===item.id)),deleted:[]})},
  });
  vm.runInContext(read('shared/base-locations.js'), c);
  assert.equal(c.PTBO_BASE_STORE.getAll().length, 0);
  fire.push({id:'fire-1',number:1,name:'Fire Station 1',shortName:'Stn 1',address:'1 Fire Rd',lat:44.01,lng:-79.01,yardSize:120,yardRotation:0});
  ems.push({id:'ems-1',number:1,name:'Paramedic Base 1',shortName:'Base 1',address:'1 EMS Rd',lat:44.02,lng:-79.02,yardSize:120,yardRotation:0});
  assert.equal(c.PTBO_BASE_STORE.refreshFromCityPackage(), true);
  assert.equal(c.PTBO_BASE_STORE.getBases('fire').length, 1);
  assert.equal(c.PTBO_BASE_STORE.getBases('ems').length, 1);
});

test('readiness makes road protection conditional instead of fatal for base training', () => {
  const readiness = read('response-simulator/simulator-readiness-1.4.5.js');
  assert.match(readiness, /roadRequired\s*=\s*city\.features\?\.roadBoundaries\s*!==\s*false/);
  assert.match(readiness, /base-training-free-drive/);
  assert.match(readiness, /installFreeDriveRoadApi/);
});

test('base-training mode permanently blocks every dispatch entry point', () => {
  const source = read('response-simulator/base-training-mode-1.6.8.js');
  for (const name of ['triggerDispatchWorkflow','fireRandomIncidentDispatch','toggleAllLocations','recordCurrentLocation','exportUpdatedDatabase']) {
    assert.match(source, new RegExp(`window\\.${name}=blockedDispatch`), name);
  }
  assert.match(source, /Calls Unavailable/);
  assert.match(source, /Dispatch calls unavailable/);
});

test('desktop and mobile wrappers use the current release and skip dispatch data in base training', () => {
  for (const file of ['response-simulator/play/index.html','response-simulator/mobile/index.html']) {
    const source=read(file);
    assert.match(source, /1\.6\.8/, file);
    assert.doesNotMatch(source, /const VERSION\s*=\s*['"]1\.6\.[25]['"]/, file);
    assert.match(source, /baseTraining\s*\?\s*Promise\.resolve/, file);
    assert.match(source, /simulator-readiness-1\.4\.5\.js/, file);
  }
});

test('production build marker and launch screen load v1.6.8', () => {
  assert.match(read('shared/build-version.js'), /const VERSION = '1\.6\.8'/);
  assert.match(read('index.html'), /shared\/build-version\.js\?v=1\.6\.8/);
  assert.match(read('shared/city-selector.js'), /const VERSION = '1\.6\.8'/);
});
