import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mappedLaneCount } from '../city-explorer/road-network.js';
import { mappedCycleLaneSides, roadLaneMarkingBoundaries } from '../city-explorer/city-detail-rules.js';
const profile = (tags) => ({ highway: tags.highway || 'secondary', lanes: Number(tags.lanes) || 3,
  oneWay: tags.oneway === 'yes' || tags.oneway === '-1' });

test('shared centre turn lane contributes to total vehicle lanes', () => {
  assert.equal(mappedLaneCount({'lanes:forward':'1','lanes:backward':'1','lanes:both_ways':'1'}), 3);
});
test('cycle track and shoulder are not evidence of a painted cycle lane', () => {
  assert.deepEqual(mappedCycleLaneSides({'cycleway:right':'track'}), []);
  assert.deepEqual(mappedCycleLaneSides({cycleway:'shoulder'}), []);
});
test('explicit side-specific no overrides general cycleway lane', () => {
  assert.deepEqual(mappedCycleLaneSides({cycleway:'lane','cycleway:left':'no'}), ['right']);
});
test('three-lane road with shared turn lane has TWO yellow boundaries', () => {
  const tags={highway:'secondary',lanes:'3','lanes:forward':'1','lanes:backward':'1','lanes:both_ways':'1'};
  const boundaries=roadLaneMarkingBoundaries(tags,profile(tags));
  assert.deepEqual(boundaries.map(b=>b.materialKey),['roadPaintYellow','roadPaintYellow']);
});
test('overtaking permission does not establish that yellow paint is broken', () => {
  const tags={highway:'secondary',lanes:'2',overtaking:'yes'};
  assert.equal(roadLaneMarkingBoundaries(tags,profile(tags))[0].pattern,'solid');
});
test('unmarked roads and unmarked residential lanes get no invented dividers', () => {
  for(const tags of [{highway:'secondary',lanes:'2',lane_markings:'no'}, {highway:'residential',lanes:'2'}]) {
    assert.deepEqual(roadLaneMarkingBoundaries(tags,profile(tags)),[]);
  }
});
test('unknown three-lane directional allocation must not invent white-yellow ordering', () => {
  const tags={highway:'secondary',lanes:'3'};
  assert.deepEqual(roadLaneMarkingBoundaries(tags,profile(tags)),[]);
});
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { laneBoundaryOffset, turnLaneOffset, roadDashPattern } from '../city-explorer/city-detail-rules.js';
test('asymmetric lane boundary and arrow are on correct side of original way', () => {
  assert.equal(laneBoundaryOffset(10,3,1),5-10/3);
  const tags={lanes:'3','lanes:backward':'1','lanes:forward':'2'};
  assert.ok(turnLaneOffset(tags,{width:9,lanes:3},'backward',0)>0);
  assert.equal(turnLaneOffset(tags,{width:9,lanes:3},'forward',0),0);
  assert.equal(turnLaneOffset(tags,{width:9,lanes:3},'forward',1),-3);
  assert.deepEqual(roadDashPattern({highway:'secondary',maxspeed:'50'}),{length:3,period:9});
});
test('paint is clipped to exact pavement triangles and conforms to slope', () => {
  const index=new RenderedPavementIndex(5);
  index.addTriangle(0,0,0,10,1,0,0,2,10,{layer:'road_surfaces'});
  assert.equal(typeof index.projectPaintPolygon,'function','Exact pavement projection is required');
  const tris=index.projectPaintPolygon([{x:2,z:2},{x:12,z:2},{x:12,z:3},{x:2,z:3}],.6);
  assert.ok(tris.length>0);
  for(const t of tris) for(const p of t){
    assert.ok(p.x+p.z<=10.000001 && p.x>=0 && p.z>=0);
    assert.ok(Math.abs(p.y-(.1*p.x+.2*p.z+.006))<1e-8);
  }
});
test('road paint never spans a traffic island or jumps onto an overpass', () => {
  const i=new RenderedPavementIndex(10);
  const quad=(x0,x1,y,layer)=>{
    i.addTriangle(x0,y,0,x1,y,0,x1,y,10,{layer});
    i.addTriangle(x0,y,0,x1,y,10,x0,y,10,{layer});
  };
  quad(0,4,0,'road_surfaces');quad(6,10,0,'road_surfaces');quad(0,10,9,'bridges');
  assert.equal(typeof i.projectPaintPolygon,'function');
  const p=[{x:0,z:4},{x:10,z:4},{x:10,z:5},{x:0,z:5}];
  const ground=i.projectPaintPolygon(p,0,{includeBridges:false});
  for(const tri of ground){assert.ok(tri.every(v=>v.y<1));assert.ok(tri.every(v=>v.x<=4.000001)||tri.every(v=>v.x>=5.999999));}
  const upper=i.projectPaintPolygon(p,9,{bridge:true});
  assert.ok(upper.length>0 && upper.every(t=>t.every(v=>v.y>8)));
});
test('reviewed Sherbrooke override changes markings only, not source width or another street', async () => {
  const module=await import('../city-explorer/reviewed-street-markings.js').catch(()=>null);
  assert.ok(module,'Reviewed appearance correction module exists');
  const tags={name:'Sherbrooke Street',lanes:'4',width:'13.7'};
  assert.equal(module.reviewedMarkingTags(tags,'way/460581459:0').lanes,'2');
  assert.equal(module.reviewedMarkingTags(tags,'way/460581459:0').width,'13.7');
  assert.equal(tags.lanes,'4');
  assert.equal(module.reviewedMarkingTags(tags,'way/9999').lanes,'4');
  assert.equal(module.reviewedMarkingTags({...tags,name:'Other Street'},'way/460581459').lanes,'4');
});
import { collectStreetPaint, markingJunctions, paintPoint, renderStreetPaint } from '../city-explorer/street-paint-renderer.js';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
const segment=(tags={},extras={})=>({a:{x:0,y:0},b:{x:0,y:30},aY:0,bY:0,width:9,lineId:'way/1',
  chainStart:0,lineLength:30,aSourceVertex:true,bSourceVertex:true,
  tags:{highway:'secondary',lanes:'3','lanes:forward':'2','lanes:backward':'1',...tags},
  profile:{highway:'secondary',lanes:3,width:9,oneWay:false},...extras});
test('single-lane one-way motorway ramp retains white right and yellow left edges',()=>{
  const tags={highway:'motorway_link',lanes:'1',oneway:'yes'};
  const p=collectStreetPaint([segment(tags,{profile:{highway:'motorway_link',lanes:1,oneWay:true},width:4})]);
  assert.deepEqual([...new Set(p.map(m=>m.materialKey))].sort(),['roadPaintWhite','roadPaintYellow']);
});
test('true crossings count arms, not names; a two-arm name change is not a junction',()=>{
  const a=segment({}, {a:{x:-20,y:0},b:{x:0,y:0},lineId:'west'});
  const b=segment({}, {a:{x:0,y:0},b:{x:20,y:0},lineId:'east'});
  assert.equal(markingJunctions([a,b]).size,0);
  const c=segment({}, {a:{x:0,y:-20},b:{x:0,y:0},lineId:'cross'});
  const d=segment({}, {a:{x:0,y:0},b:{x:0,y:20},lineId:'cross'});
  assert.equal(markingJunctions([a,b,c,d]).size,1);
  assert.equal(markingJunctions([a,b,{...c,aY:9,bY:9},{...d,aY:9,bY:9}]).size,0);
});
test('reviewed Sherbrooke street has yellow divider and no white travel dividers',()=>{
  const road=segment({name:'Sherbrooke Street',lanes:'4'},{lineId:'way/460581459:0',width:13.7,profile:{lanes:4,highway:'secondary'}});
  const paint=collectStreetPaint([road]);
  assert.ok(paint.length>0);
  assert.ok(paint.every(m=>m.materialKey==='roadPaintYellow'&&m.kind==='solid'));
});
test('miter station is continuous across adjacent curve segments',()=>{
  const join={leftX:4.5,leftZ:26,rightX:-4.5,rightZ:34};
  const a=segment({}, {paintB:join});
  const b=segment({}, {a:{x:0,y:30},b:{x:30,y:30},paintA:join});
  assert.deepEqual(paintPoint(a,1,1.5),paintPoint(b,0,1.5));
});
test('rendered triangle instances retain editor ownership and lie on actual pavement',()=>{
  const index=new RenderedPavementIndex(5);
  index.addTriangle(-5,1,0,5,1,0,5,4,30,{layer:'road_surfaces'});
  index.addTriangle(-5,1,0,5,4,30,-5,4,30,{layer:'road_surfaces'});
  const group=new THREE.Group(),attached=[];
  const result=renderStreetPaint({THREE,segments:[segment({lanes:'2'},{width:6,aY:1,bY:4,profile:{highway:'secondary',lanes:2},tags:{highway:'secondary',lanes:'2'}})],
    pavementIndex:index,materials:{roadPaintYellow:new THREE.MeshBasicMaterial(),roadPaintWhite:new THREE.MeshBasicMaterial()},group,
    tileAt:()=>({x:0,z:0}),tileSize:3600,attach:(...v)=>attached.push(v)});
  assert.ok(result.triangles>0 && result.official>0);
  assert.equal(result.triangles,attached.length);
  const matrix=new THREE.Matrix4(),v=new THREE.Vector3();
  for(const mesh of group.children){
    assert.equal(mesh.userData.tileSize,3600);
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      for(const local of [[0,0,0],[1,0,0],[0,0,-1]]){
        v.set(...local).applyMatrix4(matrix);
        const sample=index.sample(v.x,v.z,v.y);
        assert.ok(sample,`Paint outside pavement at ${v.x},${v.z}`);
        assert.ok(Math.abs(v.y-sample.height-.006)<1e-5);
      }
    }
  }
});
