'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gearbox = require('../response-simulator/gearbox-core.js');
const source = name => fs.readFileSync(path.join(__dirname,'..','response-simulator',name),'utf8');
function camera({mobile=true}={}) {
  let now=0;
  const raf=[],changes=[];
  const map={options:{},zoom:17,getZoom(){return this.zoom;},setZoom(zoom){this.zoom=zoom;changes.push(zoom);}};
  const c=vm.createContext({console,velocity:0,PTBO_FIXED_STEP:1/60,PTBO_GEARBOX:gearbox,
    mapInstance:map,performance:{now:()=>now},setTimeout(){},requestAnimationFrame:fn=>raf.push(fn),
    CustomEvent:class{},dispatchEvent(){},
    parent:{document:{getElementById:()=>mobile?{}:null}},
    document:{getElementById:id=>id==='chk-camera'?{checked:false}:null,querySelector:()=>null,
      createElement:()=>({}),head:{appendChild(){}},documentElement:{classList:{toggle(){}}}},
    PTBO_ARCADE_HANDLING:{state:{settings:{speedZoomEnabled:false,zoomOutLevels:0}}},
    PTBO_VEHICLE_INSTRUMENTS:{state:{speedKmh:999}},
    PTBO_ROUTE_COMPARE:{state:{reviewOpen:false}},
  });
  c.window=c;
  vm.runInContext(source('arcade-mobile-camera-1.5.3.js'),c);
  const api=c.PTBO_STABLE_MOBILE_CAMERA;
  function frame(speed,time){now=time;c.velocity=speed/gearbox.velocityToKmh;raf.shift()(time);}
  return {c,map,api,frame,changes};
}

test('mobile starts at maximum zoom; desktop camera is untouched',()=>{
  const mobile=camera();assert.equal(mobile.map.zoom,19);assert.equal(mobile.api.state.level,0);
  const desktop=camera({mobile:false});assert.equal(desktop.map.zoom,17);assert.equal(desktop.api.state.installed,false);
});

test('exact speed thresholds yield 19 → 18 → 17 → 16 → 15, including the gear-three cap',()=>{
  const s=camera();let time=2000;
  for(const [speed,zoom] of [[149.999,19],[150,18],[299.999,18],[300,17],[449.999,17],[450,16],[599.999,16],[600,15],[999,15]]) {
    s.frame(speed,time);time+=2000;assert.equal(s.map.zoom,zoom,`${speed} km/h`);
  }
  assert.deepEqual(s.changes,[19,18,17,16,15]);
});

test('zoom follows actual physics speed despite stale instrument values and old disabled flags',()=>{
  const s=camera();s.frame(0,2000);assert.equal(s.map.zoom,19);
  s.c.PTBO_VEHICLE_INSTRUMENTS.state.speedKmh=0;
  s.frame(600,4000);assert.equal(s.map.zoom,15);
});

test('15 km/h hysteresis and a short settling delay prevent threshold flicker',()=>{
  const s=camera();s.frame(150,2000);assert.equal(s.map.zoom,18);
  for(let i=0;i<6;i++)s.frame(i%2?151:149,4000+i*1000);
  assert.equal(s.map.zoom,18);
  s.frame(135,11000);assert.equal(s.map.zoom,18);
  s.frame(135,11200);assert.equal(s.map.zoom,18);
  s.frame(135,11400);assert.equal(s.map.zoom,19);
});

test('recenter retains the speed-appropriate view and returns to maximum zoom at rest',()=>{
  const s=camera();s.frame(600,2000);s.api.resetZoom();assert.equal(s.map.zoom,15);
  s.c.velocity=0;s.api.resetZoom();assert.equal(s.map.zoom,19);
});

test('route review is not overwritten by the speed camera',()=>{
  const s=camera();s.c.PTBO_ROUTE_COMPARE.state.reviewOpen=true;s.map.zoom=13;
  s.frame(600,2000);assert.equal(s.map.zoom,13);
  s.c.PTBO_ROUTE_COMPARE.state.reviewOpen=false;s.frame(600,4000);assert.equal(s.map.zoom,15);
});

test('slowing before imagery finishes cancels the outdated zoom-out request',()=>{
  const s=camera();let pending=null,cancelled=null;
  s.map.setZoom=zoom=>{pending=zoom;};
  s.c.PTBO_SATELLITE_MAP={cancelPendingZoom(zoom){if(pending===zoom){cancelled=zoom;pending=null;}}};
  s.frame(150,2000);assert.equal(pending,18);assert.equal(s.map.zoom,19);
  s.frame(0,4000);s.frame(0,4400);
  assert.equal(cancelled,18);assert.equal(pending,null);assert.equal(s.map.zoom,19);
});

function preloader() {
  let finish;
  const waiting=new Promise(resolve=>{finish=resolve;});
  const map={zoom:19,center:{lat:44.3,lng:-78.3},getMinZoom:()=>10,getMaxZoom:()=>19,
    getZoom(){return this.zoom;},getCenter(){return this.center;},on(){},
    setZoom(zoom){this.setView(this.getCenter(),zoom);},
    setView(center,zoom){this.center=center;this.zoom=zoom;}};
  const c=vm.createContext({state:{mode:'satellite',pendingZoom:null},getMap:()=>map,
    L:{latLng:value=>value},preloadZoom:()=>waiting,setButtonBusy(){},scheduleAdjacentWarm(){}});
  const js=source('satellite-map-1.5.6.js');
  vm.runInContext(js.slice(js.indexOf('  function cancelPendingZoom('),js.indexOf('  function keepVersionBadgeCurrent(')),c);
  c.installZoomGuard(map);
  return {c,map,finish,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('cancelled satellite requests never commit when their preloads resolve',async()=>{
  const s=preloader();s.map.setZoom(18);assert.equal(s.c.cancelPendingZoom(18),true);
  s.finish();await s.flush();assert.equal(s.map.zoom,19);
});

test('delayed satellite zoom uses the latest map centre while the truck moves',async()=>{
  const s=preloader();s.map.setZoom(18);
  const moved={lat:44.31,lng:-78.31};s.map.center=moved;
  s.finish();await s.flush();assert.equal(s.map.zoom,18);assert.equal(s.map.center,moved);
});
