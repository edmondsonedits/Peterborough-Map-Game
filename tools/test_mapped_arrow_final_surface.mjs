import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createHospitalSurfaceFixture } from './hospital-surface-fixture.mjs';
import { arrowRuntime } from './mapped-arrow-runtime-fixture.mjs';
import { mappedArrowSupport } from '../city-explorer/mapped-arrow-paint.js';
const reports=[];
for (const lowPower of [false,true]) for (const site of ['hospital','south-combined']) {
 const fixture=createHospitalSurfaceFixture({lowPower,...(site==='south-combined'?{center:{lat:44.2722,lon:-78.3412},reconcile:false}:{})});
 const ids=site==='hospital'?[250811909,1414147337,1414147320]:[364843830];
 const runtime=arrowRuntime(fixture.index),segments=[],lines=new Map();
 for(const id of ids) {
  const line=fixture.roadLines.find(line=>line.id===id);assert.ok(line,`source ${id}`);lines.set(id,line);
  const total=line.samples.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-line.samples[i].x,p.y-line.samples[i].y),0);
  let chainStart=0;for(let i=1;i<line.samples.length;i++) {
   const a=line.samples[i-1],b=line.samples[i];
   segments.push({a:new THREE.Vector2(a.x,a.y),b:new THREE.Vector2(b.x,b.y),aY:a.height,bY:b.height,
    tags:line.tags,profile:line.profile,width:line.profile.width,lineId:id,lineLength:total,chainStart});
   chainStart+=Math.hypot(b.x-a.x,b.y-a.y);
  }
  runtime.state.roadPaintRanges.set(String(id),[]);
 }
 const started=performance.now();runtime.run(segments);const elapsed=performance.now()-started;
 for(const id of ids) {
  const line=lines.get(id),ranges=runtime.state.roadPaintRanges.get(String(id));assert.ok(ranges.length>0,`missing arrows ${id} ${lowPower}`);
  let triangles=0,maxError=0,minLift=Infinity;
  for(const range of ranges) {
   const p=runtime.generatedRoadMeshes.get(range.key).geometry.attributes.position.array;
   for(let i=range.startVertex*3;i<(range.startVertex+range.vertexCount)*3;i+=9) {
    assert.ok((p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2])>0,'Final Float32 triangle must face upward');
    const points=[Array.from(p.slice(i,i+3)),Array.from(p.slice(i+3,i+6)),Array.from(p.slice(i+6,i+9))];
    for(const [a,b] of [[0,1],[1,2],[2,0]]) points.push([0,1,2].map(axis=>(points[a][axis]+points[b][axis])/2));
    points.push([0,1,2].map(axis=>(p[i+axis]+p[i+3+axis]+p[i+6+axis])/3));
    for(let n=0;n<points.length;n++) {
     const [x,y,z]=points[n],height=mappedArrowSupport(fixture.index,x,z,y,line.tags,line.profile);
     assert.ok(Number.isFinite(height),`unsupported ${id} centroid`);
     const lift=y-height;minLift=Math.min(minLift,lift);maxError=Math.max(maxError,Math.abs(lift-.008));
     assert.ok(lift>=.0058&&lift<=.0102,`buried/floating ${id}: ${lift}`);
    }
    triangles++;
   }
  }
  reports.push({lowPower,site,id,ranges:ranges.length,triangles,maxLiftErrorMetres:maxError,minLiftMetres:minLift,buildMilliseconds:elapsed});
 }
}
console.log(JSON.stringify({status:'pass',reports},null,2));
