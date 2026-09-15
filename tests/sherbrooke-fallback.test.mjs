import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('../city-explorer/vendor/three-r180/build/three.module.min.js');
const {installSherbrookeDetails}=await import('../city-explorer/sherbrooke-details.js');
test('missing optional models preserve the base scene and report failures',async()=>{
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document;
 globalThis.fetch=async()=>{throw Error('offline fixture');};globalThis.document={documentElement:{dataset:{}}};
 try {const group=new THREE.Group(),base=new THREE.Group();base.name='untouched city';group.add(base);
 const result=await installSherbrookeDetails({group,project:(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),y:-(lat-44.3091)*110540}),terrainHeightAtWorld:()=>170});
 assert.equal(result.failedAssets,10);assert.equal(group.children[0],base);assert.equal(base.visible,true);assert.equal(base.children.length,0);assert.equal(group.children.length,2);
 group.traverse(n=>{if(n.isInstancedMesh){assert.ok([...n.instanceMatrix.array].every(Number.isFinite));}});
 }finally{globalThis.fetch=oldFetch;globalThis.document=oldDocument;}
});
