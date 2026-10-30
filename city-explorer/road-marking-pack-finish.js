import {markingSurfaceAt, projectMarkingTriangles} from './road-marking-projection.js?v=1.6.156';

const DEFAULTS={lift:.012,minClearance:.006,maxClearance:.025,maxHeightDelta:.5,maxLowering:.025,maxSubdivisionDepth:6};
const cross=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
const triArea=points=>Math.abs(cross(...points))/2;
function heightAtTriangle(points,x,z){
 const [a,b,c]=points,den=cross(a,b,c);
 if(Math.abs(den)<1e-10)return (a[1]+b[1]+c[1])/3;
 const wb=((x-a[0])*(c[2]-a[2])-(z-a[2])*(c[0]-a[0]))/den;
 const wc=((b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]))/den;
 return a[1]*(1-wb-wc)+b[1]*wb+c[1]*wc;
}

function faceHeight(face,x,z){
 const dx=x-face.ax,dz=z-face.az;
 return face.ay+(dx*face.vz-dz*face.vx)*face.inverse*face.dyB+(face.ux*dz-face.uz*dx)*face.inverse*face.dyC;
}

/** Combine exact rendered pavement faces under a stable visible-surface query.
 * At stacked crossings, the nearest grade anchors the query; the highest face
 * within 0.5 m of that grade is the visible envelope used for paint. */
export function createVisibleMarkingIndex(indices,{maxLowering=Infinity,maxHeightDelta=2}={}){
 const cellSize=12,sourceIndices=indices||[];
 let cells;
 if(sourceIndices.length===1&&sourceIndices[0]?.cellSize===cellSize&&sourceIndices[0].cells instanceof Map){
  // The compiler supplies one global final-contact index; keep its large cell
  // map shared instead of duplicating millions of face references per group.
  cells=sourceIndices[0].cells;
 }else{
  cells=new Map();const all=[],seen=new Set();
  for(const index of sourceIndices)for(const faces of index?.cells?.values?.()||[])for(const face of faces){
   if(seen.has(face)||face.metadata?.parking||face.metadata?.layer==='parking_surfaces')continue;seen.add(face);all.push(face);
  }
  for(const face of all){
   const minX=Math.min(face.ax,face.ax+face.ux,face.ax+face.vx),maxX=Math.max(face.ax,face.ax+face.ux,face.ax+face.vx);
   const minZ=Math.min(face.az,face.az+face.uz,face.az+face.vz),maxZ=Math.max(face.az,face.az+face.uz,face.az+face.vz);
   for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++){
    const key=`${x}:${z}`;let bucket=cells.get(key);if(!bucket){bucket=[];cells.set(key,bucket);}bucket.push(face);
   }
  }
 }
 return {cellSize,cells,sample(x,z,referenceHeight=null){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  const faces=cells.get(`${Math.floor(x/cellSize)}:${Math.floor(z/cellSize)}`)||[];
  const hits=[];
  for(const face of faces){
   if(face.metadata?.parking||face.metadata?.layer==='parking_surfaces')continue;
   const dx=x-face.ax,dz=z-face.az,b=(dx*face.vz-dz*face.vx)*face.inverse,c=(face.ux*dz-face.uz*dx)*face.inverse;
   if(b<-1e-8||c<-1e-8||b+c>1+1e-8)continue;
   hits.push({...face.metadata,height:faceHeight(face,x,z),heightSource:'rendered-pavement-triangle'});
  }
  if(!hits.length)return null;
  const anchor=Number.isFinite(referenceHeight)?hits.reduce((best,hit)=>Math.abs(hit.height-referenceHeight)<Math.abs(best.height-referenceHeight)?hit:best).height:Math.max(...hits.map(hit=>hit.height));
  const candidates=hits.filter(hit=>Math.abs(hit.height-anchor)<=.5+1e-8
   &&(!Number.isFinite(referenceHeight)||Math.abs(hit.height-referenceHeight)<=maxHeightDelta+1e-8)
   &&(!Number.isFinite(referenceHeight)||hit.height>=referenceHeight-maxLowering-1e-8));
  if(!candidates.length)return null;
  return candidates.reduce((best,hit)=>!best||hit.height>best.height?hit:best,null);
 }};
}

function triangleSurfaceValid(points,indices,options,referencePoints=null){
 const center=[(points[0][0]+points[1][0]+points[2][0])/3,(points[0][2]+points[1][2]+points[2][2])/3];
 const probes=[center,...points.map((p,i)=>{const q=points[(i+1)%3],x=(p[0]+q[0])/2,z=(p[2]+q[2])/2;return [x+(center[0]-x)*.02,z+(center[1]-z)*.02];})];
 for(const [x,z] of probes){
  const paintY=heightAtTriangle(points,x,z),intended=heightAtTriangle(referencePoints||points,x,z)-options.lift;
  const support=markingSurfaceAt(indices,x,z,intended);
  if(!support)return false;
  const clearance=paintY-support.height;
  if(clearance<options.minClearance||clearance>options.maxClearance)return false;
 }
 return true;
}

function getSourceIds(ranges,startVertex){
 const ids=[];
 for(const range of ranges||[])if(startVertex>=range.startVertex&&startVertex+3<=range.startVertex+range.vertexCount&&!ids.includes(range.sourceId))ids.push(range.sourceId);
 return ids;
}
function appendRange(ranges,sourceId,startVertex){
 let last=null;for(let i=ranges.length-1;i>=0;i--)if(ranges[i].sourceId===sourceId){last=ranges[i];break;}
 if(last&&last.startVertex+last.vertexCount===startVertex)last.vertexCount+=3;
 else ranges.push({sourceId,startVertex,vertexCount:3});
}
function normalFor(points){
 const a=points[0],b=points[1],c=points[2],ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
 let x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,n=Math.hypot(x,y,z)||1;
 x/=n;y/=n;z/=n;return [x,y,z,x,y,z,x,y,z];
}

/** Finish packed paint against the final visible pavement contact geometry. */
export function finishPaintGroup(group,indices,options={}){
 const config={...DEFAULTS,...options};
 if(group?.kind!=='paint')return {group,stats:{inputTriangles:0,outputTriangles:0,repairedTriangles:0,droppedTriangles:0,rejectedFragments:0,inputArea:0,outputArea:0,suppressedArea:0,remainingFailures:0}};
 if(!(group.positions instanceof Float32Array)||group.positions.length%9)throw new TypeError('Invalid paint group positions');
 const source=group.positions,ranges=group.sourceRanges||[],inputTriangles=source.length/9;
 const visibleIndex=createVisibleMarkingIndex(indices,{maxLowering:config.maxLowering,maxHeightDelta:config.maxHeightDelta});
 const output=[],outputNormals=[],outputRanges=[];
 let inputArea=0,outputArea=0,repairedTriangles=0,droppedTriangles=0,rejectedFragments=0;
 const emit=(points,ids,repaired,originalStart,referencePoints=null)=>{
  if(triArea(points)<1e-10)return false;
  if(!triangleSurfaceValid(points,[visibleIndex],config,referencePoints)){rejectedFragments++;return false;}
  const startVertex=output.length/3;
  for(const p of points)output.push(p[0],p[1],p[2]);
  if(group.normals){
   if(!repaired){const floatStart=originalStart*3;for(let i=0;i<9;i++)outputNormals.push(group.normals[floatStart+i]);}
   else outputNormals.push(...normalFor(points));
  }
  for(const id of ids)appendRange(outputRanges,id,startVertex);
  outputArea+=triArea(points);return true;
 };
 for(let t=0;t<inputTriangles;t++){
  const start=t*9,points=[[source[start],source[start+1],source[start+2]],[source[start+3],source[start+4],source[start+5]],[source[start+6],source[start+7],source[start+8]]],ids=getSourceIds(ranges,t*3);
  inputArea+=triArea(points);
  if(triangleSurfaceValid(points,[visibleIndex],config)){emit(points,ids,false,t*3);continue;}
  const intended=points.map(p=>({x:p[0],y:p[1]-config.lift,z:p[2],referenceHeight:p[1]-config.lift}));
  const projected=projectMarkingTriangles([intended],[visibleIndex],{lift:config.lift,maxHeightDelta:config.maxHeightDelta});
  let count=0;
  for(let i=0;i+8<projected.length;i+=9){const out=[[projected[i],projected[i+1],projected[i+2]],[projected[i+3],projected[i+4],projected[i+5]],[projected[i+6],projected[i+7],projected[i+8]]];if(emit(out,ids,true,t*3,points))count++;}
  if(count===0)droppedTriangles++;
  else repairedTriangles++;
 }
 const positions=new Float32Array(output);
 const result={...group,positions,sourceRanges:outputRanges,...(group.normals?{normals:new Float32Array(outputNormals)}:{})};
 return {group:result,stats:{inputTriangles,outputTriangles:positions.length/9,repairedTriangles,droppedTriangles,rejectedFragments,inputArea,outputArea,suppressedArea:Math.max(0,inputArea-outputArea),remainingFailures:0}};
}
