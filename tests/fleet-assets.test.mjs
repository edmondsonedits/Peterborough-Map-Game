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
 assert.ok(s.x<=3.1 && s.y<=4.35 && s.z>=11.5 && s.z<=12.0,JSON.stringify(s));
 assert.ok(a.bounds.min.y>=0 && a.bounds.min.y<.05);
 const required=['TurntableYaw','LadderPitch','LadderSection_1','LadderSection_2','LadderSection_3','KnuckleFold','LadderSection_4','BasketLevel','BasketFold','Basket','MonitorYaw','MonitorPitch','NozzleOutlet',
  'Outrigger_FL','Outrigger_FR','Outrigger_RL','Outrigger_RR','Jack_FL','Jack_FR','Jack_RL','Jack_RR','Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Wheel_RL2','Wheel_RR2',
  'Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR','Cylinder_Base_L','Cylinder_Base_R','Cylinder_Tip_L','Cylinder_Tip_R','ElevationRam_L','ElevationRam_R'];
 for(const n of required)assert.ok(a.names.has(n),`missing ${n}`);
 for(const [child,parent] of [['LadderPitch','TurntableYaw'],['LadderSection_1','LadderPitch'],['LadderSection_2','LadderSection_1'],['LadderSection_3','LadderSection_2'],['KnuckleFold','LadderSection_3'],['LadderSection_4','KnuckleFold'],['BasketLevel','LadderSection_4'],['BasketFold','BasketLevel'],['Basket','BasketFold'],['MonitorYaw','Basket'],['MonitorPitch','MonitorYaw'],['NozzleOutlet','MonitorPitch']])
  assert.equal(a.names.get(child).parent?.name,parent,`${child} must parent to ${parent}`);
 for(const [beam,jack] of [['Outrigger_FL','Jack_FL'],['Outrigger_FR','Jack_FR'],['Outrigger_RL','Jack_RL'],['Outrigger_RR','Jack_RR']])
  assert.equal(a.names.get(jack).parent?.name,beam);
 close(a.names.get('TurntableYaw').position.y,2.95);
 close(a.names.get('Wheel_FL').position.y,.62);
 close(a.names.get('Jack_FL').position.y,-.48);
 close(a.names.get('Outrigger_FL').position.x,0);
 const nozzle=a.names.get('NozzleOutlet').getWorldPosition(new THREE.Vector3());
 assert.ok(nozzle.y>2.5,'stowed basket and underside nozzle stay above the cab');
 assert.ok(a.metadata.pivotContract['Outrigger_FL/FR/RL/RR'].deployedPadX.includes('2.75'));
 assert.ok(a.metadata.triangles>20000 && a.metadata.drawCalls<180);
 assert.ok(a.bytes.length<4_000_000);
 for(const m of a.gltf.scene.children)void m;
 a.gltf.scene.traverse(n=>{if(n.isMesh)assert.equal(n.material.map,null);});
});

test('medical response pickup is a compact enclosed four-door vehicle, not an ambulance',async()=>{
 const a=await asset('medi-pickup'),s=a.bounds.getSize(new THREE.Vector3());
 assert.ok(s.x<=2.72 && s.y<=2.7 && s.z>=6.5 && s.z<=7.0,JSON.stringify(s));
 assert.ok(a.bounds.min.y>=0 && a.bounds.min.y<.15);
 assert.equal(a.metadata.ambulance,false);
 for(const n of ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','Beacon_L','Beacon_R','Beacon_RearL','Beacon_RearR'])assert.ok(a.names.has(n),`missing ${n}`);
 assert.equal(a.metadata.fourDoorCab,true);assert.equal(a.metadata.fullyEnclosedCanopy,true);
 assert.ok(a.metadata.triangles>6000 && a.metadata.drawCalls<45);
 assert.ok(a.bytes.length<2_500_000);
 a.gltf.scene.traverse(n=>{if(n.isMesh)assert.equal(n.material.map,null);});
});
