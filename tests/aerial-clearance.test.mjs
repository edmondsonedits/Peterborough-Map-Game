import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');
const {prepareFleetAsset}=await import('../city-explorer/fleet-assets.js');
const {applyAerialPose,aerialPartBounds,aerialSelfClearance}=await import('../city-explorer/aerial-runtime.js');
const {createAerialState,stepAerial,AERIAL_LIMITS,aerialTravelReady}=await import('../city-explorer/aerial-controller.mjs');
async function load(){
 const root=new URL('../city-explorer/assets/vehicles/',import.meta.url),bytes=await readFile(new URL('aerial-platform.glb',root));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const model=prepareFleetAsset(scene,JSON.parse(await readFile(new URL('aerial-platform.json',root),'utf8')),'aerial'),actor=new THREE.Group();
 actor.userData.truck=model;actor.add(scene);return {actor,state:{x:0,y:0,z:0,pitch:0,roll:0,heading:0},model};
}
test('folding fly takes the lower arc and basket stays level in travel and every fold fraction',async()=>{
 const e=await load(),s=createAerialState(),up=new THREE.Vector3(0,1,0);
 for(const fold of [1,.9,.75,.5,.25,.1,0]){
  Object.assign(s,{pitch:fold===1?0:.8,fold,basketFold:fold});
  applyAerialPose(THREE,e,s);
  const actual=up.clone().applyQuaternion(e.model.rig.Basket.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(actual.distanceTo(up)<1e-6,'level basket at fold '+fold);
  // Inspect the fly endpoint in the last main section frame, below its hinge.
  const parent=e.model.rig.KnuckleFold.parent;
  const hinge=parent.worldToLocal(e.model.rig.KnuckleFold.getWorldPosition(new THREE.Vector3()));
  const end=parent.worldToLocal(e.model.rig.BasketLevel.getWorldPosition(new THREE.Vector3()));
  if(fold>0&&fold<1)assert.ok(end.y<hinge.y,'fly must swing under main ladder at '+fold);
 }
});
test('deployment lifts before the downward swing and stow reverses through the same clearance height',()=>{
 const s=createAerialState(),env={speed:0,setup:()=>({ok:true}),motion:()=>true};
 stepAerial(s,{deploy:true},.02,env);
 let folds=0;
 for(let i=0;i<1000&&s.phase!=='operating';i++){
  const last=s.fold;stepAerial(s,{},.02,env);
  if(s.fold!==last){folds++;assert.ok(s.pitch>=.8,'boom must clear cab before unfolding');}
 }
 assert.ok(folds>0);assert.equal(s.phase,'operating');assert.equal(s.pitch,AERIAL_LIMITS.boardingPitch);
 stepAerial(s,{stow:true},.02,env);
 for(let i=0;i<1000&&!aerialTravelReady(s);i++){
  const last=s.fold;stepAerial(s,{},.02,env);
  if(s.fold!==last)assert.ok(s.pitch>=.8,'stow must lift before folding back');
 }
 assert.ok(aerialTravelReady(s));
});

test('actual exported rig clears cab and body throughout deployment and reverse stow',async()=>{
 const e=await load(),s=createAerialState(),env={speed:0,setup:()=>({ok:true}),motion:()=>true};
 let samples=0;
 const check=()=>{
  applyAerialPose(THREE,e,s);samples++;
  assert.ok(aerialSelfClearance(THREE,e),JSON.stringify({phase:s.phase,pitch:s.pitch,fold:s.fold,bounds:aerialPartBounds(THREE,e.model.rig.BasketLevel,e.actor)}));
  const up=new THREE.Vector3(0,1,0).applyQuaternion(e.model.rig.Basket.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(up.distanceTo(new THREE.Vector3(0,1,0))<1e-6);
 };
 check();stepAerial(s,{deploy:true},.02,env);
 for(let i=0;i<1400&&s.phase!=='operating';i++){stepAerial(s,{},.02,env);check();}
 assert.equal(s.phase,'operating');
 stepAerial(s,{stow:true},.02,env);
 for(let i=0;i<1400&&!aerialTravelReady(s);i++){stepAerial(s,{},.02,env);check();}
 assert.ok(aerialTravelReady(s));assert.ok(samples>1000);
});

test('basket rests in a modeled open recess rather than intersecting a solid deck',async()=>{
 const e=await load(),s=createAerialState();applyAerialPose(THREE,e,s);
 const pocket=e.model.metadata.stowPocket;assert.ok(pocket);
 const floor=e.model.scene.getObjectByName(pocket.floorNode);assert.ok(floor);
 const staticMeshes=[];e.model.scene.traverse(n=>{if(n.isMesh&&(n.name.startsWith('AerialBody')||n===floor))staticMeshes.push(n);});
 const shift=e.model.scene.position.z,ray=new THREE.Raycaster();
 for(const x of [-.55,0,.55])for(const rawZ of [-.80,-.25,.30]){
  ray.set(new THREE.Vector3(x,2.65,rawZ+shift),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObjects(staticMeshes,false)[0];
  assert.ok(hit&&Math.abs(hit.point.y-pocket.min[1])<.015,'recess must have open space down to the actual floor');
 }
 const basket=e.model.rig.Basket.getWorldPosition(new THREE.Vector3());
 assert.ok(basket.y>pocket.min[1]&&basket.y<pocket.max[1]);
 assert.ok(basket.z-.55>pocket.min[2]+shift&&basket.z+.55<pocket.max[2]+shift);
});
test('self-clearance rejects a low unfolding attempt and an inverted fly path',async()=>{
 const e=await load(),s=createAerialState();
 Object.assign(s,{pitch:.4,fold:.75,lift:1});applyAerialPose(THREE,e,s);
 assert.equal(aerialSelfClearance(THREE,e),false);
 Object.assign(s,{pitch:.8,fold:.75});applyAerialPose(THREE,e,s);
 assert.equal(aerialSelfClearance(THREE,e),true);
 e.model.rig.KnuckleFold.rotation.x=.75*Math.PI;e.actor.updateMatrixWorld(true);
 assert.equal(aerialSelfClearance(THREE,e),false);
});
