import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mappedLaneCount, roadProfile } from '../city-explorer/road-network.js';
import { mappedCycleLaneSides, roadLaneMarkingBoundaries } from '../city-explorer/city-detail-rules.js';
const paint = tags => roadLaneMarkingBoundaries(tags, roadProfile(tags));
test('centre turning lane is part of the total when only directional counts exist',()=>{
 assert.equal(mappedLaneCount({'lanes:forward':'1','lanes:backward':'1','lanes:both_ways':'1'}),3);
});
test('incomplete one-sided counts do not become the total for a two-way road',()=>{
 assert.equal(mappedLaneCount({'lanes:forward':'1'}),null);
});
test('separate tracks, shoulders and shared bus lanes do not imply a painted cycle lane',()=>{
 for(const value of ['track','separate','shoulder','shared_lane','share_busway','no'])assert.deepEqual(mappedCycleLaneSides({cycleway:value}),[],value);
 assert.deepEqual(mappedCycleLaneSides({cycleway:'lane','cycleway:right':'no'}),['left']);
});
test('an overtaking permission is not evidence of a dashed painted centre line',()=>{
 assert.equal(paint({highway:'secondary',lanes:'2',overtaking:'yes'})[0].pattern,'solid');
});
test('explicit divider styling wins over inferred road-class styling',()=>{
 assert.equal(paint({highway:'secondary',lanes:'2',divider:'dashed_line'})[0].pattern,'dash');
 assert.deepEqual(paint({highway:'secondary',lanes:'2',divider:'no'}),[]);
 assert.equal(paint({highway:'secondary',lanes:'2',divider:'double_solid_line'}).length,2);
});
test('both borders of a mapped central bidirectional turn lane are yellow',()=>{
 const rules=paint({highway:'secondary',lanes:'3','lanes:forward':'1','lanes:backward':'1','lanes:both_ways':'1'});
 assert.ok(rules.length>=2);assert.ok(rules.every(r=>r.materialKey==='roadPaintYellow'));
 assert.deepEqual([...new Set(rules.map(r=>r.boundary))],[1,2]);
});
test('odd unallocated lane totals do not invent a direction split',()=>{
 assert.deepEqual(paint({highway:'secondary',lanes:'3'}),[]);
});
test('explicit no markings, service aprons and one-lane roads remain unpainted',()=>{
 assert.deepEqual(paint({highway:'secondary',lanes:'4',lane_markings:'no'}),[]);
 assert.deepEqual(paint({highway:'service',service:'parking_aisle',lanes:'2'}),[]);
 assert.deepEqual(paint({highway:'secondary',oneway:'yes',lanes:'1'}),[]);
});
const helper = await import('../city-explorer/street-paint.js').catch(()=>({}));
test('reviewed Sherbrooke correction is scoped by source ID and never edits geometry',()=>{
 assert.equal(typeof helper.reviewedPaintTags,'function');
 const tags={name:'Sherbrooke Street',highway:'secondary',lanes:'4'};
 const result=helper.reviewedPaintTags(tags,'way/460581459');
 assert.equal(result.lanes,'2');assert.equal(result.divider,'solid_line');assert.equal(tags.lanes,'4');
 assert.equal(helper.reviewedPaintTags(tags,'way/33931786'),tags,'other Sherbrooke segments must not be guessed');
 assert.equal(helper.reviewedPaintTags({...tags,name:'Other road'},'way/460581459').lanes,'4');
});
test('paint is subdivided and all four corners match the supporting road plane',()=>{
 assert.equal(typeof helper.drapePaintStrip,'function');
 const p=helper.drapePaintStrip({x:0,z:0},{x:10,z:0},0.14,(x,z)=>2+x*.02+z*.01,{spacing:2});
 assert.equal(p.length,5*18);
 for(let i=0;i<p.length;i+=3)assert.ok(Math.abs(p[i+1]-(2+p[i]*.02+p[i+2]*.01+.008))<1e-9);
 for(let i=0;i<p.length;i+=9){const a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9);
  assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0,'upward winding');}
});
test('paint stays absent over holes or missing ground, no speculative bridging',()=>{
 assert.equal(typeof helper.drapePaintStrip,'function');
 const p=helper.drapePaintStrip({x:0,z:0},{x:10,z:0},.15,(x,z)=>x>=4&&x<=6?null:0,{spacing:2});
 assert.ok(p.length>0&&p.length<5*18);
 assert.ok(p.every(Number.isFinite));
});
import fs from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { laneCountFor } from '../city-explorer/road-network.js';
import { createFeatureBatchBinding } from '../city-explorer/editor/feature-batch-binding.js';
const app = fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
function renderPaint(tags, lineId = 'way/460581459') {
 const state={roadPaintRanges:new Map([[lineId,[]]]),objectCount:0};
 const group=new THREE.Group(), meshes=new Map();
 const fn=app.match(/^function buildRoadMarkings\([^]*?^\}/m)[0];
 const env={THREE, state, streetscapeGroup:group, generatedRoadMeshes:meshes,
  roadProfile,laneCountFor,roadLaneMarkingBoundaries,mappedCycleLaneSides,
  reviewedPaintTags:helper.reviewedPaintTags,drapePaintStrip:helper.drapePaintStrip,
  roadRenderTileCoordinates:()=>({x:0,z:0}),lowPowerProfile:false,ROAD_RENDER_TILE_SIZE:400,
  materials:{roadPaintYellow:new THREE.MeshBasicMaterial(),roadPaintWhite:new THREE.MeshBasicMaterial()},
  document:{documentElement:{dataset:{}}},gameplaySurfaceAt:(x,z)=>({height:10+.02*x+.01*z,onRoad:true})};
 const run=Function(...Object.keys(env), fn+';return buildRoadMarkings;')(...Object.values(env));
 run([{a:new THREE.Vector2(0,0),b:new THREE.Vector2(20,0),aY:1,bY:2,
   aSourceVertex:true,bSourceVertex:true,lineId,chainStart:0,width:9,name:tags.name,
   profile:roadProfile(tags),tags}]);
 return {state,group,meshes};
}
test('actual app renderer draws only one solid yellow centre on reviewed Sherbrooke',()=>{
 const {group}=renderPaint({highway:'secondary',name:'Sherbrooke Street',lanes:'4'});
 assert.equal(group.children.length,1);
 const mesh=group.children[0];assert.equal(mesh.userData.material,'roadPaintYellow');
 assert.equal(mesh.userData.type,'road-centre-lines');
 const p=mesh.geometry.getAttribute('position');
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-(10+.02*p.getX(i)+.01*p.getZ(i)+.008))<2e-6);
});
test('asymmetric backward lanes place the yellow boundary on the correct side',()=>{
 const {group}=renderPaint({highway:'secondary',lanes:'3','lanes:backward':'2','lanes:forward':'1'},'way/other');
 const yellow=group.children.find(m=>m.userData.material==='roadPaintYellow');
 const p=yellow.geometry.getAttribute('position');let z=0;for(let i=0;i<p.count;i++)z+=p.getZ(i);
 assert.ok(Math.abs(z/p.count-1.5)<1e-5);
});
test('existing road editor bindings can hide and restore final draped paint',()=>{
 const {state,meshes,group}=renderPaint({highway:'secondary',name:'Sherbrooke Street',lanes:'4'});
 const ranges=state.roadPaintRanges.get('way/460581459');assert.ok(ranges.length);
 const binding=createFeatureBatchBinding(ranges,k=>meshes.get(k));
 const attr=group.children[0].geometry.getAttribute('position'), before=attr.array.slice();
 binding.setVisible(false);assert.ok(attr.array.every(v=>v===0));
 binding.restore();assert.deepEqual(attr.array,before);
});
test('source road paint is built once after municipal surfaces rather than during OSM parsing',()=>{
 assert.equal((app.match(/buildRoadMarkings\(roadSegments\)/g)||[]).length,0);
 assert.match(app,/buildRoadMarkings\(state\.roadMarkingSegments \|\| \[\]\)/);
});
