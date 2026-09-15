import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
// Mirror the browser import map without modifying the vendored loader.
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:specifier,context);}});
const {GLTFLoader}=await import('../city-explorer/vendor/three-r180/examples/jsm/loaders/GLTFLoader.js');
import {BufferGeometry,Float32BufferAttribute} from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {recolorVegetation,createVegetationVariant,stationOneVegetationPalette} from '../city-explorer/vegetation-variants.js';
function fixture() {
 const g=new BufferGeometry();
 g.setAttribute('position',new Float32BufferAttribute([0,0,0,0,8,0,1,7,0],3));
 g.setAttribute('color',new Float32BufferAttribute([.19,.125,.075,.15,.28,.075,.075,.17,.045],3));
 return g;
}
test('variant preserves exact positions, bark, topology and source buffers',()=>{
 const g=fixture(),original=Array.from(g.getAttribute('color').array);
 const a=recolorVegetation(g,'crimson'),b=recolorVegetation(g,'crimson');
 assert.deepEqual(a.getAttribute('position').array,g.getAttribute('position').array);
 assert.deepEqual(Array.from(g.getAttribute('color').array),original);
 assert.deepEqual(a.getAttribute('color').array,b.getAttribute('color').array);
 assert.deepEqual(Array.from(a.getAttribute('color').array).slice(0,3),original.slice(0,3));
 assert.ok(a.getAttribute('color').getX(1)>a.getAttribute('color').getY(1));
 assert.equal(a.getAttribute('position').count,g.getAttribute('position').count);
});
test('all LODs share original material and maintain distances; unknown palettes reject',()=>{
 const material={},family={family:'test',lods:[0,85,190].map((distance,lod)=>({lod,distance,geometry:fixture(),material}))};
 const variant=createVegetationVariant(family,'olive');
 assert.deepEqual(variant.lods.map(l=>l.distance),[0,85,190]);
 assert.ok(variant.lods.every(l=>l.material===material));
 assert.throws(()=>recolorVegetation(fixture(),'unknown'));
});
test('pilot is restricted to the existing station front tree',()=>{
 assert.equal(stationOneVegetationPalette('station1-tree-front'),'crimson');
 for(const id of ['station1-tree-east','district-tree-1',undefined]) assert.equal(stationOneVegetationPalette(id),null);
});
test('actual Blender GLBs retain bounds and budgets in both reusable palettes',async()=>{
 for(const [lod,budget] of [[0,1200],[1,250],[2,60]]) {
  const bytes=fs.readFileSync(`city-explorer/assets/vegetation/broadleaf-lod${lod}.glb`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  let mesh;gltf.scene.traverse(n=>{if(n.isMesh)mesh=n;});
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();
  for(const palette of ['crimson','olive']) {
   const variant=recolorVegetation(geometry,palette);variant.computeBoundingBox();
   assert.deepEqual(variant.boundingBox,geometry.boundingBox);
   assert.ok((variant.index?.count??variant.getAttribute('position').count)/3<=budget);
   assert.ok(Math.abs(variant.boundingBox.min.y)<.1 && variant.boundingBox.max.y>=6 && variant.boundingBox.max.y<=10);
   assert.ok(variant.getAttribute('color').array.every(Number.isFinite));
  }
 }
});
