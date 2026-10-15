import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { OfficialDrivableSurfaceIndex } from '../city-explorer/official-road-surfaces.js';
import { stepFireTruckKinematics, TRUCK_TUNING } from '../city-explorer/gameplay-systems-1.6.69.js';
import { CitySplatLayer, buildSplatPlacement } from '../city-explorer/city-splat-layer.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const section=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,'source section exists: '+start);return source.slice(a,b);};
const geo=read('geo-guesser/index.html');
function sandbox(extra={}){const c=vm.createContext({console:{info(){},warn(){}},URL,Promise,setTimeout,clearTimeout,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},...extra});c.window=c;return c;}

test('explicit dispatch script city wins over a previously selected city',async()=>{
 const c=sandbox({document:{currentScript:{src:'https://example.test/shared/dispatch-locations.js?city=peterborough'}},location:{href:'https://example.test/route-mapping/'},localStorage:{getItem:()=> 'toronto',setItem(){}},PTBO_DISPATCH_DATA_READY:Promise.resolve([{name:'Call',lat:44.3,lng:-78.3}]),dispatchEvent(){}});
 vm.runInContext(read('shared/dispatch-locations.js'),c);await c.PTBO_DISPATCH_STORE.ready();assert.equal(c.PTBO_DISPATCH_STORE.cityId,'peterborough');
});
test('Geo player entry removes timed modes, filters and scoreboard clients',()=>{
 const wrapper=read('geo-guesser/wrapper.js');
 assert.doesNotMatch(geo,/Timed Games|Scoreboards|geoCallFilters|score-row|id="timer"/);
 assert.doesNotMatch(wrapper,/firebase|scoreboard/i);
 assert.match(geo,/id="call-cross-streets"/);assert.match(geo,/id="show-cross-streets"/);
});

test('surveyed pavement supports very large valid rings without stack overflow',()=>{
 const ring=Array.from({length:150000},(_,i)=>({x:10*Math.cos(i/150000*Math.PI*2),y:10*Math.sin(i/150000*Math.PI*2)}));
 const index=new OfficialDrivableSurfaceIndex();assert.equal(index.add([ring]),true);assert.ok(index.query(0,0));assert.equal(index.entries[0].bounds.maxX,10);
});
test('invalid holes reject the whole surface before mutating the spatial index',()=>{
 const index=new OfficialDrivableSurfaceIndex(),outer=[{x:0,y:0},{x:10,y:0},{x:0,y:10}];
 assert.equal(index.add([outer,[{x:1,y:1},{x:NaN,y:2},{x:2,y:1}]]),false);assert.equal(index.entries.length,0);assert.equal(index.cells.size,0);
});
for(const sign of [1,-1])test('off-road transition decelerates continuously '+(sign>0?'forward':'reverse'),()=>{
 let value={speed:sign*(sign>0?27.5:TRUCK_TUNING.maximumReverseSpeed),acceleration:0,heading:0,steering:0};
 const previous=Math.abs(value.speed);value=stepFireTruckKinematics(value,{throttle:sign,steering:0},.016,false);
 assert.ok(Math.abs(value.speed)<previous);assert.ok(previous-Math.abs(value.speed)<=TRUCK_TUNING.serviceBrake*.016+1e-6);
 for(let i=0;i<400;i++)value=stepFireTruckKinematics(value,{throttle:sign,steering:0},.016,false);
 const limit=sign>0?TRUCK_TUNING.offRoadSpeed:TRUCK_TUNING.maximumReverseSpeed*.65;assert.ok(Math.abs(value.speed)<=limit+1e-6);
});
test('missing splat elevation uses terrain; explicit zero remains absolute',()=>{
 const pilot={anchor:{latitude:44,longitude:-78,elevationMetresCGVD2013:null,verticalOffset:2},transform:{}};
 assert.equal(buildSplatPlacement(pilot,()=>({x:0,y:0}),()=>17,100).position.y,19);
 pilot.anchor.elevationMetresCGVD2013=0;assert.equal(buildSplatPlacement(pilot,()=>({x:0,y:0}),()=>17,100).position.y,-98);
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function splatHarness(){
 const record={pilot:{id:'test',name:'Test',asset:'asset.rad',format:'rad',lod:{}},placement:{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:1},state:'enabled',mesh:null,controller:null};
 const scene={add(){},remove(){}},layer=Object.create(CitySplatLayer.prototype);Object.assign(layer,{scene,manifestUrl:'./manifest.json',disposed:false,publish(){},ensureSparkRenderer(){}});
 return{layer,record};
}
test('unload while splat runtime resolves preserves disabled state',async()=>{
 const {layer,record}=splatHarness(),ready=deferred();layer.ensureRuntime=()=>ready.promise;
 const pending=layer.loadRecord(record);layer.disposeRecord(record,'disabled');ready.resolve();await pending;
 assert.equal(record.state,'disabled');assert.equal(record.error,'');assert.equal(record.controller,null);
});
test('old splat mesh failure cannot dispose a replacement',async()=>{
 const {layer,record}=splatHarness(),oldReady=deferred();let created=0;const meshes=[];
 class Mesh{constructor(){this.initialized=++created===1?oldReady.promise:Promise.resolve();this.position={set(){}};this.rotation={set(){}};this.scale={setScalar(){}};this.disposed=0;meshes.push(this);}dispose(){this.disposed++;}}
 layer.runtime={SplatMesh:Mesh};layer.ensureRuntime=async()=>layer.runtime;
 const old=layer.loadRecord(record);await Promise.resolve();layer.disposeRecord(record);await layer.loadRecord(record);const replacement=record.mesh;
 oldReady.reject(new Error("Old decode failed"));await old;assert.equal(record.mesh,replacement);assert.equal(record.state,'ready');assert.equal(replacement.disposed,0);
});
