import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createHospitalSurfaceFixture} from './hospital-surface-fixture.mjs';
import {analyzePavementContinuity} from './test_pavement_continuity.mjs';
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const digest=source=>createHash('sha256').update(JSON.stringify(source)).digest('hex');
function flaggedEdges(triangles,bounds){
 const cells=new Map(),edges=[],flagged=[];
 function compare(a,b){
  if(Math.abs(cross(a.a,a.b,b.a))/a.length>1e-5||Math.abs(cross(a.a,a.b,b.b))/a.length>1e-4)return;
  if(cross(a.a,a.b,a.c)*cross(a.a,a.b,b.c)>=0)return;
  const dx=(a.b.x-a.a.x)/a.length,dz=(a.b.z-a.a.z)/a.length;
  const at=p=>(p.x-a.a.x)*dx+(p.z-a.a.z)*dz;
  const r=at(b.a),s=at(b.b),start=Math.max(0,Math.min(r,s)),end=Math.min(a.length,Math.max(r,s));
  if(end-start<1e-5)return;
  const delta=Math.max(...[start,end].map(t=>Math.abs(lerp(a.a,a.b,t/a.length).y-lerp(b.a,b.b,(t-r)/(s-r)).y)));
  if(delta<=.025)return;
  flagged.push({start:lerp(a.a,a.b,start/a.length),end:lerp(a.a,a.b,end/a.length),normal:{x:-dz,z:dx},delta});
 }
 for(const triangle of triangles){
  if(triangle.metadata.layer==='bridges')continue;
  const v=[0,3,6].map(i=>({x:triangle.vertices[i],y:triangle.vertices[i+1],z:triangle.vertices[i+2]}));
  if(Math.max(...v.map(p=>p.x))<bounds[0]||Math.min(...v.map(p=>p.x))>bounds[2]||Math.max(...v.map(p=>p.z))<bounds[1]||Math.min(...v.map(p=>p.z))>bounds[3])continue;
  for(let i=0;i<3;i++){
   const a=v[i],b=v[(i+1)%3],c=v[(i+2)%3],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-6)continue;
   const edge={a,b,c,length},id=edges.push(edge)-1,seen=new Set();
   for(let x=Math.floor(Math.min(a.x,b.x)/8);x<=Math.floor(Math.max(a.x,b.x)/8);x++)for(let z=Math.floor(Math.min(a.z,b.z)/8);z<=Math.floor(Math.max(a.z,b.z)/8);z++){
    const key=`${x}:${z}`,previous=cells.get(key)||[];
    for(const other of previous)if(!seen.has(other)){seen.add(other);compare(edges[other],edge);}
    previous.push(id);cells.set(key,previous);
   }
  }
 }
 return flagged;
}
function overlapProbe(fixture,report){
 const worst=report.worst.find(entry=>entry.kind==='overlap');
 if(!worst)return null;
 const [one,two]=worst.triangleIds.map(id=>fixture.baseline[id]);
 const vertices=t=>[0,3,6].map(i=>({x:t.vertices[i],y:t.vertices[i+1],z:t.vertices[i+2]}));
 const b=vertices(two),sign=Math.sign(cross(...b));let polygon=vertices(one);
 for(let edge=0;edge<3;edge++){
  const a=b[edge],c=b[(edge+1)%3],out=[];
  for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,c,p)*sign,dq=cross(a,c,q)*sign;if(dp>=0)out.push(p);if((dp>=0)!==(dq>=0))out.push(lerp(p,q,dp/(dp-dq)));}polygon=out;
 }
 assert.ok(polygon.length>=3,'Target probe must lie in the measured core overlap');
 const point={x:polygon.reduce((sum,p)=>sum+p.x,0)/polygon.length,z:polygon.reduce((sum,p)=>sum+p.z,0)/polygon.length};
 const crossings=[];
 for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*3/4])for(const direction of [-1,1]){
  const normal={x:Math.cos(angle),z:Math.sin(angle)};
  for(const initial of [fixture.terrainHeight(point.x,point.z),fixture.terrainHeight(point.x,point.z)+1,fixture.terrainHeight(point.x,point.z)+3])crossings.push({angle,direction,initial,before:trace(fixture.baselineIndex,point,normal,direction,initial),after:trace(fixture.index,point,normal,direction,initial)});
 }
 return {method:'New equivalent probe at centroid of worst pre-repair core overlap, four headings and both directions; exact historical target path unavailable',...fixture.unproject(point.x,point.z),maximumBeforeStep:Math.max(...crossings.map(c=>c.before.maxStep)),maximumAfterStep:Math.max(...crossings.map(c=>c.after.maxStep)),crossings};
}
function trace(index,point,normal,direction,initial){
 let height=initial,maxStep=0,samples=0,missing=0;
 for(let i=0;i<=100;i++){
  const d=direction*(-.5+i*.01),hit=index.sample(point.x+normal.x*d,point.z+normal.z*d,height);
  if(!hit){missing++;continue;}
  if(samples)maxStep=Math.max(maxStep,Math.abs(hit.height-height));height=hit.height;samples++;
 }
 return {maxStep,samples,missing};
}
const reports=[];
for(const lowPower of [false,true]){
 const fixture=createHospitalSurfaceFixture({lowPower});
 assert.equal(JSON.stringify(fixture.polygons),fixture.sourcePolygons,'Reconciliation must not mutate municipal footprints');
 const [minX,minZ,maxX,maxZ]=fixture.bounds,bounds={minX,minZ,maxX,maxZ};
 assert.ok(Math.abs(maxX-minX-520)<1e-9);assert.ok(Math.abs(maxZ-minZ-520)<1e-9);
 const qa=triangles=>analyzePavementContinuity(triangles,{bounds,maxTriangles:50000,maxCandidatePairs:10000000,cellSize:5});
 const before=qa(fixture.baseline),after=qa(fixture.triangles);
 assert.ok(after.heightViolationCount<before.heightViolationCount,'Full-window geometry violations must decrease');
 const edges=[...flaggedEdges(fixture.baseline,fixture.bounds),...flaggedEdges(fixture.triangles,fixture.bounds)];
 let maximumDeterioration=0,traceCount=0,worst=null;
 for(const edge of edges)for(const t of [.25,.5,.75])for(const direction of [-1,1]){
  const point=lerp(edge.start,edge.end,t),ground=fixture.terrainHeight(point.x,point.z);
  for(const initial of [ground,ground+1,ground+3]){
   const baseline=trace(fixture.baselineIndex,point,edge.normal,direction,initial),current=trace(fixture.index,point,edge.normal,direction,initial);
   const deterioration=current.maxStep-baseline.maxStep;traceCount++;
   if(deterioration>maximumDeterioration){maximumDeterioration=deterioration;worst={...fixture.unproject(point.x,point.z),direction,initial,baseline,current};}
  }
 }
 const coreBounds={minX:fixture.center.x-50,minZ:fixture.center.z-50,maxX:fixture.center.x+50,maxZ:fixture.center.z+50};
 const coreBefore=analyzePavementContinuity(fixture.baseline,{bounds:coreBounds,maxTriangles:50000,maxCandidatePairs:10000000,cellSize:5});
 const coreAfter=analyzePavementContinuity(fixture.triangles,{bounds:coreBounds,maxTriangles:50000,maxCandidatePairs:10000000,cellSize:5});
 const targetProbe=overlapProbe(fixture,coreBefore);
 assert.ok(targetProbe.maximumAfterStep<.01,'New core overlap probe transition stays below one centimetre');
 assert.equal(coreAfter.heightViolationCount,0,'Hospital core geometry has no >25mm seam or overlap mismatch');
 const knownPoint=fixture.project(44.30127890,-78.34761916),point={x:knownPoint.x,z:knownPoint.y};
 const nearest=edges.slice().sort((a,b)=>Math.hypot((a.start.x+a.end.x)/2-point.x,(a.start.z+a.end.z)/2-point.z)-Math.hypot((b.start.x+b.end.x)/2-point.x,(b.start.z+b.end.z)/2-point.z))[0];
 const knownCrossings=[-1,1].map(direction=>({direction,before:trace(fixture.baselineIndex,point,nearest.normal,direction,fixture.terrainHeight(point.x,point.z)),after:trace(fixture.index,point,nearest.normal,direction,fixture.terrainHeight(point.x,point.z))}));
 const sourceBridges=fixture.baseline.filter(t=>t.metadata.layer==='bridges');
 assert.equal(digest(sourceBridges),digest(fixture.triangles.filter(t=>t.metadata.layer==='bridges')),'Bridge triangles stay unchanged');
 const calls=fixture.heightQueries;for(let i=0;i<100;i++)fixture.result.field.sample(fixture.center.x,fixture.center.z);
 const warmed=fixture.heightQueries;for(let i=0;i<100;i++)fixture.result.field.sample(fixture.center.x,fixture.center.z);
 assert.equal(fixture.heightQueries,warmed,'Repeated queries remain cached');
 // Compare longitudinal road contacts at one-metre spacing using previous height.
 let gradeRegressions=0,maxGradeWorsening=0;
 for(const line of fixture.roadLines){
  let previous=null;
  for(let i=1;i<line.samples.length;i++){
   const a=line.samples[i-1],b=line.samples[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
   if(Math.max(a.x,b.x)<minX||Math.min(a.x,b.x)>maxX||Math.max(a.y,b.y)<minZ||Math.min(a.y,b.y)>maxZ)continue;
   for(let step=0;step<=Math.ceil(distance);step++){
    const t=step/Math.ceil(distance),x=a.x+(b.x-a.x)*t,z=a.y+(b.y-a.y)*t;
    const old=fixture.baselineIndex.sample(x,z,previous?.old??a.height),now=fixture.index.sample(x,z,previous?.now??a.height);
    if(old&&now&&previous){const run=Math.hypot(x-previous.x,z-previous.z);if(run>.1){const oldGrade=Math.abs(old.height-previous.old)/run,newGrade=Math.abs(now.height-previous.now)/run;maxGradeWorsening=Math.max(maxGradeWorsening,newGrade-oldGrade);if(newGrade>.15&&newGrade-oldGrade>.05)gradeRegressions++;}}
    previous=old&&now?{x,z,old:old.height,now:now.height}:null;
   }
  }
 }
 const report={profile:lowPower?'low-power':'desktop',windowMetres:520,radius:120,heightSmoothing:4,sourcePolygonDigest:digest(fixture.polygons),sourcePolygonCount:fixture.polygons.length,before,after,coreBefore,coreAfter,targetProbe,knownCrossings,flaggedEdgeCount:edges.length,traceCount,maximumDeterioration,worst,gradeRegressions,maxGradeWorsening,reconcileMilliseconds:fixture.reconcileMilliseconds,heightQueries:calls};
 reports.push(report);console.log(JSON.stringify(report));
 assert.ok(maximumDeterioration<=.001,`Physical previous-height traces worsened by ${maximumDeterioration}m`);
 assert.equal(gradeRegressions,0,'No newly >15% road grade with >5 percentage-point deterioration');
}
if(process.env.HOSPITAL_SURFACE_REPORT)fs.writeFileSync(process.env.HOSPITAL_SURFACE_REPORT,JSON.stringify({scope:'520m municipal fixture; residual outer-window bumps are explicitly retained',reports},null,2)+'\n');
