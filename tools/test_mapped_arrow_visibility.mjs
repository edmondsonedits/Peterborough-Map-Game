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
test('historical visibility isolates historical meshes and keeps each stroke kind',()=>{
 const mesh=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,0,.5,0],3)));mesh.userData={type:'historical-road-paint'};
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;const scene=new THREE.Scene();scene.add(mesh);
 const renderer={domElement:{width:10,height:10},render(){}};
 const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray(400).fill(mesh.geometry.getAttribute('position').array[0]!==0?255:0)}}};
 const result=measureMappedArrowVisibility({THREE,renderer,scene,camera,meshes:new Map([['paint',mesh]]),ranges:[{key:'paint',startVertex:0,vertexCount:3,kind:'dash'}],meshType:'historical-road-paint',createCanvas:()=>({getContext:()=>context})});
 assert.equal(result.targets.length,1);assert.equal(result.targets[0].kind,'dash');assert.ok(result.targets[0].changedPixels>=5);assert.equal(mesh.visible,true);
});
test('historical range attribution cannot borrow pixels from another overlapping stroke',()=>{
 const p=[-.5,-.5,0,.5,-.5,0,0,.5,0];const mesh=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([...p,...p],3)));mesh.userData={type:'historical-road-paint'};
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;const scene=new THREE.Scene();scene.add(mesh);
 const positions=mesh.geometry.getAttribute('position');const original=Array.from(positions.array);
 // Target0 is occluded; only target1 contributes visible pixels, in the same box.
 const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray(400).fill(mesh.visible&&positions.array[9]!==0?255:0)}}};
 const result=measureMappedArrowVisibility({THREE,renderer:{domElement:{width:10,height:10},render(){}},scene,camera,meshes:new Map([['paint',mesh]]),ranges:[{key:'paint',startVertex:0,vertexCount:3,kind:'hidden'},{key:'paint',startVertex:3,vertexCount:3,kind:'visible'}],meshType:'historical-road-paint',createCanvas:()=>({getContext:()=>context})});
 assert.equal(result.targets[0].changedPixels,0);assert.ok(result.targets[1].changedPixels>=5);assert.deepEqual(Array.from(positions.array),original);
 let reads=0;context.getImageData=()=>{if(++reads===2)throw Error('range readback failure');return {data:new Uint8ClampedArray(400).fill(255)};};
 assert.throws(()=>measureMappedArrowVisibility({THREE,renderer:{domElement:{width:10,height:10},render(){}},scene,camera,meshes:new Map([['paint',mesh]]),ranges:[{key:'paint',startVertex:0,vertexCount:3,kind:'hidden'}],meshType:'historical-road-paint',createCanvas:()=>({getContext:()=>context})}),/range readback failure/);
 assert.deepEqual(Array.from(positions.array),original);assert.equal(mesh.visible,true);
});
