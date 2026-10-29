'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {runtime}=require('./helpers/city-runtime.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');

// A new Geo pack can replace an older preview loader while keeping the same
// city-scoped snapshot version. Changing that version discards existing edits.
test('Geo packs retain legacy snapshot edits and deletions through an explicit data version',async()=>{
 const pack={schemaVersion:1,id:'toronto',dispatchDataVersion:'1.6.8',name:'Toronto',
  map:{bounds:[[43,-80],[44,-79]],defaultCenter:[43.7,-79.4],minZoom:7,maxZoom:19},
  bases:[
   {id:'fire-existing',number:221,name:'Existing Fire',shortName:'Stn 221',address:'10 Main St',service:'fire',lat:43.7,lng:-79.4,status:'active',selectionEligible:true},
   {id:'ems-existing',number:20,name:'Existing EMS',shortName:'Base 20',address:'20 Main St',service:'ems',lat:43.71,lng:-79.4,status:'active',selectionEligible:true},
  ],
  locations:[
   {id:'published-edited',name:'Published Site',addr:'30 Main St',lat:43.72,lng:-79.4,radius:50,recognitionDifficulty:'easy'},
   {id:'published-deleted',name:'Deleted Site',addr:'32 Main St',lat:43.721,lng:-79.4,radius:50,recognitionDifficulty:'medium'},
  ]};
 const h=runtime({pack});
 const snapshot=JSON.stringify({version:3,cityId:'toronto',dataVersion:'1.6.8',items:[
  {...pack.locations[0],name:'My Site Name',lat:43.722,recognitionDifficulty:'hard'},
  {id:'custom-existing',name:'My Custom Site',addr:'99 Elm St',lat:43.73,lng:-79.41,radius:50,recognitionDifficulty:'medium',custom:true},
 ]});
 h.storage.set('ptboSharedDispatchLocationsV3:toronto',snapshot);
 h.storage.set('ptboBaseLocationChangesV1:toronto',JSON.stringify({schema:1,updated:[{id:'fire-existing',changes:{name:'My Existing Hall'}}],added:[],deleted:[]}));
 await h.c.PTBO_GEO_CITY_READY;
 const store=h.c.PTBO_DISPATCH_STORE,rows=store.getAll();
 assert.equal(store.dataVersion,'1.6.8');
 assert.deepEqual(Array.from(rows,row=>row.id),['published-edited','custom-existing']);
 assert.equal(rows[0].name,'My Site Name');assert.equal(rows[0].lat,43.722);assert.equal(rows[0].recognitionDifficulty,'hard');
 assert.equal(h.c.PTBO_BASE_STORE.getBases('fire')[0].id,'fire-existing');
 assert.equal(h.c.PTBO_BASE_STORE.getBases('fire')[0].number,221);
 assert.equal(h.c.PTBO_BASE_STORE.getBases('fire')[0].name,'My Existing Hall');
 assert.equal(h.storage.get('ptboSharedDispatchLocationsV3:toronto'),snapshot,'loading does not rewrite existing snapshots');
});

test('Geo packs without an explicit data version retain the established Geo snapshot namespace',async()=>{
 const h=runtime();
 const row={...h.data.locations[0],name:'My Existing Geo Edit'};
 h.storage.set('ptboSharedDispatchLocationsV3:toronto',JSON.stringify({version:3,cityId:'toronto',dataVersion:'ontario-geo-1',items:[row]}));
 await h.c.PTBO_GEO_CITY_READY;
 assert.equal(h.c.PTBO_DISPATCH_STORE.dataVersion,'ontario-geo-1');
 assert.equal(h.c.PTBO_DISPATCH_STORE.getAll()[0].name,'My Existing Geo Edit');
});

for(const [city,fireCount,emsCount,center] of [
 ['belleville',5,2,[44.1628,-77.3832]],
 ['scarborough',17,12,[43.7764,-79.2318]],
])test(`${city} preview uses the complete Geo roster with identical saved-data identities and source coordinates`,async()=>{
 const pack=JSON.parse(read(`cities/${city}/geo-data.json`));
 const c=vm.createContext({URL,console,CustomEvent:class{},location:{href:`https://example.test/?city=${city}`},
  fetch:async url=>{if(String(url)===`https://example.test/cities/${city}/geo-data.json`)return {ok:true,json:async()=>pack};throw Error('Packaged bases must not need live lookup');},
  localStorage:{getItem:()=>null,setItem(){}},addEventListener(){},dispatchEvent(){},
  document:{currentScript:{src:'https://example.test/cities/preview-package-factory.js'},readyState:'complete',documentElement:{dataset:{}},
   createElement:()=>({dataset:{}}),head:{appendChild(){}}}});
 c.window=c;
 vm.runInContext(read('cities/preview-package-factory.js'),c);
 c.document.currentScript.src=`https://example.test/cities/${city}/package.js`;
 vm.runInContext(read(`cities/${city}/package.js`),c);await c.PTBO_CITY_PACKAGE_READY;
 vm.runInContext(read('shared/location-changes.js'),c);
 c.document.currentScript.src='https://example.test/shared/base-locations.js';
 vm.runInContext(read('shared/base-locations.js'),c);
 const seed=c.PTBO_BASE_STORE.getSeed();
 assert.equal(seed.filter(b=>b.service==='fire').length,fireCount);
 assert.equal(seed.filter(b=>b.service==='ems').length,emsCount);
 const fields=b=>({id:b.id,number:b.number,service:b.service,lat:b.lat,lng:b.lng,address:b.address});
 const sort=rows=>rows.map(fields).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(JSON.parse(JSON.stringify(sort(seed))),sort(pack.bases.filter(b=>b.status==='active'&&b.selectionEligible)));
 assert.deepEqual(Array.from(c.PTBO_CITY_PACKAGE.map.defaultCenter),center);
 assert.equal(c.PTBO_CITY_PACKAGE.dispatch.available,true);
 assert.equal(c.PTBO_CITY_PACKAGE.map.bounds[1][0],city==='belleville'?44.35:43.86);
 c.document.currentScript.src=`https://example.test/cities/${city}/dispatch-data.js`;
 vm.runInContext(read(`cities/${city}/dispatch-data.js`),c);
 assert.equal(c.PTBO_CITY_DISPATCH_SOURCE.version,'1.6.8');
 assert.equal(pack.dispatchDataVersion,'1.6.8');
});
