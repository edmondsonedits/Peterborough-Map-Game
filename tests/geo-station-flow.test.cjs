'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

// Run the complete shipped game script and real session helper together.
// DOM/Leaflet fakes isolate the flow; rendered map acceptance is tested separately.
function game({blockedStorage=false,filters=null}={}) {
  const nodes=new Map(),timers=new Map();let sequence=0;
  function node(id) {
    if(nodes.has(id))return nodes.get(id);
    const classes=new Set();
    const element={id,textContent:'',innerHTML:'',value:'',hidden:false,
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),
        toggle(x,force){const enabled=force??!classes.has(x);enabled?classes.add(x):classes.delete(x);return enabled;}},
      setAttribute(){},addEventListener(){},focus(){},querySelector:()=>null};
    nodes.set(id,element);return element;
  }
  const map={center:{lat:0,lng:0},zoom:0,fits:[],views:[],
    attributionControl:{setPrefix(){}},getContainer:()=>node('map'),invalidateSize(){},
    getCenter(){return this.center;},getZoom(){return this.zoom;},setZoom(z){this.zoom=z;return this;},
    setView(point,zoom,options){this.center={lat:point[0],lng:point[1]};this.zoom=zoom;this.views.push({point,zoom,options});return this;},
    fitBounds(bounds,options){this.fits.push({bounds,options});return this;},removeLayer(){},stop(){return this;}};
  const layer=()=>({addTo(){return this;},bindTooltip(){return this;},clearLayers(){},remove(){},getBounds(){return{extend(){return this;}};}});
  const context=vm.createContext({console:{...console,warn(){}},URL,Math,performance:{now:()=>0},innerWidth:390,innerHeight:844,
    location:{href:'http://127.0.0.1:4180/geo-guesser/'},CustomEvent:class{},dispatchEvent(){},matchMedia:()=>({matches:true}),
    document:{currentScript:{src:'http://127.0.0.1:4180/cities/peterborough/package.js'},documentElement:{dataset:{}},getElementById:node,
      createElement:()=>node('temporary'),querySelectorAll:selector=>selector==='.screen'?['menu','game','station-practice','results'].map(node):[]},
    localStorage:{getItem(key){if(blockedStorage)throw Error('denied');return key==='geoCallFilters'?filters:null;},setItem(){if(blockedStorage)throw Error('denied');},removeItem(){}},
    setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),clearInterval(){},setInterval(){return 1;},
    PTBO_GEO_MAP_PROVIDER:{requireReady:()=>true,createStreetLayer:layer},
    L:{map:()=>map,layerGroup:layer,circle:layer,circleMarker:layer,polyline:layer},alert(){},navigator:{}});
  context.window=context;
  vm.runInContext(read('cities/peterborough/package.js'),context);
  vm.runInContext(read('geo-guesser/station-practice.js'),context);
  const script=[...read('geo-guesser/index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(match=>match[1].includes('const stations='))[1];
  vm.runInContext(script,context);
  const run=source=>vm.runInContext(source,context);
  function tick(delay){for(const[id,timer]of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}}
  return{run,node,map,tick,context};
}

test('every Fire and EMS base starts the shipped game at package coordinates and close zoom',()=>{
  const g=game();
  for(const service of ['fire','ems']){
    g.run(`choosePracticeService('${service}')`);
    const bases=g.context.PTBO_CITY_PACKAGE.serviceConfig.profiles[service].bases;
    for(let i=0;i<bases.length;i++){
      g.run(`startPractice(${i})`);g.tick(0);
      assert.equal(g.map.center.lat,bases[i].lat);assert.equal(g.map.center.lng,bases[i].lng);assert.equal(g.map.zoom,18);
      assert.equal(g.run('target.main'),service==='ems'?'Medical':'Fire');
    }
  }
});

test('miss review retries the same target then a correct answer resets at the same EMS base',()=>{
  const g=game();g.run("choosePracticeService('ems');startPractice(1)");g.tick(0);
  const first=g.run('target');
  g.map.center={lat:0,lng:0};g.run('confirmGuess()');
  assert.equal(g.run('target'),first);assert.equal(g.run('practiceSession.stats.completed'),0);
  assert.equal(g.run('practiceReview.outcome'),'incorrect');
  assert.equal(g.run('practiceSession.stats.assisted'),0);
  g.run('confirmGuess()'); // Try again resumes without submitting a second miss.
  assert.equal(g.run('practiceSession.stats.misses'),1);
  assert.equal(g.map.center.lat,0);assert.equal(g.map.center.lng,0);
  g.map.center={lat:first.lat,lng:first.lng};g.run('confirmGuess();confirmGuess()');
  assert.equal(g.run('practiceSession.stats.completed'),1);assert.equal(g.run('practiceSession.stats.firstTry'),0);
  assert.equal(g.run('practiceReview.outcome'),'correct');
  g.tick(1000);assert.equal(g.run('target'),first);
  g.tick(2500);
  const home=g.context.PTBO_CITY_PACKAGE.serviceConfig.profiles.ems.bases[1];
  assert.equal(g.map.center.lat,home.lat);assert.equal(g.map.center.lng,home.lng);assert.equal(g.map.zoom,18);
  assert.notEqual(g.run('target'),first);assert.equal(g.run('practiceReview'),null);
  assert.equal(g.node('confirm').textContent,'CHECK LOCATION · ENTER');
});

test('assisted reveal brings the target into view and counts completion only once',()=>{
  const g=game();g.run('startPractice(0)');g.tick(0);
  g.run('revealPracticeTarget();revealPracticeTarget()');
  assert.equal(g.map.fits.length,1);assert.equal(g.run('practiceSession.stats.assisted'),1);
  assert.match(g.node('timer').textContent,/Completed 1/);
  assert.equal(g.node('practice-reveal').classList.contains('hidden'),true);
  g.run('continuePracticeReveal()');assert.equal(g.map.zoom,18);
  assert.equal(g.node('practice-reveal').classList.contains('hidden'),false);
});

test('empty saved filters are explained on setup and denied storage still permits practice',()=>{
  const empty=game({filters:'[]'});empty.run('startPractice(0)');
  assert.equal(empty.map.views.length,0);assert.match(empty.node('practice-setup-status').textContent,/No valid/);
  const denied=game({blockedStorage:true});denied.run('startPractice(0)');denied.tick(0);assert.equal(denied.map.zoom,18);
});

test('leaving immediately after starting cancels deferred map setup',()=>{
  const g=game();g.run('startPractice(0);returnToMenu()');
  assert.doesNotThrow(()=>g.tick(0));
  assert.equal(g.node('menu').classList.contains('hidden'),false);assert.equal(g.map.views.length,0);
});
