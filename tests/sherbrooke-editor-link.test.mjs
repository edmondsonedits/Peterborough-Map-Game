import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';

test('reviewed facade follows generated hide, restore and source-copy replacement', () => {
 const registry=createGeneratedRegistry(THREE), proxy=new THREE.Object3D();proxy.position.set(100,20,300);
 let baseVisible=true;
 const binding={setVisible:v=>{baseVisible=v;},restore:()=>{baseVisible=true;},cloneGeometry:()=>new THREE.Group()};
 const id=registry.registerEditableObject(proxy,{sourceType:'building',sourceId:'way/1009651229',batchBinding:binding});
 const scene=new THREE.Group(), detail=new THREE.Group();scene.position.set(5,0,-3);detail.position.set(101,20,300);scene.add(detail);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,3,1),new THREE.MeshStandardMaterial({color:'red'}));detail.add(mesh);
 assert.equal(registry.attachEditableGroup(id,detail),true);assert.equal(registry.attachEditableGroup(id,detail),true);
 detail.updateMatrix();detail.matrixAutoUpdate=false; // The production city freezes static transforms.
 registry.hide(id);assert.equal(baseVisible,false);assert.equal(detail.visible,false);
 const clone=registry.cloneEditableObject(id);assert.equal(clone.children.length,1);assert.equal(clone.children[0].visible,true);
 assert.deepEqual(clone.children[0].position.toArray(),[6,0,-3]);
 clone.updateMatrixWorld(true);assert.deepEqual(clone.children[0].getWorldPosition(new THREE.Vector3()).toArray(),[6,0,-3]);
 const copied=clone.children[0].children[0];assert.notEqual(copied.geometry,mesh.geometry);assert.notEqual(copied.material,mesh.material);
 copied.material.color.set('blue');assert.equal(mesh.material.color.getHex(),0xff0000);
 registry.restore(id);assert.equal(baseVisible,true);assert.equal(detail.visible,true);
});
test('late attachment respects a hidden source; unsupported sources fail closed',()=>{
 const registry=createGeneratedRegistry(THREE),proxy=new THREE.Object3D();
 const id=registry.registerEditableObject(proxy,{sourceType:'building',sourceId:'way/7',batchBinding:{setVisible(){}}});
 registry.hide(id);const detail=new THREE.Group();assert.equal(registry.attachEditableGroup(id,detail),true);assert.equal(detail.visible,false);
 assert.equal(registry.attachEditableGroup('missing',new THREE.Group()),false);
 const plain=registry.registerEditableObject(new THREE.Group(),{sourceType:'tree',sourceId:'tree/1'});
 assert.equal(registry.attachEditableGroup(plain,new THREE.Group()),false);
});

test('copying a hidden batch preserves its source geometry for editor replacement',async()=>{
 const {createFeatureBatchBinding}=await import('../city-explorer/editor/feature-batch-binding.js');
 const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial());
 const positions=[100,20,300,102,20,300,100,23,300];
 mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const binding=createFeatureBatchBinding([{key:'wall',startVertex:0,vertexCount:3}],()=>mesh);
 binding.setVisible(false);
 const copied=binding.cloneGeometry(THREE,new THREE.Vector3(100,20,300));
 assert.deepEqual(Array.from(copied.children[0].geometry.attributes.position.array),[0,0,0,2,0,0,0,3,0]);
 assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),Array(9).fill(0));
});
