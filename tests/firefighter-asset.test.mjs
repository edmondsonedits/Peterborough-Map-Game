import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');const {prepareFirefighter}=await import('../city-explorer/firefighter-asset.js');
const bytes=await readFile(new URL('../city-explorer/assets/characters/firefighter.glb',import.meta.url));
// Node validates geometry/rig with placeholder Texture objects; the browser
// integration checks decode the actual embedded PNGs and render the materials.
const load=async()=>(await new GLTFLoader().register(()=>({name:'node-texture-fixture',loadTexture(){return Promise.resolve(new THREE.Texture());}})).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
test('firefighter is self-contained, correctly sized and within geometry budget',async()=>{
 const scene=await load(),model=prepareFirefighter(scene),bounds=new THREE.Box3().setFromObject(scene);let triangles=0,draws=0;
 scene.traverse(n=>{if(n.isMesh){triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;draws++;}});
 assert.ok(triangles<120000);assert.ok(draws<=45);assert.ok(bytes.length<9000000);assert.ok(bounds.min.y>=-.001&&bounds.max.y<=2.1);
 assert.ok(Math.abs(model.leftArm.position.y-1.49)<1e-6);assert.ok(Math.abs(model.leftLeg.position.y-.89)<1e-6);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.ok(json.images.length>=5);assert.ok(json.images.every(im=>Number.isInteger(im.bufferView)&&im.mimeType==='image/png'&&!im.uri));
 assert.ok(json.buffers.every(b=>!b.uri),'all geometry and images are embedded');
 const hair=scene.getObjectByName('short04');assert.equal(hair.material.transparent,false);assert.equal(hair.material.alphaTest,.35);
});
test('walking rotates limbs about shoulder/hip without moving the body or opposite limbs',async()=>{
 const model=prepareFirefighter(await load()),body=model.scene.getObjectByName('Body');
 const origin=body.position.clone(),foot=model.leftLeg.children[0];model.scene.updateMatrixWorld(true);const before=foot.getWorldPosition(new THREE.Vector3());
 model.leftLeg.rotation.x=.4;model.leftArm.rotation.x=-.4;model.scene.updateMatrixWorld(true);
 assert.ok(before.distanceTo(foot.getWorldPosition(new THREE.Vector3()))>.01);assert.deepEqual(body.position,origin);assert.equal(model.rightLeg.rotation.x,0);assert.equal(model.rightArm.rotation.x,0);
});
test('missing limb is rejected before replacing the procedural character',async()=>{const scene=await load();scene.remove(scene.getObjectByName('LeftArm'));assert.throws(()=>prepareFirefighter(scene),/Missing firefighter limb/);});
