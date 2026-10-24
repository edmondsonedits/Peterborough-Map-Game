import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {ROUTE_BUILDING_PROFILES} from '../city-explorer/route-building-profiles.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {createFootageFacade,frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';
const evidence=JSON.parse(readFileSync(new URL('../city-explorer/route-building-evidence.json',import.meta.url),'utf8'));
const osm=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
const ring=id=>osm.elements.find(e=>e.type==='way'&&`way/${e.id}`===id).geometry.slice(0,-1).map(p=>{const v=project(p.lat,p.lon);return{x:v.x,z:v.y}});
const make=p=>createFootageFacade({THREE,profile:p,ring:ring(p.id),base:100,top:100+p.eaveHeight+p.roofRise,project});
const distance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)};
test('every corridor inventory entry is accounted for without losing previous photo profiles',()=>{
 assert.ok(evidence.inventory.length>=45);assert.equal(new Set(evidence.inventory.map(x=>x.id)).size,evidence.inventory.length);
 for(const row of evidence.inventory){assert.ok(['updated','existing-reviewed','retained-occluded','retained-complex','excluded-roof','excluded-behind'].includes(row.status));assert.ok(row.reason);if(row.status==='updated')assert.ok(ROUTE_BUILDING_PROFILES.some(p=>p.id===row.id));if(row.status==='existing-reviewed')assert.ok(FOOTAGE_PROFILES[row.id])}
 assert.ok(ROUTE_BUILDING_PROFILES.length>=24);
 assert.equal(Object.values(FOOTAGE_PROFILES).filter(p=>p.facadePhoto).length,6);
});
test('route facades stay on their matched footprint, retain source evidence and share editor visibility',()=>{
 for(const p of ROUTE_BUILDING_PROFILES){assert.equal(FOOTAGE_PROFILES[p.id],p);assert.ok(p.reference.sourceFrameSha256.match(/^[a-f0-9]{64}$/));assert.ok(p.reference.neighborSeconds.length>=2);
 const r=ring(p.id),g=make(p);
 for(const face of [p,...(p.additionalFrontages||[]).map(x=>({...p,...x}))]){const f=frontageFrame({profile:face,ring:r,project});for(const q of [f.start,f.end])assert.ok(Math.min(...r.map((a,i)=>distance(q,a,r[(i+1)%r.length])))<.06,`${p.id} edge on footprint`)}
 g.traverse(o=>{if(o.isInstancedMesh)assert.ok([...o.instanceMatrix.array].every(Number.isFinite));if(o.isMesh)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite))});
 const registry=createGeneratedRegistry(THREE),key=registry.registerEditableObject(new THREE.Object3D(),{sourceType:'building',sourceId:p.id,batchBinding:{setVisible(){},restore(){},cloneGeometry:()=>new THREE.Group()}});assert.equal(registry.attachEditableGroup(key,g),true);registry.hide(key);assert.equal(g.visible,false);registry.restore(key);assert.equal(g.visible,true);
 }
});
test('recorded tall apartment gets all ten floors and office keeps its vertical glazed entry',()=>{
 const tower=ROUTE_BUILDING_PROFILES.find(p=>p.id==='way/472446708'),g=make(tower),glass=g.getObjectByName('frontage-glass'),matrix=new THREE.Matrix4();let high=0;for(let i=0;i<glass.count;i++){glass.getMatrixAt(i,matrix);high=Math.max(high,matrix.elements[13])}assert.ok(high>125,'upper apartment floors are not clamped to five');
 const office=make(ROUTE_BUILDING_PROFILES.find(p=>p.id==='way/1031042883'));const pane=office.getObjectByName('frontage-glass');let tall=false;for(let i=0;i<pane.count;i++){pane.getMatrixAt(i,matrix);if(matrix.elements[5]>15)tall=true}assert.ok(tall,'observed blue vertical entry is retained separately from horizontal window bands');
});
test('complex compounds preserve mapped massing and omit invented retail openings on blank walls',()=>{
 const p=ROUTE_BUILDING_PROFILES.find(p=>p.id==='way/995887447');assert.equal(p.preserveMappedMassing,true);assert.ok(p.detailHeightMetres<p.eaveHeight);
 const blank=ROUTE_BUILDING_PROFILES.find(p=>p.id==='way/1009651261'),g=make(blank);assert.equal(g.getObjectByName('frontage-glass'),undefined,'observed blank performance-hall wall stays blank');
});

test('full recording resolves two earlier Sherbrooke floor-count uncertainties',()=>{
 for(const id of ['way/1006575731','way/1009651239']){assert.equal(FOOTAGE_PROFILES[id].levels,2);assert.equal(FOOTAGE_PROFILES[id].reference.file,'VID_20261018_073202_00_001.insv')}
});

test('renderer and streetscape share one mutable captured-building registry',()=>{
 const resolve=file=>{const source=readFileSync(new URL(`../city-explorer/${file}`,import.meta.url),'utf8');const spec=source.match(/from ['"]([^'"]*sherbrooke-plan\.js[^'"]*)['"]/)[1];return new URL(spec,new URL(`../city-explorer/${file}`,import.meta.url)).href};
 assert.equal(resolve('app.js'),resolve('sherbrooke-details.js'),'query tokens must not split the captured building/sidewalk maps');
});

test('reviewed source footprints bypass the generic point cap so details stay on the rendered wall',async()=>{
 const {simplifyRing}=await import('../city-explorer/feature-utils.js');const source=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8'),body=source.match(/function coordinatesToRing\([^]*?\r?\n}\r?\n/)[0];const convert=new Function('THREE','FOOTAGE_PROFILES','project','simplifyRing',body+';return coordinatesToRing;')(THREE,FOOTAGE_PROFILES,project,simplifyRing);
 const p=FOOTAGE_PROFILES['way/1031894168'],coords=osm.elements.find(e=>`way/${e.id}`===p.id).geometry.map(p=>[p.lon,p.lat]);assert.ok(coords.length>110);const r=convert(coords,p.id);assert.equal(r.length,coords.length,'complex reviewed outline must retain its original corners');
 for(const face of [p,...p.additionalFrontages])for(const q of face.frontLatLon){const v=project(q.lat,q.lon);assert.ok(Math.min(...r.map((a,i)=>distance({x:v.x,z:v.y},{x:a.x,z:a.y},{x:r[(i+1)%r.length].x,z:r[(i+1)%r.length].y})))<.05,'facade endpoints stay on the geometry actually used by the renderer')}
 assert.ok(convert(coords,'unreviewed').length<coords.length,'unreviewed city retains existing simplification budget');
});
