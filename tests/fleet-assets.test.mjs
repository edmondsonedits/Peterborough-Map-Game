import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');
const root=new URL('../city-explorer/assets/vehicles/',import.meta.url);
async function asset(name){
 const bytes=await readFile(new URL(`${name}.glb`,root));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const metadata=JSON.parse(await readFile(new URL(`${name}.json`,root),'utf8'));
 const names=new Map();gltf.scene.traverse(n=>{if(n.name)names.set(n.name,n);});
 return {bytes,gltf,metadata,names,bounds:new THREE.Box3().setFromObject(gltf.scene)};
}
const close=(actual,expected,tol=.015)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} != ${expected}`);

test('aerial platform exports its articulated stowed rig, pads, nozzle, and cab envelope',async()=>{
 const a=await asset('aerial-platform'),s=a.bounds.getSize(new THREE.Vector3());
 assert.ok(s.x<=3.15 && s.y<=4.42 && s.z>=12.55 && s.z<=13.55,JSON.stringify(s));
 assert.ok(a.bounds.min.y>=0 && a.bounds.min.y<.05);
 close(s.z,a.metadata.dimensions.length,.16);
 const wheelZ=name=>a.names.get(name).getWorldPosition(new THREE.Vector3()).z;
 close((wheelZ('Wheel_RL')+wheelZ('Wheel_RL2'))/2-wheelZ('Wheel_FL'),a.metadata.wheelbase,.04);
 const required=['TurntableYaw','LadderPitch','KnuckleFold','BasketLevel','BasketFold','Basket','BasketStand','BasketControls','RearControls','RearOperator','MonitorYaw','MonitorPitch','NozzleOutlet',
  'Outrigger_FL','Outrigger_FR','Outrigger_RL','Outrigger_RR','Jack_FL','Jack_FR','Jack_RL','Jack_RR','Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2',
  'Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR','Cylinder_Base_L','Cylinder_Base_R','Cylinder_Tip_L','Cylinder_Tip_R','ElevationRam_L','ElevationRam_R'];
 for(const n of required)assert.ok(a.names.has(n),`missing ${n}`);
 const sections=a.metadata.ladderSections;
 assert.equal(sections.length,6);
 const telescoping=sections.slice(0,-1);
 for(const [i,section] of telescoping.entries()){
   const parent=i===0?'LadderPitch':telescoping[i-1].node;
   assert.equal(a.names.get(section.node)?.parent?.name,parent);
   assert.ok(section.travel<section.length,'each section must remain supported by its parent');
 }
 for(const [child,parent] of [['LadderPitch','TurntableYaw'],['KnuckleFold',sections.at(-2).node],[sections.at(-1).node,'KnuckleFold'],['BasketLevel',sections.at(-1).node],['BasketFold','BasketLevel'],['Basket','BasketFold'],['BasketStand','Basket'],['MonitorYaw','Basket'],['MonitorPitch','MonitorYaw'],['NozzleOutlet','MonitorPitch']])
  assert.equal(a.names.get(child).parent?.name,parent,`${child} must parent to ${parent}`);
 for(const [beam,jack] of [['Outrigger_FL','Jack_FL'],['Outrigger_FR','Jack_FR'],['Outrigger_RL','Jack_RL'],['Outrigger_RR','Jack_RR']])
  assert.equal(a.names.get(jack).parent?.name,beam);
 assert.ok(a.names.get('TurntableYaw').position.z>3.9,'the turntable is rear mounted');
 close(a.names.get('Wheel_FL').position.y,a.metadata.wheelRadius,.09);
 const rearOperatorZ=a.names.get('RearOperator').getWorldPosition(new THREE.Vector3()).z;
 assert.ok(rearOperatorZ>a.bounds.max.z+.35,`Operator z=${rearOperatorZ.toFixed(2)}, bumper z=${a.bounds.max.z.toFixed(2)}`);
 close(a.names.get('Jack_FL').position.y,-.48);
 close(a.names.get('Outrigger_FL').position.x,0);
 const nozzle=a.names.get('NozzleOutlet').getWorldPosition(new THREE.Vector3());
 assert.ok(nozzle.y>a.metadata.stowPocket.min[1] && nozzle.y<a.metadata.stowPocket.max[1],'underside nozzle is protected inside the recessed stow pocket');
 assert.ok(a.metadata.stabilizerBeamTravel>=1.45&&a.metadata.stabilizerBeamTravel<=1.9);
 assert.ok(a.metadata.triangles>20000 && a.metadata.drawCalls<220);
 assert.ok(a.bytes.length<6_500_000);
 for(const m of a.gltf.scene.children)void m;
 a.gltf.scene.traverse(n=>{if(n.isMesh)assert.equal(n.material.map,null);});
});

test('medical response pickup is a compact enclosed four-door vehicle, not an ambulance',async()=>{
 const a=await asset('medi-pickup'),s=a.bounds.getSize(new THREE.Vector3());
 assert.ok(s.x<=2.85 && s.y<=2.9 && s.z>=6.5 && s.z<=7.9,JSON.stringify(s));
 assert.ok(a.bounds.min.y>=0 && a.bounds.min.y<.15);
 assert.equal(a.metadata.ambulance,false);
 for(const n of ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'])assert.ok(a.names.has(n),`missing ${n}`);
 assert.equal(a.metadata.fourDoorCab,true);assert.equal(a.metadata.fullyEnclosedCanopy,true);
 const front=a.names.get('Wheel_FL').getWorldPosition(new THREE.Vector3());
 const rear=a.names.get('Wheel_RL').getWorldPosition(new THREE.Vector3());
 close(rear.z-front.z,a.metadata.wheelbase,.04);
 assert.ok(a.metadata.triangles>6000 && a.metadata.drawCalls<75);
 assert.ok(a.bytes.length<3_500_000);
 a.gltf.scene.traverse(n=>{if(n.isMesh)assert.equal(n.material.map,null);});
});
