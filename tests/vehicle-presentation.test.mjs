import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');
const {preparePumper}=await import('../city-explorer/pumper-asset.js');
const {prepareFleetAsset}=await import('../city-explorer/fleet-assets.js');
const {configureVehiclePresentation,updateVehiclePresentation,steeringForWheel}=await import('../city-explorer/vehicle-presentation.js');
const {FLEET_DEFINITIONS}=await import('../city-explorer/vehicle-fleet.mjs');
const {sampleTruckWheelContacts}=await import('../city-explorer/road-wheel-contact.js');

async function entryFor(type){
 const name={pumper:'generic-pumper',aerial:'aerial-platform',medi:'medi-pickup'}[type];
 const base=new URL('../city-explorer/assets/vehicles/',import.meta.url);
 const bytes=await readFile(new URL(name+'.glb',base));
 const metadata=JSON.parse(await readFile(new URL(name+'.json',base),'utf8'));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const model=type==='pumper'?preparePumper(scene):prepareFleetAsset(scene,metadata,type);
 const actor=new THREE.Group(),visual=new THREE.Group();actor.add(visual);visual.add(model.scene);
 actor.position.set(12,.035,18);actor.rotation.y=.8;
 actor.userData.truck={...model,metadata,visual,assetStatus:'blender-ready'};
 const entry={actor,definition:FLEET_DEFINITIONS.find(d=>d.type===type),state:{x:12,y:.035,z:18,heading:.8,speed:12,steering:.12,acceleration:3,wheelRotation:2,emergencyLights:true}};
 configureVehiclePresentation(THREE,entry,null);
 return entry;
}
test('inner front tire steers more sharply in either direction and rear tires remain straight',()=>{
 assert.ok(steeringForWheel(.4,-1,5.6)>steeringForWheel(.4,1,5.6));
 assert.ok(Math.abs(steeringForWheel(-.4,1,5.6))>Math.abs(steeringForWheel(-.4,-1,5.6)));
 assert.equal(steeringForWheel(0,1,5.6),0);
});
for(const type of ['pumper','aerial','medi'])test(type+' tires stay grounded independently of body lean and retain visible warning lenses',async()=>{
 const entry=await entryFor(type),truck=entry.actor.userData.truck;
 for(let i=0;i<180;i++)updateVehiclePresentation(entry,{delta:1/60,time:i*16,surface:()=>({height:0}),driving:true});
 entry.actor.updateMatrixWorld(true);
 for(const w of truck.presentation.wheelData){
  assert.equal(w.pivot.parent,entry.actor);
  assert.ok(Math.abs(w.pivot.getWorldPosition(new THREE.Vector3()).y-truck.metadata.wheelRadius)<.001);
  assert.equal(w.spin.rotation.x,-2);
  if(!w.front)assert.equal(w.pivot.rotation.y,0);
 }
 assert.ok(truck.visual.rotation.x>0);assert.ok(truck.visual.rotation.z<0);
 assert.ok(truck.beacons.every(b=>b.visible));
 const before=truck.beacons.map(b=>b.material.emissiveIntensity);
 updateVehiclePresentation(entry,{delta:1/60,time:470,driving:false});
 const after=truck.beacons.map(b=>b.material.emissiveIntensity);
 assert.notDeepEqual(before,after);
 entry.state.emergencyLights=false;
 updateVehiclePresentation(entry,{delta:1/60,time:470});
 assert.ok(truck.beacons.every(b=>b.visible&&b.material.emissiveIntensity===0));
});
test('aerial stabilization returns wheel suspension to travel geometry instead of reaching down through raised chassis',async()=>{
 const entry=await entryFor('aerial'),truck=entry.actor.userData.truck;
 for(let i=0;i<120;i++)updateVehiclePresentation(entry,{delta:1/60,time:0,surface:()=>({height:0}),locked:true});
 for(const w of truck.presentation.wheelData)assert.ok(Math.abs(w.pivot.position.y-w.rest.y)<.001);
});
test('terrain sampling follows off-centre model axles',()=>{
 const samples=[];
 sampleTruckWheelContacts({x:0,z:0,y:0,heading:0},{wheelbase:6,trackWidth:2,frontAxleZ:-4,rearAxleZ:2},(x,z)=>{samples.push([x,z]);return {height:0,onRoad:true};});
 assert.deepEqual(samples,[[-1,-4],[1,-4],[-1,2],[1,2]]);
});
test('locking immediately clears residual aerial body lean',async()=>{
 const entry=await entryFor('aerial');entry.aerial={};
 updateVehiclePresentation(entry,{delta:.1,time:0,driving:true});
 assert.notEqual(entry.actor.userData.truck.visual.rotation.x,0);
 updateVehiclePresentation(entry,{delta:.001,time:0,driving:false,locked:true});
 assert.equal(entry.actor.userData.truck.visual.rotation.x,0);
 assert.equal(entry.actor.userData.truck.visual.rotation.z,0);
});
test('procedural fallback retains spinning wheels, steering and warning lights',()=>{
 const material=new THREE.MeshStandardMaterial({emissive:0xff0000});
 const wheel=new THREE.Mesh(),hub=new THREE.Mesh(),pivot=new THREE.Group();
 const beacons=[new THREE.Mesh(undefined,material),new THREE.Mesh(undefined,material)];
 const truck={wheels:[{wheel,hub}],frontWheels:[pivot],beacons};
 const entry={actor:{userData:{truck}},state:{wheelRotation:2,steering:.3,emergencyLights:true}};
 updateVehiclePresentation(entry,{delta:.016,time:50,driving:true});
 assert.equal(wheel.rotation.x,2);assert.equal(hub.rotation.x,2);assert.equal(pivot.rotation.y,.3);
 assert.notEqual(beacons[0].material,beacons[1].material);
 assert.notEqual(beacons[0].material.emissiveIntensity,beacons[1].material.emissiveIntensity);
});
for(const type of ['pumper','aerial','medi'])test(type+' road lamps have independent brake, reverse, and headlight states',async()=>{
 const entry=await entryFor(type),p=entry.actor.userData.truck.presentation;
 for(const kind of ['Headlamp','BrakeLamp','ReverseLamp'])assert.ok(p.lamps[kind].length>=2,kind+' '+type);
 entry.state.braking=true;entry.state.speed=0;
 updateVehiclePresentation(entry,{delta:.016,time:0,driving:true});
 assert.ok(p.lamps.Headlamp.every(l=>l.material.emissiveIntensity>1));
 assert.ok(p.lamps.BrakeLamp.every(l=>l.material.emissiveIntensity>2));
 assert.ok(p.lamps.ReverseLamp.every(l=>l.material.emissiveIntensity<.1));
 entry.state.braking=false;entry.state.speed=-2;
 updateVehiclePresentation(entry,{delta:.016,time:0,driving:true});
 assert.ok(p.lamps.ReverseLamp.every(l=>l.material.emissiveIntensity>1));
 assert.ok(p.lamps.BrakeLamp.every(l=>l.material.emissiveIntensity<1));
 assert.ok(p.lamps.Headlamp.every(l=>l.material.emissiveIntensity>1));
});
