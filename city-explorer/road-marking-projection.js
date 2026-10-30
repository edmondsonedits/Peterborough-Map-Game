const EPSILON=1e-7;
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const height=(face,x,z)=>{const dx=x-face.ax,dz=z-face.az;return face.ay+(dx*face.vz-dz*face.vx)*face.inverse*face.dyB+(face.ux*dz-face.uz*dx)*face.inverse*face.dyC;};
const reference=(p,fallback)=>Number.isFinite(p.referenceHeight)?p.referenceHeight:Number.isFinite(p.y)?p.y:fallback;
function halfPlane(subject,a,b,sign){
 const out=[];
 for(let i=0;i<subject.length;i++){
  const from=subject[i],to=subject[(i+1)%subject.length],d0=cross(a,b,from)*sign,d1=cross(a,b,to)*sign;
  const inside0=d0>=-1e-10,inside1=d1>=-1e-10;
  if(inside0)out.push(from);
  if(inside0!==inside1){const t=d0/(d0-d1);out.push({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,referenceHeight:Number.isFinite(from.referenceHeight)&&Number.isFinite(to.referenceHeight)?from.referenceHeight+(to.referenceHeight-from.referenceHeight)*t:null});}
 }
 return out;
}
function clip(subject,triangle){
 let points=subject;const sign=Math.sign(cross(...triangle));
 for(let edge=0;edge<3&&points.length;edge++)points=halfPlane(points,triangle[edge],triangle[(edge+1)%3],sign);
 return points;
}
function subtractFace(subject,triangle){
 let inside=subject;const outside=[],sign=Math.sign(cross(...triangle));
 for(let edge=0;edge<3&&inside.length;edge++){
  const a=triangle[edge],b=triangle[(edge+1)%3],piece=halfPlane(inside,a,b,-sign);
  if(piece.length>=3)outside.push(piece);
  inside=halfPlane(inside,a,b,sign);
 }
 return outside;
}
function candidates(indices,bounds){
 const found=new Set();
 for(const index of indices){
  if(!index?.cells||!Number.isFinite(index.cellSize))continue;
  for(let x=Math.floor(bounds.minX/index.cellSize);x<=Math.floor(bounds.maxX/index.cellSize);x++)for(let z=Math.floor(bounds.minZ/index.cellSize);z<=Math.floor(bounds.maxZ/index.cellSize);z++)
   for(const face of index.cells.get(`${x}:${z}`)||[]){
    if(face.metadata?.parking||face.metadata?.layer==='parking_surfaces')continue;
    if(Math.max(face.ax,face.ax+face.ux,face.ax+face.vx)<bounds.minX-EPSILON||Math.min(face.ax,face.ax+face.ux,face.ax+face.vx)>bounds.maxX+EPSILON||Math.max(face.az,face.az+face.uz,face.az+face.vz)<bounds.minZ-EPSILON||Math.min(face.az,face.az+face.uz,face.az+face.vz)>bounds.maxZ+EPSILON)continue;
    found.add(face);
   }
 }
 return found;
}
/** Exact road-only contact choice: municipal pavement wins at the same grade;
 * a height hint retains a separate lower deck at stacked crossings. */
export function markingSurfaceAt(indices,x,z,referenceHeight=null){
 let best=null;
 for(const index of indices){
  const hit=index?.sample?.(x,z,referenceHeight,{includeParking:false});
  if(!hit)continue;
  if(!best){best=hit;continue;}
  if(Number.isFinite(referenceHeight)&&Math.abs(hit.height-referenceHeight)+.5<Math.abs(best.height-referenceHeight))best=hit;
 }
 return best;
}
/** Clip paint against the exact Float32 road faces and reuse their planes.
 * No sampled-height chord can cross a crest; pavement holes remain empty. */
export function projectMarkingTriangles(triangles,indices,{lift=.012,referenceHeight=null,maxHeightDelta=2}={}){
 if(!Array.isArray(indices)||!Number.isFinite(lift)||lift<0)throw new TypeError('Invalid marking projection');
 const positions=[],seen=new Set();
 for(const source of triangles){
  if(source.length!==3||source.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))continue;
  const triangle=source.map(p=>({...p,referenceHeight:reference(p,referenceHeight)}));
  if(Math.abs(cross(...triangle))<1e-10)continue;
  const bounds={minX:Math.min(...triangle.map(p=>p.x)),maxX:Math.max(...triangle.map(p=>p.x)),minZ:Math.min(...triangle.map(p=>p.z)),maxZ:Math.max(...triangle.map(p=>p.z))};
  let remaining=[triangle];
  for(const face of candidates(indices,bounds)){
   if(!remaining.length)break;
   const next=[];
   for(const piece of remaining){
   const footprint=[{x:face.ax,z:face.az},{x:face.ax+face.ux,z:face.az+face.uz},{x:face.ax+face.vx,z:face.az+face.vz}];
   const polygon=clip(piece,footprint);
   if(polygon.length<3){next.push(piece);continue;}
   const center=polygon.reduce((p,v)=>({x:p.x+v.x/polygon.length,z:p.z+v.z/polygon.length,referenceHeight:p.referenceHeight+(Number.isFinite(v.referenceHeight)?v.referenceHeight/polygon.length:0)}),{x:0,z:0,referenceHeight:0});
   const hasReference=polygon.every(p=>Number.isFinite(p.referenceHeight));
   const support=markingSurfaceAt(indices,center.x,center.z,hasReference?center.referenceHeight:null);
   if(!support||(hasReference&&Math.abs(height(face,center.x,center.z)-center.referenceHeight)>maxHeightDelta)||Math.abs(support.height-height(face,center.x,center.z))>.001){next.push(piece);continue;}
   next.push(...subtractFace(piece,footprint));
   for(let i=1;i<polygon.length-1;i++){
    let output=[polygon[0],polygon[i],polygon[i+1]];
    const signed=cross(...output);if(Math.abs(signed)<1e-10)continue;
    if(signed>0)output=[output[0],output[2],output[1]];
    const vertices=output.map(p=>[Math.fround(p.x),Math.fround(height(face,p.x,p.z)+lift),Math.fround(p.z)]);
    const key=vertices.map(v=>v.map(n=>Math.round(n*1e5)).join(',')).sort().join('|');
    if(seen.has(key))continue;seen.add(key);
    for(const vertex of vertices)positions.push(...vertex);
   }
   }
   remaining=next;
  }
 }
 return positions;
}
