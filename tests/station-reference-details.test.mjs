import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {canadianFlagPixels,addStationFlowers} from '../city-explorer/station-reference-details.js';
test('original flag raster is deterministic, opaque, with red bands and white field',()=>{
 const a=canadianFlagPixels(),b=canadianFlagPixels();assert.deepEqual(a,b);assert.equal(a.length,128*64*4);
 for(let i=3;i<a.length;i+=4)assert.equal(a[i],255);
 assert.deepEqual(Array.from(a.slice(0,4)),[205,35,48,255]);assert.deepEqual(Array.from(a.slice(64*4,64*4+4)),[246,245,237,255]);
});
test('flowers reuse one instance batch without changing bed geometry',()=>{
 const root=new THREE.Group(),existing=new THREE.Group();root.add(existing);
 const leaves=Array.from({length:25},(_,i)=>({x:i,y:.2,z:1,size:1,angle:i}));
 addStationFlowers(THREE,root,leaves);assert.equal(root.children[0],existing);assert.equal(root.children.length,2);assert.equal(root.children[1].count,5);assert.equal(leaves[0].y,.2);
});
