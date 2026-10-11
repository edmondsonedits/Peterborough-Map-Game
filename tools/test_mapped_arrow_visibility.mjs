import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
const {measureMappedArrowVisibility}=await import('../city-explorer/mapped-arrow-visibility.js').catch(()=>({}));
test('QA visibility compares rendered pixels inside real projected arrow geometry and restores visibility',()=>{
 assert.equal(typeof measureMappedArrowVisibility,'function');
 const mesh=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,0,.5,0],3)));mesh.userData={type:'mapped-turn-arrows',kind:'left;through'};
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;camera.updateMatrixWorld();
 const scene=new THREE.Scene();scene.add(mesh);scene.updateMatrixWorld();
 let renders=0;
 const renderer={domElement:{width:10,height:10},render(){renders++;}};
 const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray(400).fill(mesh.visible?255:0)}}};
 const args={THREE,renderer,scene,camera,meshes:new Map([['arrow',mesh]]),ranges:[{key:'arrow',startVertex:0,vertexCount:3}],createCanvas:()=>({getContext:()=>context})};
 const result=measureMappedArrowVisibility(args);assert.equal(result.targets.length,1);assert.equal(result.targets[0].kind,'left;through');assert.ok(result.targets[0].changedPixels>=5);assert.ok(result.targets[0].brighterPixels>=5);assert.equal(mesh.visible,true);assert.equal(renders,3);
 context.getImageData=()=>{throw Error('canvas read failed')};assert.throws(()=>measureMappedArrowVisibility(args));assert.equal(mesh.visible,true);
});
