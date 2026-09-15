import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');
const {preparePumper}=await import('../city-explorer/pumper-asset.js');
const bytes=await readFile(new URL('../city-explorer/assets/vehicles/generic-pumper.glb',import.meta.url));
const load=async()=> (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
test('authored pumper fits existing envelope and budget, with no external textures',async()=>{
  const scene=await load(),bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
  // Mirror housings extend beyond the unchanged 2.55 m collision body.
  assert.ok(size.x<=3.2 && size.y<=3.3 && size.z<=10.45, JSON.stringify(size));
  assert.ok(bounds.min.y>=0 && bounds.min.y<.1);
  let triangles=0,draws=0;scene.traverse(n=>{if(n.isMesh){draws++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;assert.equal(n.material.map,null);}});
  assert.ok(triangles<60000);assert.ok(draws<=30);assert.ok(bytes.length<3500000);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.equal(json.images,undefined);assert.ok(!/peterborough|engine.?10|department|pierce/i.test(JSON.stringify(json.nodes.map(n=>n.name))));
});
test('wheel conversion preserves placement, independent steering/spin, and four warning lenses',async()=>{
  const scene=await load(),names=['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'];
  const before=names.map(name=>new THREE.Box3().setFromObject(scene.getObjectByName(name)));
  const model=preparePumper(scene);scene.updateMatrixWorld(true);
  assert.equal(model.wheels.length,4);assert.equal(model.frontWheels.length,2);assert.equal(model.beacons.length,4);
  model.wheels.forEach(({pivot,spin},i)=>{
    const after=new THREE.Box3().setFromObject(pivot);assert.ok(before[i].min.distanceTo(after.min)<1e-6);assert.ok(before[i].max.distanceTo(after.max)<1e-6);
    assert.ok(Math.abs(pivot.position.y-.62)<1e-6);spin.rotation.x=-1;
  });
  assert.ok(Math.abs(model.frontWheels[0].position.z+2.83)<1e-6);
  assert.ok(Math.abs(model.wheels[2].pivot.position.z-model.frontWheels[0].position.z-5.65)<1e-5);
  model.frontWheels.forEach(p=>p.rotation.y=.3);assert.equal(model.wheels[2].pivot.rotation.y,0);
  assert.notEqual(model.beacons[0].material,model.beacons[1].material);
});
test('rejects corrupt animation contract before replacing fallback',async()=>{
  const scene=await load();scene.remove(scene.getObjectByName('Wheel_FL'));assert.throws(()=>preparePumper(scene),/animation nodes/);
});
