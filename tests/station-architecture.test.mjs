import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {addStationArchitecturalDetails} from '../city-explorer/station-architecture.js';
test('station apparatus details fit the facade and preserve the parent transform',()=>{
 const group=new THREE.Group();group.position.set(10,170,-20);const before=group.position.toArray();addStationArchitecturalDetails(THREE,group,'apparatus',24,6.03);
 assert.deepEqual(group.position.toArray(),before);assert.equal(group.children.filter(x=>x.name==='bay-canopy').length,5);assert.equal(group.children.filter(x=>x.name==='yellow-bollard').length,6);
 for(const m of group.children){assert.ok(m.position.toArray().every(Number.isFinite));assert.ok(Math.abs(m.position.x)<=12);if(m.name.startsWith('roof-')||m.name.startsWith('radio-'))assert.ok(m.position.z<0);}
});
test('roof additions are omitted if the authoritative roof height is unavailable',()=>{
 const g=new THREE.Group();addStationArchitecturalDetails(THREE,g,'apparatus',24,undefined);assert.ok(!g.children.some(m=>m.name.startsWith('roof-')||m.name.startsWith('radio-')));
});
