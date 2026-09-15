import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('../city-explorer/vendor/three-r180/build/three.module.min.js');
const {wirePoints,normalizedAsset,installStationStreetscape}=await import('../city-explorer/streetscape-assets.js');
test('wire endpoints remain attached; sag is bounded and deterministic',()=>{
 const a=[0,9,0],b=[30,10,0],p=wirePoints(a,b,.7,20);
 assert.deepEqual(p[0].toArray(),a);assert.deepEqual(p.at(-1).toArray(),b);
 assert.ok(Math.abs(p[10].y-8.8)<1e-10);assert.deepEqual(p,wirePoints(a,b,.7,20));
 assert.throws(()=>wirePoints(a,b,-1));assert.throws(()=>wirePoints(a,b,.7,1));
});
test('normalization grounds a model and preserves shared geometry/material',()=>{
 const scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,2),new THREE.MeshBasicMaterial());mesh.position.set(2,5,3);scene.add(mesh);scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(scene),asset={scene,bounds,size:bounds.getSize(new THREE.Vector3())};
 const placed=normalizedAsset(asset,9);placed.updateMatrixWorld(true);const actual=new THREE.Box3().setFromObject(placed);
 assert.ok(Math.abs(actual.min.y)<1e-9);assert.ok(Math.abs(actual.max.y-9)<1e-9);
 assert.equal(placed.children[0].children[0].geometry,mesh.geometry);
 assert.equal(placed.children[0].children[0].material,mesh.material);
});
test('all installed GLBs have valid local-only dependencies and finite declared bounds',()=>{
 for(const folder of ['trees','props','kenney']){
  const manifest=JSON.parse(fs.readFileSync(`city-explorer/assets/streetscape/${folder}/manifest.json`));
  for(const asset of manifest.assets){
   const data=fs.readFileSync(`city-explorer/assets/streetscape/${folder}/${asset.file}`);
   assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(8),data.length);
   const json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
   for(const m of json.meshes)for(const p of m.primitives){const a=json.accessors[p.attributes.POSITION];assert.ok(a.min.every(Number.isFinite)&&a.max.every(Number.isFinite));}
   for(const img of json.images||[])if(img.uri&&!img.uri.startsWith('data:'))assert.equal(img.uri,'Textures/colormap.png');
   assert.ok(asset.triangles>0&&asset.triangles<=1500);
  }
 }
});
test('missing optional assets leave base scene intact and report fallback',async()=>{
 const previous=globalThis.fetch,doc=globalThis.document;
 globalThis.fetch=async()=>{throw Error('offline fixture');};globalThis.document={documentElement:{dataset:{}}};
 try{
  const group=new THREE.Group(),existing=new THREE.Group();group.add(existing);
  const result=await installStationStreetscape({group,project:()=>({x:0,y:0}),terrainHeightAtWorld:()=>0});
  assert.equal(result.placed,0);assert.equal(result.failed,2);assert.equal(group.children[0],existing);
 }finally{globalThis.fetch=previous;globalThis.document=doc;}
});
