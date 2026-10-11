import {drapeHistoricalStroke} from '../city-explorer/historical-paint-profiles.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {mappedArrowSupport} from '../city-explorer/mapped-arrow-paint.js';
const helper=await import('../city-explorer/fallback-arrow-support.js').catch(()=>({}));
const rectangle=(y)=>[-4,y,-4,-4,y,4,4,y,4,-4,y,-4,4,y,4,4,y,-4];
function fixture(){
 const group=new THREE.Group(),meshes=new Map(),ranges=new Map();
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...rectangle(2),...rectangle(12)],3));
 const mesh=new THREE.Mesh(geometry);mesh.userData={type:'road-surface-batch',material:'roadArterial'};group.add(mesh);meshes.set('mixed',mesh);
 ranges.set('street',[{key:'mixed',startVertex:0,vertexCount:6}]);ranges.set('bridge',[{key:'mixed',startVertex:6,vertexCount:6}]);
 return {THREE,roadGroup:group,generatedRoadMeshes:meshes,roadPaintRanges:ranges,municipalIndex:new RenderedPavementIndex(),
  segments:[{lineId:'street',profile:{bridge:false}},{lineId:'bridge',profile:{bridge:true}}]};
}
test('fallback API exists for default lite mode without municipal meshes',()=>assert.equal(typeof helper.selectMappedArrowSupportIndex,'function'));
test('mixed surface batches preserve exact source bridge provenance and transformed triangles',()=>{
 const f=fixture();f.roadGroup.position.set(20,.25,30);f.roadGroup.rotation.y=.35;
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.equal(index.triangleCount,4);assert.equal(mappedArrowSupport(index,20,30,2,{},{}),2.25);
 assert.equal(mappedArrowSupport(index,20,30,12,{bridge:'yes'},{bridge:true}),12.25);
 assert.equal(mappedArrowSupport(index,20,30,2,{bridge:'yes'},{bridge:true}),null,'Bridge-tagged paint cannot select underlying ordinary face');
 assert.equal(index.sample(100,100),null);
});
test('municipal eligibility gates globally and its holes never use fallback',()=>{
 const f=fixture();f.municipalIndex.addTriangle(100,5,100,100,5,101,101,5,100,{layer:'road_surfaces'});
 const selected=helper.selectMappedArrowSupportIndex(f);assert.equal(selected.sample(0,0),null);
});
test('only visible pavement top faces count, including transformed instanced cap tops',()=>{
 const f=fixture();f.generatedRoadMeshes.clear();f.roadPaintRanges.clear();f.roadGroup.clear();
 const cap=new THREE.InstancedMesh(new THREE.CylinderGeometry(.5,.5,.018,14),new THREE.MeshBasicMaterial(),2);
 cap.userData={type:'road-junction-surfaces',bridgeInstances:[false,true]};
 const dummy=new THREE.Object3D();for(const [i,x,y] of [[0,0,1.009],[1,20,11.009]]){dummy.position.set(x,y,0);dummy.scale.set(6,1,6);dummy.updateMatrix();cap.setMatrixAt(i,dummy.matrix);}
 f.roadGroup.add(cap);f.roadGroup.position.set(4,.125,8);
 for(const type of ['road-foundation-batch','road-junction-foundations','official-curb-ribbons','mapped-turn-arrows']){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(rectangle(99),3));
  const m=new THREE.Mesh(geometry);m.userData={type};f.roadGroup.add(m);
 }
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.ok(Math.abs(index.sample(4,8,1).height-1.143)<1e-6);assert.equal(index.sample(7.2,8),null);
 assert.ok(Math.abs(mappedArrowSupport(index,24,8,11,{bridge:'yes'},{bridge:true})-11.143)<1e-6);
 assert.equal(mappedArrowSupport(index,4,8,1,{bridge:'yes'},{bridge:true}),null);
 cap.visible=false;assert.equal(helper.selectMappedArrowSupportIndex(f).triangleCount,0);
});
test('bounded arrow support omits distant geometry without manufacturing pavement',()=>{
 const f=fixture();f.bounds=[[-1,-1,1,1]];const index=helper.selectMappedArrowSupportIndex(f);
 assert.equal(index.triangleCount,4);assert.equal(index.sample(10,10),null);
 f.bounds=[[100,100,101,101]];assert.equal(helper.selectMappedArrowSupportIndex(f).triangleCount,0);
});
test('connected cap top wins over its own lower ribbon without jumping to a separate deck',()=>{
 const f=fixture();const cap=new THREE.InstancedMesh(new THREE.CylinderGeometry(.5,.5,.018,14),new THREE.MeshBasicMaterial(),1);
 const dummy=new THREE.Object3D();dummy.position.set(0,2.009,0);dummy.scale.set(6,1,6);dummy.updateMatrix();cap.setMatrixAt(0,dummy.matrix);
 cap.userData={type:'road-junction-surfaces',bridgeInstances:[false],sourceLinesByInstance:[['street']]};f.roadGroup.add(cap);
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.ok(Math.abs(index.sample(0,0,2).height-2.018)<1e-6,'The cap actually hides its connected lower ribbon');
 assert.equal(mappedArrowSupport(index,0,0,12,{bridge:'yes'},{bridge:true}),12);
});
test('ordinary approach paint is omitted beneath a connected bridge-class cap',()=>{
 const f=fixture(),cap=new THREE.InstancedMesh(new THREE.CylinderGeometry(.5,.5,.018,14),new THREE.MeshBasicMaterial(),1),dummy=new THREE.Object3D();
 dummy.position.set(0,2.009,0);dummy.scale.set(6,1,6);dummy.updateMatrix();cap.setMatrixAt(0,dummy.matrix);
 cap.userData={type:'road-junction-surfaces',bridgeInstances:[true],sourceLinesByInstance:[['street','bridge']]};f.roadGroup.add(cap);
 assert.equal(mappedArrowSupport(helper.selectMappedArrowSupportIndex(f),0,0,2,{},{}),null);
});
test('zeroed ranges and appended foundation/paint ranges cannot manufacture support',()=>{
 const f=fixture();f.generatedRoadMeshes.get('mixed').geometry.attributes.position.array.fill(0,0,18);
 const extra=new THREE.Mesh(new THREE.BufferGeometry());extra.geometry.setAttribute('position',new THREE.Float32BufferAttribute(rectangle(99),3));extra.userData={type:'road-foundation-batch'};
 f.roadGroup.add(extra);f.generatedRoadMeshes.set('extra',extra);f.roadPaintRanges.get('street').push({key:'extra',startVertex:0,vertexCount:6});
 assert.equal(mappedArrowSupport(helper.selectMappedArrowSupportIndex(f),0,0,2,{},{}),null);
 extra.userData.type='mapped-turn-arrows';assert.equal(mappedArrowSupport(helper.selectMappedArrowSupportIndex(f),0,0,2,{},{}),null);
});
test('overlapping same-deck asphalt selects the visible actual top, not nearest lower ribbon',()=>{
 const f=fixture(),mesh=f.generatedRoadMeshes.get('mixed');
 mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute([...rectangle(2),...rectangle(12),...rectangle(2.2)],3));
 f.roadPaintRanges.set('crossing',[{key:'mixed',startVertex:12,vertexCount:6}]);f.segments.push({lineId:'crossing',profile:{bridge:false}});
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.ok(Math.abs(mappedArrowSupport(index,0,0,2,{},{} )-2.2)<1e-6);
 assert.equal(mappedArrowSupport(index,0,0,12,{bridge:'yes'},{bridge:true}),12);
});
test('separate stacked bridge decks retain height selection and explicit layer conflicts fail closed',()=>{
 const f=fixture(),mesh=f.generatedRoadMeshes.get('mixed');
 mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute([...rectangle(2),...rectangle(12),...rectangle(18),...rectangle(2.2)],3));
 f.roadPaintRanges.set('upper',[{key:'mixed',startVertex:12,vertexCount:6}]);f.segments.push({lineId:'upper',profile:{bridge:true},tags:{layer:'2'}});
 f.roadPaintRanges.set('ambiguous',[{key:'mixed',startVertex:18,vertexCount:6}]);f.segments.push({lineId:'ambiguous',profile:{bridge:false},tags:{layer:'2'}});
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.equal(mappedArrowSupport(index,0,0,12,{bridge:'yes'},{bridge:true}),12);
 assert.equal(mappedArrowSupport(index,0,0,18,{bridge:'yes'},{bridge:true}),18);
 assert.equal(mappedArrowSupport(index,0,0,2,{},{}),null,'Do not guess which conflicting source layer owns a near-coincident deck');
});

const municipalRectangle=(index,y,layer='road_surfaces')=>{const p=rectangle(y);for(let i=0;i<p.length;i+=9)index.addTriangle(...p.slice(i,i+9),{layer});};
test('eligible municipal road paint follows higher actual compatible ribbon without filling holes',()=>{
 const f=fixture();municipalRectangle(f.municipalIndex,1.96);
 const index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.equal(mappedArrowSupport(index,0,0,1.96,{},{}),2);
 assert.equal(mappedArrowSupport(index,8,0,1.96,{},{}),null);
 assert.equal(f.municipalIndex.sample(0,0).height,Math.fround(1.96));
});
test('municipal parking and bridge eligibility remain mandatory before actual-top reconciliation',()=>{
 const f=fixture();municipalRectangle(f.municipalIndex,1.96,'parking_surfaces');
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.equal(mappedArrowSupport(index.forSource({},{}),0,0,2,{},{}),null);
 const tags={highway:'service','turn:lanes':'left'};
 assert.equal(mappedArrowSupport(index.forSource(tags,{}),0,0,2,tags,{}),2);
 assert.equal(mappedArrowSupport(index.forSource({bridge:'yes'},{bridge:true}),0,0,12,{bridge:'yes'},{bridge:true}),null);
});
test('municipal same-deck rule excludes distant bridge and omits conflicting near source layers',()=>{
 const f=fixture();municipalRectangle(f.municipalIndex,1.96);
 let index=helper.selectMappedArrowSupportIndex(f);assert.equal(mappedArrowSupport(index.forSource({},{}),0,0,2,{},{}),2);
 f.segments[0].tags={layer:'2'};
 index=helper.selectMappedArrowSupportIndex(f);assert.equal(mappedArrowSupport(index.forSource({},{}),0,0,2,{},{}),null);
});
test('municipal overlapping road tops reconcile visibly while forbidden parking occlusion fails closed',()=>{
 const f=fixture();f.generatedRoadMeshes.clear();f.roadPaintRanges.clear();f.roadGroup.clear();
 municipalRectangle(f.municipalIndex,2);municipalRectangle(f.municipalIndex,2.1);
 let index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.ok(Math.abs(mappedArrowSupport(index,0,0,2,{},{} )-2.1)<1e-6);
 municipalRectangle(f.municipalIndex,2.2,'parking_surfaces');
 index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.equal(mappedArrowSupport(index,0,0,2,{},{}),null);
});

test('actual mapped parking-aisle road may supply historical Y only inside municipal ROAD footprint',()=>{
 const f=fixture();municipalRectangle(f.municipalIndex,1.7);
 f.generatedRoadMeshes.get('mixed').userData.material='parking';
 f.segments[0].tags={highway:'service',service:'parking_aisle'};
 const index=helper.selectMappedArrowSupportIndex(f).forSource({highway:'residential'},{});
 const inside={width:.15,points:[{x:-1,z:0},{x:1,z:0}]};
 const p=drapeHistoricalStroke(inside,index,1.7);assert.ok(p.length>0);
 for(let i=1;i<p.length;i+=3)assert.ok(Math.abs(p[i]-2.008)<1e-6);
 assert.deepEqual(drapeHistoricalStroke({width:.15,points:[{x:3,z:0},{x:5,z:0}]},index,1.7),[]);
});

test('explicit historical eligibility API never substitutes inferred ribbon height or footprint',()=>{
 const f=fixture();let index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.equal(index.eligibilitySample(0,0,2,{includeParking:false,includeBridges:false}),null);
 municipalRectangle(f.municipalIndex,1.7);index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.ok(Math.abs(index.eligibilitySample(0,0,2,{includeParking:false,includeBridges:false}).height-1.7)<1e-6);
 assert.equal(index.sample(0,0,2,{includeParking:false,includeBridges:false}).height,2);
 assert.equal(index.eligibilitySample(5,0,2,{includeParking:false,includeBridges:false}),null);
});
test('municipal visible-top query scans its cell once while preserving exact eligibility selection',()=>{
 const f=fixture();municipalRectangle(f.municipalIndex,1.96);municipalRectangle(f.municipalIndex,12,'bridges');
 const original=f.municipalIndex.cells.get.bind(f.municipalIndex.cells);let queries=0;
 f.municipalIndex.cells.get=(key)=>{queries++;return original(key);};
 const index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.equal(index.sample(0,0,1.96,{includeParking:false,includeBridges:false}).height,2);
 assert.equal(queries,1,'One exact municipal face scan per contact query');
 for(const height of [1,2,10,12])for(const includeBridges of [true,false]){
  const options={includeBridges,includeParking:false};
  assert.deepEqual(index.eligibilitySample(0,0,height,options),f.municipalIndex.sample(0,0,height,options));
 }
});
test('stale replaced-geometry ranges cannot manufacture source or bridge support',()=>{
 const f=fixture();f.generatedRoadMeshes.get('mixed').userData.roadGeometryRevision=1;
 const index=helper.selectMappedArrowSupportIndex(f);
 assert.equal(mappedArrowSupport(index.forSource({},{}),0,0,2,{},{}),null);
 assert.equal(mappedArrowSupport(index.forSource({bridge:'yes'},{bridge:true}),0,0,12,{bridge:'yes'},{bridge:true}),null);
});
test('unknown higher actual road slices occlude municipal paint but never become eligible',()=>{
 const f=fixture();municipalRectangle(f.municipalIndex,1.96);
 f.generatedRoadMeshes.get('mixed').userData.roadGeometryRevision=1;
 const index=helper.selectMappedArrowSupportIndex(f).forSource({},{});
 assert.equal(index.sample(0,0,1.96,{includeParking:false,includeBridges:false}),null);
 assert.ok(index.eligibilitySample(0,0,1.96,{includeParking:false,includeBridges:false}));
});
