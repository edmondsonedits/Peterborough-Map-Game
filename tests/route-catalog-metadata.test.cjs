'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {normalizeRouteMetadata}=require('../shared/dispatch-locations.js');
const {compactCityPack}=require('../scripts/build-ontario-geo-data.cjs');
const script=fs.readFileSync(path.join(__dirname,'../shared/dispatch-locations.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const challenge=(baseId='station-1',service='fire')=>({id:`${service}-${baseId}`,baseId,service,difficulty:75,decisionType:'crossing',preferredRoads:['Main Street','Main Street','Bridge Street'],alternatives:[{roads:['Other Road'],estimatedSeconds:120,cost:130,distance:900,reason:'Longer crossing'}],reason:'Choose the connected crossing',reviewStatus:'map-derived',graphVersion:'graph-1',costProfileVersion:'cost-1',responseSeconds:95,cost:100,distance:700,qualityMargin:0.3,sourceUrl:'https://example.test/source',reviewedAt:'2026-10-15',reviewedBy:'reviewer',source:'packaged-roads'});
const access={lat:44,lng:-78,sourceLat:44.001,sourceLng:-78.001,wayId:42,nodeId:12,graphVersion:'graph-1',sourceUrl:'https://example.test/way/42',snapshot:'2026-10-15'};
const location=(id='old',tier='easy')=>({id,name:id,addr:'1 Main Street',lat:44,lng:-78,radius:50,recognitionDifficulty:tier,crossStreets:['First'],routeChallenges:[challenge()],routeAccess:access,difficultyReason:'Distinct landmark',sources:['official-source']});
async function store({city='ottawa',seeds=[location()],saved,storage=new Map(),baseSeed=[],currentBases=baseSeed,version='ontario-geo-1'}={}){
 const listeners=new Map();
 if(saved)storage.set('ptboSharedDispatchLocationsV3:'+city,JSON.stringify(saved));
 const c=vm.createContext({console:{info(){},warn(){}},URL,location:{href:'https://example.test/editor/?city='+city},document:{currentScript:{src:'https://example.test/shared/dispatch-locations.js?city='+city}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},addEventListener:(type,handler)=>listeners.set(type,[...(listeners.get(type)||[]),handler]),dispatchEvent:event=>{for(const handler of listeners.get(event.type)||[])handler(event);},PTBO_DISPATCH_DATA_VERSION:version,PTBO_DISPATCH_DATA_READY:Promise.resolve(seeds),PTBO_BASE_STORE:{getSeed:()=>baseSeed,getAll:()=>currentBases}});
 c.window=c;vm.runInContext(script,c);await c.PTBO_DISPATCH_STORE.ready();return {api:c.PTBO_DISPATCH_STORE,c,storage,setBases:list=>{currentBases=list;c.dispatchEvent(new c.CustomEvent('ptbo-bases-updated',{detail:{cityId:city}}));}};
}
test('CommonJS imports normalize route evidence without browser startup and bounds malformed metadata',()=>{
 const valid=normalizeRouteMetadata({routeChallenges:[challenge()],routeAccess:access});
 assert.deepEqual(valid.routeChallenges[0].preferredRoads,['Main Street','Bridge Street']);assert.equal(valid.routeAccess.wayId,'42');assert.equal(valid.routeAccess.nodeId,'12');
 assert.deepEqual(normalizeRouteMetadata({routeChallenges:[{...challenge(),graphVersion:''},{...challenge(),costProfileVersion:''},{...challenge(),difficulty:101},{...challenge(),service:'police'}],routeAccess:{...access,lat:'44'}}),{routeChallenges:[]});
 const bounded=normalizeRouteMetadata({routeChallenges:Array.from({length:260},()=>({...challenge(),baseId:'b'.repeat(170),decisionType:'d'.repeat(110),preferredRoads:Array.from({length:40},(_,i)=>'Road '+i),alternatives:Array.from({length:10},()=>({roads:['Road'],cost:-2,distance:Infinity,estimatedSeconds:10}))}))});
 assert.equal(bounded.routeChallenges.length,256);assert.equal(bounded.routeChallenges[0].baseId.length,160);assert.equal(bounded.routeChallenges[0].decisionType.length,100);assert.equal(bounded.routeChallenges[0].preferredRoads.length,32);assert.equal(bounded.routeChallenges[0].alternatives.length,8);assert.equal(bounded.routeChallenges[0].alternatives[0].cost,undefined);
});
test('ordinary edits, persisted reloads, exports and compiler retain route evidence and source metadata',async()=>{
 const first=await store();const original=first.api.getAll()[0];first.api.upsert({...original,name:'Edited name'});const current=first.api.getAll()[0];
 assert.deepEqual(plain(current.routeChallenges),normalizeRouteMetadata(location()).routeChallenges);assert.equal(current.routeAccess.wayId,'42');assert.equal(current.difficultyReason,'Distinct landmark');assert.equal(current.sources[0],'official-source');
 assert.match(first.api.exportText(),/routeChallenges/);assert.match(first.api.exportText(),/costProfileVersion/);
 const reload=await store({storage:first.storage});assert.deepEqual(plain(reload.api.getAll()[0]),plain(current));
 const pack=compactCityPack({id:'test',name:'Test',map:{bounds:[[43,-79],[45,-77]]},bases:[],locations:[location()]});assert.deepEqual(pack.locations[0].routeChallenges,plain(current.routeChallenges));assert.deepEqual(pack.locations[0].routeAccess,plain(current.routeAccess));
});
test('coordinate or radius edits stale route decisions while familiarity and ordinary name edits do not',async()=>{
 const h=await store();let call=h.api.getAll()[0];h.api.upsert({...call,name:'Renamed',recognitionDifficulty:'hard'});assert.equal(h.api.getAll()[0].routeChallenges[0].reviewStatus,'map-derived');
 call=h.api.getAll()[0];h.api.upsert({...call,radius:70});assert.equal(h.api.getAll()[0].routeChallenges[0].reviewStatus,'stale');
 const moved=await store();moved.api.replaceAll([{...moved.api.getAll()[0],lat:44.002}]);assert.equal(moved.api.getAll()[0].routeChallenges[0].reviewStatus,'stale');
});
test('same-version migration fills absent route metadata once and preserves user edits, tiers, coordinates and deletions',async()=>{
 const seed=[location(),location('deleted','medium'),location('new-route',null)],old={...location(),name:'My name',lat:44.002,recognitionDifficulty:'hard'};delete old.routeChallenges;delete old.routeAccess;
 const h=await store({seeds:seed,saved:{version:3,dataVersion:'ontario-geo-1',items:[old,{id:'custom',name:'Custom',addr:'Address',lat:44,lng:-78,radius:50}]}});
 const migrated=h.api.getAll();assert.deepEqual(Array.from(migrated,x=>x.id),['old','custom','new-route']);assert.equal(migrated[0].name,'My name');assert.equal(migrated[0].lat,44.002);assert.equal(migrated[0].recognitionDifficulty,'hard');assert.equal(migrated[0].routeChallenges[0].reviewStatus,'stale');
 const saved=JSON.parse(h.storage.get(h.api.storageKey));assert.equal(saved.routeMetadataVersion,1);h.api.remove('new-route');h.api.upsert({...h.api.getAll()[0],routeChallenges:[],routeAccess:undefined});
 const reload=await store({seeds:seed,storage:h.storage});assert.deepEqual(Array.from(reload.api.getAll(),x=>x.id),['old','custom']);assert.deepEqual(plain(reload.api.getAll()[0].routeChallenges),[]);assert.equal(reload.api.getAll()[0].routeAccess,undefined);
});
test('empty legacy Belleville and Scarborough catalogs keep custom calls during canonical route upgrade',async()=>{
 for(const city of ['belleville','scarborough']){const custom={...location('my-custom'),name:'My local call',recognitionDifficulty:'hard',lat:44.01};delete custom.routeChallenges;delete custom.routeAccess;
 const h=await store({city,saved:{version:3,dataVersion:'1.6.8',items:[custom]}});assert.deepEqual(Array.from(h.api.getAll(),x=>x.id),['my-custom','old']);assert.equal(h.api.getAll()[0].name,'My local call');assert.equal(h.api.getAll()[0].recognitionDifficulty,'hard');assert.equal(h.api.getAll()[0].lat,44.01);
 const reload=await store({city,storage:h.storage});assert.equal(reload.api.getAll().length,2);}
});
test('base coordinate and spawn changes invalidate every dependent route, including saved base edits on reload',async()=>{
 const baseSeed=[{id:'fire-station-1',service:'fire',lat:44,lng:-78,spawnLat:44,spawnLng:-78,spawnHeading:180},{id:'ems-1',service:'ems',lat:44,lng:-78,spawnLat:44,spawnLng:-78,spawnHeading:180}],seeds=[{...location(),routeChallenges:[challenge(),challenge('ems-1','ems')]}];
 const h=await store({baseSeed,seeds});h.setBases(baseSeed.map(base=>({...base,name:'Name only'})));assert.ok(h.api.getAll()[0].routeChallenges.every(x=>x.reviewStatus==='map-derived'));
 h.setBases(baseSeed.map(base=>({...base,lat:44.001})));assert.ok(h.api.getAll()[0].routeChallenges.every(x=>x.reviewStatus==='stale'));assert.match(h.api.exportText(),/stale/);assert.ok(JSON.parse(h.storage.get(h.api.storageKey)).items[0].routeChallenges.every(x=>x.reviewStatus==='stale'));
 const reload=await store({baseSeed,seeds,currentBases:baseSeed.map(base=>({...base,spawnLng:-78.001}))});assert.ok(reload.api.getAll()[0].routeChallenges.every(x=>x.reviewStatus==='stale'));
});
