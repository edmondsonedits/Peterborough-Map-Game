import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createArchedOpeningGeometry,createFootageFacade} from '../city-explorer/sherbrooke-footage.js';
test('arched opening is bounded, finite and has a curved crown instead of rectangular top corners',()=>{
 const g=createArchedOpeningGeometry(THREE,1.2,2);g.computeBoundingBox();assert.equal(g.boundingBox.min.x,-.5);assert.equal(g.boundingBox.max.x,.5);assert.equal(g.boundingBox.min.y,-.5);assert.ok(Math.abs(g.boundingBox.max.y-.5)<1e-6);
 const a=g.getAttribute('position');for(let i=0;i<a.count;i++){assert.ok(Number.isFinite(a.getX(i)+a.getY(i)+a.getZ(i)));assert.ok(!(Math.abs(a.getX(i))>.49&&a.getY(i)>.45));}
 assert.throws(()=>createArchedOpeningGeometry(THREE,0,2),TypeError);g.dispose();
});
test('only explicitly reviewed upper floors get batched arches and legacy retains rectangular fallback',()=>{
 const profile={id:'test',style:'retail',height:9,eaveHeight:9,levels:3,windowColumns:4,archedWindowLevels:[2],frontLatLon:[{lat:0,lon:0},{lat:0,lon:12}],porch:false};
 const options={THREE,profile,ring:[{x:0,z:0},{x:12,z:0},{x:12,z:8},{x:0,z:8}],base:0,top:9,project:(lat,lon)=>({x:lon,z:lat})};
 for(const lite of [false,true]){const g=createFootageFacade({...options,lite,visuals:'improved'});assert.equal(g.userData.archedOpeningCount,4);const details=g.getObjectByName('frontage-procedural-details');assert.equal(details.getObjectByName('frontage-upper-arched-trim').count,4);assert.equal(details.getObjectByName('frontage-upper-arched-glass').count,4);assert.ok(details.getObjectByName('frontage-glass').count>=8,'rectangular lower floors remain');}
 const legacy=createFootageFacade({...options,visuals:'legacy'});assert.equal(legacy.userData.archedOpeningCount,0);assert.equal(legacy.getObjectByName('frontage-upper-arched-glass'),undefined);
});


test('single source-backed opening override leaves neighbouring slots rectangular and supports explicit duplicate suppression',()=>{
 const profile={id:'entry',style:'office',height:7,eaveHeight:7,levels:2,windowColumns:3,windowOverrides:[{level:1,column:1,shape:'arch',widthMetres:1.6,heightMetres:4,bottomMetres:1},{level:0,column:1,skip:true}],frontLatLon:[{lat:0,lon:0},{lat:0,lon:12}]};
 const options={THREE,profile,ring:[{x:0,z:0},{x:12,z:0},{x:12,z:8},{x:0,z:8}],base:0,top:7,project:(lat,lon)=>({x:lon,z:lat}),visuals:'improved'};
 const g=createFootageFacade(options),frame=g.getObjectByName('frontage-upper-arched-trim');assert.equal(g.userData.archedOpeningCount,1);assert.equal(frame.count,1);assert.equal(g.getObjectByName('frontage-glass').count,4);
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();frame.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert.equal(position.y,3);assert.ok(Math.abs(scale.y-4)<1e-6);assert.ok(Math.abs(scale.x-1.6)<1e-6);
});
