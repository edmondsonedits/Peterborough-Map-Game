'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('response-simulator/response-tablet-1.6.48.js','utf8');
const road={type:'Feature',properties:{highway:'primary',name:'Yonge Street'},geometry:{type:'LineString',coordinates:[[-79.44,43.86],[-79.438,43.86]]}};
function fixture(cityId='richmond-hill', rewriteFallback=false, preferLocal=false) {
  const layers=[], requests=[], canvases=[], nodes=new Map(), drawn=[];
  const node=()=>({dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},focus(){}});
  const map={removeLayer(l){const i=layers.indexOf(l);if(i>=0)layers.splice(i,1);},project(p){return{x:60+(p[1]+79.44)*70000,y:120+(p[0]-43.86)*70000};},unproject(){return{lat:43.86,lng:-79.44};},setView(){},invalidateSize(){},fitBounds(){}};
  const layer=(url,kind)=>({_url:url,kind,events:{},on(e,f){this.events[e]=f;return this;},once(e,f){return this.on(e,f);},addTo(){layers.push(this);return this;}});
  const c=vm.createContext({console,PTBO_BUILD:{version:'test'},PTBO_CITY_PACKAGE:{id:'richmond-hill',map:{tabletBasemap:preferLocal?'local-streets':undefined}},
    PTBO_ROAD_COLLISION:{config:{cityId},state:{status:'ready',geojson:{type:'FeatureCollection',features:[road]}},ready:Promise.resolve()},
    document:{documentElement:node(),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},addEventListener(){},createElement(tag){
      if(tag!=='canvas')return node();const canvas={style:{},getContext(){return{scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){drawn.push('stroke');},save(){},restore(){},translate(){},rotate(){},measureText(text){return{width:text.length*6};},strokeText(){},fillText(text){drawn.push(text);}};}};canvases.push(canvas);return canvas;
    }},setTimeout(){return 1;},clearTimeout(){},setInterval(){},requestAnimationFrame(){return 1;},cancelAnimationFrame(){},addEventListener(){},focus(){},
    L:{map(){return map;},tileLayer(url){requests.push(url);return layer(rewriteFallback?'https://tile.openstreetmap.org/{z}/{x}/{y}.png':url,'external');},gridLayer(){return layer(null,'local');},divIcon(){},circle(){return layer(null,'marker');},marker(){return layer(null,'marker');},latLngBounds(){}},
  });c.window=c;c.parent=c;
  vm.runInContext(source,c);
  c.activeIncident={id:'call',name:'Call',lat:43.86,lng:-79.44};c.simulationState=1;c.STATES={ENROUTE:1,TRANSPORTING:2};
  c.PTBO_RESPONSE_TABLET.open();
  return{c,layers,requests,canvases,drawn,primary:layers.find(l=>l.kind==='external'),nodes};
}
test('failed tablet provider uses matching local canvas roads and labels without a second provider request',async()=>{
  const f=fixture();f.primary.events.tileerror();await Promise.resolve();
  const local=f.layers.find(l=>l.kind==='local');assert.ok(local,'packaged streets replace failed tiles');
  assert.equal(f.requests.length,1);assert.ok(!f.layers.includes(f.primary));
  local.createTile({x:0,y:0,z:18});assert.ok(f.drawn.includes('stroke'));assert.ok(f.drawn.includes('Yonge Street'));
  assert.equal(f.canvases.length,1,'canvas tiles avoid per-street DOM nodes');
  f.primary.events.tileerror();assert.equal(f.requests.length,1);
  f.primary.events.tileload();assert.match(f.nodes.get('ptbo-tablet-map-status').textContent,/Local street map/,'late primary success cannot overwrite the active fallback status');
});
test('tablet never draws another city collision data after provider failure',async()=>{
  const f=fixture('peterborough');f.primary.events.tileerror();await Promise.resolve();
  assert.ok(!f.layers.some(l=>l.kind==='local'));
});
test('successful configured primary remains the tablet basemap',()=>{
  const f=fixture();f.primary.events.tileload();assert.ok(f.layers.includes(f.primary));assert.ok(!f.layers.some(l=>l.kind==='local'));
});
test('a policy rewrite to the failed provider never adds a second external layer',()=>{
  const f=fixture('peterborough',true);f.primary.events.tileerror();
  assert.ok(!f.layers.some(l=>l.kind==='external'));
  assert.equal(f.nodes.get('ptbo-tablet-map-status').dataset.state,'error');
});
test('explicit local city preference renders packaged streets without any external tile requests',()=>{
  const f=fixture('richmond-hill',false,true);
  assert.equal(f.requests.length,0);
  const local=f.layers.find(l=>l.kind==='local');assert.ok(local);
  local.createTile({x:0,y:0,z:18});assert.ok(f.drawn.includes('Yonge Street'));
});
