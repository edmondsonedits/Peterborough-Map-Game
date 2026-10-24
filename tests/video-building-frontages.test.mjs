import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {createFootageFacade,frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {recordSherbrookeBuilding,sherbrookeBuildings} from '../city-explorer/sherbrooke-plan.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';
const osm=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url)));
const ids=['way/1006243562','way/1006243555','way/176908281'];
const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
function ring(id){const way=osm.elements.find(e=>e.type==='way'&&`way/${e.id}`===id);assert.ok(way?.geometry);return way.geometry.slice(0,-1).map(p=>{const q=project(p.lat,p.lon);return{x:q.x,z:q.y}})}
const make=id=>{assert.ok(FOOTAGE_PROFILES[id],'reviewed video profile exists');const p=FOOTAGE_PROFILES[id];return createFootageFacade({THREE,profile:p,ring:ring(id),base:100,top:100+p.height,project})};
const distance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)};
test('reviewed video sources are captured without admitting unrelated map buildings',()=>{
 for(const id of ids){const r=ring(id).map(p=>({x:p.x,y:p.z})),saved=JSON.stringify(r);recordSherbrookeBuilding(id,r,100,110);assert.ok(sherbrookeBuildings.has(id),'reviewed video source is captured');assert.equal(JSON.stringify(r),saved);assert.equal(sherbrookeBuildings.get(id).top,110)}
 recordSherbrookeBuilding('way/999999999',[],100,110);assert.equal(sherbrookeBuildings.has('way/999999999'),false);
});
test('both corner street faces stay on their matched footprint and share editor visibility',()=>{
 for(const id of ids){const p=FOOTAGE_PROFILES[id];assert.ok(p,'reviewed video profile exists');const r=ring(id),group=make(id);assert.equal(group.userData.frontageCount,id===ids[2]?1:2);
 for(const face of [p,...(p.additionalFrontages||[]).map(f=>({...p,...f}))]){const f=frontageFrame({profile:face,ring:r,project});for(const end of [f.start,f.end])assert.ok(Math.min(...r.map((a,i)=>distance(end,a,r[(i+1)%r.length])))<.05,'reference endpoint is on original footprint')}
 group.traverse(o=>{if(o.isInstancedMesh)assert.ok([...o.instanceMatrix.array].every(Number.isFinite));if(o.isMesh)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite))});
 const registry=createGeneratedRegistry(THREE),key=registry.registerEditableObject(new THREE.Object3D(),{sourceType:'building',sourceId:id,batchBinding:{setVisible(){},restore(){},cloneGeometry:()=>new THREE.Group()}});assert.equal(registry.attachEditableGroup(key,group),true);registry.hide(key);assert.equal(group.visible,false);registry.restore(key);assert.equal(group.visible,true);
 }
});
test('arched attic detail is separate from rectangular main floors and bank bands stay broad',()=>{
 const commerce=make(ids[0]);for(const [faceIndex,count]of [[0,6],[1,16]]){const face=commerce.children[faceIndex],arches=face.getObjectByName('frontage-arched-trim');assert.equal(arches?.count,count);assert.ok(face.getObjectByName('frontage-glass').count>=9,'main floor windows remain rectangular');const m=new THREE.Matrix4();arches.getMatrixAt(0,m);assert.ok(m.elements[13]>109,'attic arches remain above main floors')}
 const bank=make(ids[1]);for(const face of bank.children){const glass=face.getObjectByName('frontage-glass');assert.equal(glass.count,2,'one broad glazing band per observed level');const m=new THREE.Matrix4();glass.getMatrixAt(0,m);assert.ok(m.elements[0]!==0||m.elements[2]!==0)}
 const shop=make(ids[2]);assert.ok(shop.getObjectByName('frontage-#c32732'),'red brand band is geometry, without photo downloads');
});

test('Chemong storefront faces the road and its sign clears the parapet',()=>{
 const p=FOOTAGE_PROFILES[ids[2]],f=frontageFrame({profile:p,ring:ring(ids[2]),project});
 const road=osm.elements.find(e=>e.id===1003268689).geometry.map(q=>{const v=project(q.lat,q.lon);return{x:v.x,z:v.y}});
 const mid={x:(f.start.x+f.end.x)/2,z:(f.start.z+f.end.z)/2};
 const nearest=road.slice(1).map((b,i)=>{const a=road[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((mid.x-a.x)*dx+(mid.z-a.z)*dz)/(dx*dx+dz*dz)));return{x:a.x+t*dx,z:a.z+t*dz}}).sort((a,b)=>Math.hypot(a.x-mid.x,a.z-mid.z)-Math.hypot(b.x-mid.x,b.z-mid.z))[0];
 const dx=nearest.x-mid.x,dz=nearest.z-mid.z;assert.ok((f.outward.x*dx+f.outward.z*dz)/Math.hypot(dx,dz)>.5,'signed wall faces Chemong Road');
 const board=make(ids[2]).getObjectByName('frontage-#c32732'),m=new THREE.Matrix4();board.getMatrixAt(0,m);
 const outset=(m.elements[12]-mid.x)*f.outward.x+(m.elements[14]-mid.z)*f.outward.z;
 assert.ok(outset+.045>.345,'sign board is ahead of projecting parapet');
});

test('sign lettering faces the street for either endpoint ordering',()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
 try{for(const reverse of [false,true]){
  const source=FOOTAGE_PROFILES[ids[2]],p={...source,frontLatLon:reverse?[...source.frontLatLon].reverse():source.frontLatLon},r=ring(ids[2]);
  const f=frontageFrame({profile:p,ring:r,project}),group=createFootageFacade({THREE,profile:p,ring:r,base:100,top:105,project});
  const plate=group.getObjectByName('frontage-procedural-details').children.find(n=>n.material?.map?.isCanvasTexture);assert.ok(plate,'sign lettering mesh exists');
  const normal=new THREE.Vector3(0,0,1).applyEuler(plate.rotation);assert.ok(normal.x*f.outward.x+normal.z*f.outward.z>.999,'front of lettering points toward street');
 }}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous}
});
