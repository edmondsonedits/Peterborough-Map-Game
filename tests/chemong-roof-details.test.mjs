import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import * as roofs from '../city-explorer/station2-neighborhood-roofs.mjs';

const source=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
const project=p=>new THREE.Vector2((p.lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(p.lat-44.3091)*110540);
const fixtures={
  house:{id:1002815290,wallTop:3.25,roofTop:6.54472,spec:{shape:'gabled',dormers:[.28,.72].map(fraction=>({fraction,widthMetres:1.4,frontInsetMetres:.85,wallHeightMetres:.95,roofRiseMetres:.4,glassWidthMetres:.92,glassHeightMetres:.72}))}},
  dq:{id:446339099,wallTop:2.6,roofTop:4.20948,spec:{shape:'hipped',frontGables:[{fraction:.24,widthMetres:3,riseMetres:.85},{fraction:.5,widthMetres:5.8,riseFraction:1,glazed:true},{fraction:.77,widthMetres:3,riseMetres:.85}]}},
};
function input(name){
  const fixture=fixtures[name],raw=source.elements.find(e=>e.type==='way'&&e.id===fixture.id),ring=raw.geometry.slice(0,-1).map(project);
  const frontage=[ring[0],name==='dq'?ring.at(-1):ring[1]];
  return {...fixture,ring,frontage,triangles:THREE.ShapeUtils.triangulateShape(ring,[])};
}
function inside(x,z,ring){
  let yes=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i],cross=(x-a.x)*(b.y-a.y)-(z-a.y)*(b.x-a.x);
    if(Math.abs(cross)<1e-6&&x>=Math.min(a.x,b.x)-1e-7&&x<=Math.max(a.x,b.x)+1e-7&&z>=Math.min(a.y,b.y)-1e-7&&z<=Math.max(a.y,b.y)+1e-7)return true;
    if((a.y>z)!==(b.y>z)&&x<(b.x-a.x)*(z-a.y)/(b.y-a.y)+a.x)yes=!yes;
  }
  return yes;
}
function area(flat){let sum=0;for(let i=0;i<flat.length;i+=9)sum+=Math.abs((flat[i+3]-flat[i])*(flat[i+8]-flat[i+2])-(flat[i+6]-flat[i])*(flat[i+5]-flat[i+2]))/2;return sum;}
function assertContained(result,fixture){
  assert.equal(result.valid,true,result.reason);
  for(const flat of [result.roofTriangles,result.wallTriangles,result.glassTriangles]){
    assert.equal(flat.length%9,0);
    assert.ok(flat.every(Number.isFinite));
    for(let i=0;i<flat.length;i+=3){
      assert.ok(inside(flat[i],flat[i+2],fixture.ring),'every vertex remains inside source footprint');
      assert.ok(flat[i+1]>=fixture.wallTop-1e-7&&flat[i+1]<=fixture.roofTop+1e-7,'visual envelope stays fixed');
    }
  }
  const expectedArea=Math.abs(THREE.ShapeUtils.area(fixture.ring));
  assert.ok(Math.abs(area(result.roofTriangles)-expectedArea)<1e-5,'roof covers the source outline exactly once without holes or overlapping exposed roof');
  assert.ok(result.roofTriangles.length/9<=1024);
  for(let i=0;i<result.roofTriangles.length;i+=9){
    const f=result.roofTriangles;
    assert.ok((f[i+5]-f[i+2])*(f[i+6]-f[i])-(f[i+3]-f[i])*(f[i+8]-f[i+2])>1e-9,'all roof faces point upward and have nonzero projected area');
  }
}
function assertSingleSurface(flat,ring){
  const xs=ring.map(p=>p.x),zs=ring.map(p=>p.y),minX=Math.min(...xs),minZ=Math.min(...zs),width=Math.max(...xs)-minX,depth=Math.max(...zs)-minZ;
  for(let row=0;row<31;row++)for(let column=0;column<29;column++){
    const x=minX+(column+.371)/29*width,z=minZ+(row+.613)/31*depth;
    let count=0,onEdge=false;
    for(let i=0;i<flat.length;i+=9){
      const ax=flat[i],az=flat[i+2],bx=flat[i+3],bz=flat[i+5],cx=flat[i+6],cz=flat[i+8],denom=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/denom,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/denom,c=1-a-b;
      if(Math.min(a,b,c)>=-1e-8){count++;if(Math.min(a,b,c)<1e-8)onEdge=true;}
    }
    if(!onEdge)assert.equal(count,inside(x,z,ring)?1:0,'each sampled footprint point has exactly one exposed roof surface');
  }
}

test('reviewed eave repartition changes only the inferred visual split and keeps total clearance top',()=>{
  assert.equal(typeof roofs.resolveRecordedRoofHeights,'function','opt-in visual height resolver is available');
  const sourceHeights={foundationTop:100,wallTop:105.17097,roofTop:106.54472,tags:{building:'yes'}};
  assert.deepEqual(roofs.resolveRecordedRoofHeights({...sourceHeights,eaveHeightMetres:3.25}),{wallTop:103.25,roofTop:106.54472,applied:true});
  for(const tags of [{height:'7'},{'roof:height':'2'},{'roof:shape':'hipped'},{'building:roof:shape':'gabled'},{'building:levels':'2'}]){
    assert.deepEqual(roofs.resolveRecordedRoofHeights({...sourceHeights,tags,eaveHeightMetres:3.25}),{wallTop:105.17097,roofTop:106.54472,applied:false});
  }
  for(const eaveHeightMetres of [undefined,NaN,0,9])assert.deepEqual(roofs.resolveRecordedRoofHeights({...sourceHeights,eaveHeightMetres}),{wallTop:105.17097,roofTop:106.54472,applied:false});
});

test('R056 emits exactly two attached dormers with intersected roof, closed cheeks and inset panes',()=>{
  assert.equal(typeof roofs.buildRecordedFrontRoof,'function','recorded roof builder is available');
  const fixture=input('house'),before=fixture.ring.map(p=>p.toArray()),result=roofs.buildRecordedFrontRoof(fixture);
  assertContained(result,fixture);
  assertSingleSurface(result.roofTriangles,fixture.ring);
  assert.equal(result.projections.length,2);
  assert.deepEqual(result.projections.map(p=>p.fraction),[.28,.72]);
  assert.ok(result.projections.every(p=>p.kind==='dormer'&&p.mergedAtBack));
  assert.ok(result.projections.every(p=>Math.abs(p.peakY-5.273)<.03));
  assert.ok(result.glassTriangles.length>0&&result.wallTriangles.length>0);
  assert.deepEqual(fixture.ring.map(p=>p.toArray()),before,'no source ring mutation');
  assert.deepEqual(roofs.buildRecordedFrontRoof(fixture),result,'deterministic output');
});

test('DQ clips three front cross-gables into its real 12-vertex hip roof within the existing top',()=>{
  assert.equal(typeof roofs.buildRecordedFrontRoof,'function','recorded roof builder is available');
  const fixture=input('dq'),result=roofs.buildRecordedFrontRoof(fixture);
  assertContained(result,fixture);
  assertSingleSurface(result.roofTriangles,fixture.ring);
  assert.equal(result.projections.length,3);
  assert.deepEqual(result.projections.map(p=>p.fraction),[.24,.5,.77]);
  assert.ok(result.projections.every(p=>p.kind==='front-gable'&&p.mergedAtBack));
  assert.deepEqual(result.projections.map(p=>+p.peakY.toFixed(5)),[3.45,4.20948,3.45]);
  assert.ok(result.glassTriangles.length>0,'central triangle uses inset glazing');
});

test('reversing source winding retains area, roof height and valid inward projections',()=>{
  assert.equal(typeof roofs.buildRecordedFrontRoof,'function');
  for(const name of ['house','dq']){
    const fixture=input(name);fixture.ring.reverse();fixture.triangles=THREE.ShapeUtils.triangulateShape(fixture.ring,[]);
    assertContained(roofs.buildRecordedFrontRoof(fixture),fixture);
  }
});

test('dormer and gable glazing normals face the photographed street rather than the roof interior',()=>{
  for(const name of ['house','dq']){
    const fixture=input(name),result=roofs.buildRecordedFrontRoof(fixture),[a,b]=fixture.frontage;
    const middle={x:(a.x+b.x)/2,z:(a.y+b.y)/2},center=fixture.ring.reduce((sum,p)=>({x:sum.x+p.x/fixture.ring.length,z:sum.z+p.y/fixture.ring.length}),{x:0,z:0});
    const outward={x:middle.x-center.x,z:middle.z-center.z};
    for(let i=0;i<result.glassTriangles.length;i+=9){
      const f=result.glassTriangles,ab=[f[i+3]-f[i],f[i+4]-f[i+1],f[i+5]-f[i+2]],ac=[f[i+6]-f[i],f[i+7]-f[i+1],f[i+8]-f[i+2]];
      const nx=ab[1]*ac[2]-ab[2]*ac[1],nz=ab[0]*ac[1]-ab[1]*ac[0];
      assert.ok(nx*outward.x+nz*outward.z>0,`${name} glass faces street`);
    }
  }
});

test('invalid, overlapping or over-budget projection requests fail without partial geometry',()=>{
  assert.equal(typeof roofs.buildRecordedFrontRoof,'function');
  const fixture=input('house');
  for(const spec of [undefined,{shape:'gabled',dormers:[]},{shape:'gabled',dormers:{}},{...fixture.spec,dormers:[{...fixture.spec.dormers[0],fraction:NaN}]},{...fixture.spec,dormers:[fixture.spec.dormers[0],fixture.spec.dormers[0]]},{...fixture.spec,dormers:[{...fixture.spec.dormers[0],widthMetres:30}]}]){
    const result=roofs.buildRecordedFrontRoof({...fixture,spec});
    assert.equal(result.valid,false);
    assert.deepEqual(result.roofTriangles,[]);assert.deepEqual(result.wallTriangles,[]);assert.deepEqual(result.glassTriangles,[]);
  }
  const capped=roofs.buildRecordedFrontRoof({...fixture,maxRoofTriangles:1});
  assert.equal(capped.valid,false);assert.deepEqual(capped.roofTriangles,[]);
});
