import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { mappedTurnLaneGroups } from '../city-explorer/city-detail-rules.js';
import { mappedArrowLaneOffsets, mappedArrowTriangles, drapeMappedArrowTriangles, mappedArrowSupport } from '../city-explorer/mapped-arrow-paint.js';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { createFeatureBatchBinding } from '../city-explorer/editor/feature-batch-binding.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const source=JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements;
import { arrowRuntime } from './mapped-arrow-runtime-fixture.mjs';
const plane = (height,layer='road_surfaces') => {const index=new RenderedPavementIndex();index.addTriangle(-100,height,-100,100,height,-100,100,height,100,{layer});index.addTriangle(-100,height,-100,100,height,100,-100,height,100,{layer});return index;};
test('real source compound movements and blank slots survive parsing',()=>{
 for(const [id,expected] of [[364843830,['left;through','right']],[1414147320,['left','through;right']],[1414147337,['left',null]]]) {
  const tags=source.find(e=>e.type==='way'&&e.id===id).tags;
  assert.deepEqual(mappedTurnLaneGroups(tags)[0].symbols,expected);
 }
 const groups=mappedTurnLaneGroups({oneway:'-1','turn:lanes':'left||through;right'},{oneWay:true});
 assert.equal(groups[0].direction,'backward');assert.deepEqual(groups[0].symbols,['left',null,'through;right']);
});
test('asymmetric lane slots use driver-left-positive frame and preserve blanks',()=>{
 for(const id of [364843830,1414147320]) {
  const tags=source.find(e=>e.id===id).tags, group=mappedTurnLaneGroups(tags)[0];
  assert.deepEqual(mappedArrowLaneOffsets(tags,{},group,9),[0,-3]);
 }
 const tags={oneway:'yes',lanes:'3','turn:lanes':'left||right'}, group=mappedTurnLaneGroups(tags)[0];
 assert.deepEqual(mappedArrowLaneOffsets(tags,{},group,9),[3,0,-3]);
});
test('all triangle windings face upward, including compound heads',()=>{
 for(const kind of ['through','left','right','left;through','through;right','left;through;right']) {
  const p=mappedArrowTriangles(kind);for(let i=0;i<p.length;i+=9) {
   const a=new THREE.Vector3(...p.slice(i,i+3)),b=new THREE.Vector3(...p.slice(i+3,i+6)),c=new THREE.Vector3(...p.slice(i+6,i+9));
   assert.ok(b.sub(a).cross(c.sub(a)).y>0,kind);
  }
  if(kind.includes('left'))assert.ok(p.some((x,i)=>i%3===0&&x>1.5));
  if(kind.includes('right'))assert.ok(p.some((x,i)=>i%3===0&&x< -1.5));
 }
});
test('real app quaternion and world matrices preserve side at north/east/diagonal and reverse one-way',()=>{
 for(const [dx,dz] of [[0,-1],[1,0],[Math.SQRT1_2,Math.SQRT1_2]])for(const reverse of [false,true]) {
  const runtime=arrowRuntime(plane(7));const lineId='way/test';runtime.state.roadPaintRanges.set(lineId,[]);
  const tags={oneway:reverse?'-1':'yes',highway:'tertiary',lanes:'2','turn:lanes':'left|'};
  runtime.run([{a:new THREE.Vector2(-dx*20,-dz*20),b:new THREE.Vector2(dx*20,dz*20),aY:-5,bY:-5,
    width:6,lineLength:40,lineId,tags,profile:{oneWay:true,lanes:2}}]);
  const p=runtime.streetscapeGroup.children[0].geometry.attributes.position;
  const sign=reverse?-1:1,side=new THREE.Vector3(dz*sign,0,-dx*sign);
  let max=-Infinity,min=Infinity;for(let i=0;i<p.count;i++) {
   const point=new THREE.Vector3().fromBufferAttribute(p,i);assert.ok(Math.abs(point.y-7.008)<1e-5);
   const offset=point.dot(side);max=Math.max(max,offset);min=Math.min(min,offset);
  }
  assert.ok(max>3.07&&max<3.09);assert.ok(min>1.35&&min<1.37);
  assert.equal(runtime.state.roadPaintRanges.get(lineId).length,1);
  assert.equal(runtime.state.mappedArrowBuild.count,1);
  assert.equal(runtime.state.mappedArrowBuild.vertices,p.count);
  assert.equal(runtime.state.mappedArrowBuild.triangles,p.count/3);
  assert.ok(runtime.state.mappedArrowBuild.cpuMilliseconds>=0);
 }
});
test('bounded draping clips missing and discontinuous supports and retains 8mm lift',()=>{
 let queries=0;assert.deepEqual(drapeMappedArrowTriangles([0,0,0,0,0,2,2,0,0],()=>{queries++;return null;}),[]);assert.ok(queries<5000);assert.equal(queries,7);
 const sample=(x,z)=>x>.5&&x<.65?null:x>=.65?4:2+x*.1+z*.2;
 const vertices=drapeMappedArrowTriangles([0,0,0,0,0,2,2,0,0],sample);
 assert.ok(vertices.length>0);
 for(let i=0;i<vertices.length;i+=9) {
  const a=vertices.slice(i,i+3),b=vertices.slice(i+3,i+6),c=vertices.slice(i+6,i+9);
  for(const p of [a,b,c,[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3]]) {
   assert.ok(Number.isFinite(sample(p[0],p[2])));assert.ok(Math.abs(p[1]-sample(p[0],p[2])-.008)<=.00201);
  }
  assert.ok(Math.max(Math.hypot(a[0]-b[0],a[2]-b[2]),Math.hypot(c[0]-b[0],c[2]-b[2]),Math.hypot(a[0]-c[0],a[2]-c[2]))<=.2);
 }
});
test('parking needs mapped service evidence; bridges cannot fall through to street',()=>{
 const index=plane(3,'parking_surfaces');
 assert.equal(mappedArrowSupport(index,0,0,0,{highway:'tertiary','turn:lanes':'left'}),null);
 assert.equal(mappedArrowSupport(index,0,0,0,{highway:'service'}),null);
 assert.equal(mappedArrowSupport(index,0,0,0,{highway:'service','turn:lanes:backward':'left|through;right'}),3);
 assert.equal(mappedArrowSupport(plane(3),0,0,0,{bridge:'yes','turn:lanes':'left'}),null);
 assert.equal(mappedArrowSupport(plane(12,'bridges'),0,0,12,{bridge:'yes','turn:lanes':'left'}),12);
 assert.equal(mappedArrowSupport(plane(12,'bridges'),0,0,12,{'turn:lanes':'left'}),null);
});
test('late arrow ranges preserve real editor hide, appearance and restore bindings',()=>{
 const r=arrowRuntime(plane(2)),lineId='way/editor',ranges=[];r.state.roadPaintRanges.set(lineId,ranges);
 const binding=createFeatureBatchBinding(ranges,key=>r.generatedRoadMeshes.get(key));
 r.run([{a:new THREE.Vector2(0,-20),b:new THREE.Vector2(0,20),aY:0,bY:0,width:6,lineLength:40,lineId,
  tags:{oneway:'yes',lanes:'2','turn:lanes':'left;through|right'},profile:{oneWay:true}}]);
 assert.equal(ranges.length,2);const originals=[...r.generatedRoadMeshes.values()].map(m=>m.geometry.attributes.position.array.slice());
 binding.setVisible(false);for(const mesh of r.generatedRoadMeshes.values())assert.ok(mesh.geometry.attributes.position.array.every(v=>v===0));
 assert.equal(binding.setAppearance({color:'#123456'}),true);binding.restore();
 [...r.generatedRoadMeshes.values()].forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,originals[i]));
});
test('arrow rendering is deferred until final municipal surfaces',()=>{
 assert.equal((app.match(/buildMappedTurnArrows\(roadSegments\)/g)||[]).length,0);
 assert.ok(app.indexOf('buildMappedTurnArrows(state.roadMarkingSegments')>app.indexOf('summary.officialRoadSurfaces = await buildOfficialRoadSurfaces'));
});
test('contradictory total or directional counts fail closed',()=>{
 const bad=[
  {lanes:'3','lanes:forward':'2','lanes:backward':'2','turn:lanes:forward':'left|right'},
  {lanes:'3','lanes:forward':'1','lanes:backward':'2','turn:lanes:forward':'left|right'},
  {oneway:'yes',lanes:'3','turn:lanes':'left|right'},
  {lanes:'3','turn:lanes:forward':'left|right','turn:lanes:backward':'left|right'},
 ];
 for(const tags of bad)assert.deepEqual(mappedTurnLaneGroups(tags),[]);
 assert.deepEqual(mappedArrowLaneOffsets(bad[0],{}, {direction:'forward',symbols:['left','right'],oneWay:false},9),[]);
});
test('one-way directional evidence overrides generic and wrong direction never emits',()=>{
 assert.deepEqual(mappedTurnLaneGroups({oneway:'yes',lanes:'2','turn:lanes':'through|through','turn:lanes:forward':'left|right','turn:lanes:backward':'left|left'}),[
  {direction:'forward',symbols:['left','right'],oneWay:true}]);
 assert.deepEqual(mappedTurnLaneGroups({oneway:'-1',lanes:'2','turn:lanes':'through|through','turn:lanes:backward':'left|right','turn:lanes:forward':'right|right'}),[
  {direction:'backward',symbols:['left','right'],oneWay:true}]);
});

test('directional slot evidence allocates both carriageways when counts absent',()=>{
 const tags={'turn:lanes:forward':'left|through','turn:lanes:backward':'left|through'};
 for(const group of mappedTurnLaneGroups(tags))assert.deepEqual(mappedArrowLaneOffsets(tags,{},group,12),[-1.5,-4.5]);
});

test('irrelevant opposite one-way turn tag cannot widen lane allocation',()=>{
 const tags={oneway:'-1',lanes:'2','turn:lanes:backward':'left|right','turn:lanes:forward':'left|right'};
 assert.deepEqual(mappedArrowLaneOffsets(tags,{},mappedTurnLaneGroups(tags)[0],6),[1.5,-1.5]);
});
test('long narrow arrow patches preserve coverage without quadratic uniform subdivision',()=>{
 const source=mappedArrowTriangles('left');let queries=0;
 const output=drapeMappedArrowTriangles(source,(x,z)=>{queries++;return 3+x*.01+z*.02;});
 const area=p=>{let sum=0;for(let i=0;i<p.length;i+=9)sum+=Math.abs((p[i+3]-p[i])*(p[i+8]-p[i+2])-(p[i+5]-p[i+2])*(p[i+6]-p[i]))/2;return sum;};
 assert.ok(Math.abs(area(output)-area(source))<1e-6,'All supported projected arrow coverage must remain');
 assert.ok(output.length/9<=300,`Flat left arrow used ${output.length/9} triangles; narrow patches should not be uniformly quartered`);
 assert.ok(queries<=1500,`Flat left arrow needed ${queries} surface queries`);
});
test('mapped paint is omitted when neither municipal nor actual fallback pavement support exists',()=>{
 const r=arrowRuntime(null),lineId='way/compatibility';r.state.roadPaintRanges.set(lineId,[]);
 r.run([{a:new THREE.Vector2(0,0),b:new THREE.Vector2(0,40),aY:2,bY:2,chainStart:0,lineLength:40,lineId,width:7,
 tags:{highway:'secondary',lanes:'2',oneway:'yes','turn:lanes':'left;through|right'},profile:{lanes:2,oneWay:true,highway:'secondary'}}]);
 assert.equal(r.streetscapeGroup.children.length,0);assert.equal(r.state.mappedArrowBuild.count,0);assert.equal(r.state.roadPaintRanges.get(lineId).length,0);
});
