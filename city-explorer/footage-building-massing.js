// Visual height zones clipped to the authoritative footprint. No scene objects,
// collision polygons or editor identities are created here; caller owns batches.
const EPS=1e-7;
const unique=a=>[...new Set(a)].sort((x,y)=>x-y).filter((v,i,s)=>!i||v-s[i-1]>EPS);
function clip(poly,axis,bound,sign){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound),ai=da<=EPS,bi=db<=EPS;if(ai)out.push(a);if(ai!==bi){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})}}return out;
}
function inside(p,rings){let yes=false;for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
const vertex=(a,y)=>[a.x,y,a.y];
function wall(out,a,b,loA,loB,hiA,hiB){out.push(...vertex(a,loA),...vertex(b,loB),...vertex(b,hiB),...vertex(a,loA),...vertex(b,hiB),...vertex(a,hiA))}
/** Zones are [south, west, north, east]; later zones take precedence. */
export function appendFootageMassing({THREE,wallPositions,roofPositions,outer,holes=[],foundationTop,profile,project,groundHeights=[]}){
 const spec=profile?.massing,validHeight=h=>Number.isFinite(h)&&h>=2&&h<=115;
 if(!spec||!validHeight(spec.defaultHeight)||!Array.isArray(spec.zones)||!spec.zones.length||spec.zones.length>8||!Array.isArray(outer)||outer.length<3||!Number.isFinite(foundationTop)||typeof project!=='function'||!THREE?.ShapeUtils?.triangulateShape||!Array.isArray(wallPositions)||!Array.isArray(roofPositions))return false;
 const rings=[outer,...holes],vertices=rings.flat();if(vertices.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false;
 const zones=[];for(const z of spec.zones){
  if(!validHeight(z.height)||!Array.isArray(z.bounds)||z.bounds.length!==4||!z.bounds.every(Number.isFinite))return false;
  const [south,west,north,east]=z.bounds;if(!(south<north&&west<east)||south< -90||north>90||west< -180||east>180)return false;
  const a=project(north,west),b=project(south,east),az=a.y??a.z,bz=b.y??b.z;
  if(![a.x,b.x,az,bz].every(Number.isFinite))return false;
  zones.push({x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(az,bz),z1:Math.max(az,bz),height:z.height});
 }
 const x0=Math.min(...outer.map(p=>p.x)),x1=Math.max(...outer.map(p=>p.x)),z0=Math.min(...outer.map(p=>p.y)),z1=Math.max(...outer.map(p=>p.y));
 const xs=unique([x0,x1,...zones.flatMap(z=>[z.x0,z.x1]).filter(x=>x>x0&&x<x1)]),zs=unique([z0,z1,...zones.flatMap(z=>[z.z0,z.z1]).filter(z=>z>z0&&z<z1)]);
 const heightAt=(x,z)=>{for(let i=zones.length-1;i>=0;i--){const q=zones[i];if(x>=q.x0&&x<=q.x1&&z>=q.z0&&z<=q.z1)return q.height}return spec.defaultHeight};
 const walls=[],roof=[];let maxHeight=0,faces;
 try{faces=THREE.ShapeUtils.triangulateShape(outer.map(p=>p.clone()),holes.map(r=>r.map(p=>p.clone())))}catch{return false}if(!faces.length)return false;
 for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
  const h=heightAt((xs[xi]+xs[xi+1])/2,(zs[zi]+zs[zi+1])/2),y=foundationTop+h+.2;
  for(const face of faces){let polygon=face.map(i=>vertices[i]);for(const [axis,bound,sign]of [['x',xs[xi],-1],['x',xs[xi+1],1],['y',zs[zi],-1],['y',zs[zi+1],1]])polygon=clip(polygon,axis,bound,sign);
   for(let i=1;i<polygon.length-1;i++){const [a,b,c]=[polygon[0],polygon[i],polygon[i+1]],cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(Math.abs(cross)<EPS)continue;maxHeight=Math.max(maxHeight,h);roof.push(...vertex(a,y),...vertex(cross>0?c:b,y),...vertex(cross>0?b:c,y))}
  }
 }
 if(!roof.length)return false;
 let offset=0;
 for(const ring of rings){for(let i=0;i<ring.length;i++){
  const a=ring[i],j=(i+1)%ring.length,b=ring[j],cuts=[0,1];
  for(const [axis,lines]of [['x',xs],['y',zs]])if(Math.abs(b[axis]-a[axis])>EPS)for(const line of lines){const t=(line-a[axis])/(b[axis]-a[axis]);if(t>EPS&&t<1-EPS)cuts.push(t)}
  const ts=unique(cuts),groundA=Number.isFinite(groundHeights[offset+i])?groundHeights[offset+i]:foundationTop,groundB=Number.isFinite(groundHeights[offset+j])?groundHeights[offset+j]:foundationTop;
  for(let k=0;k<ts.length-1;k++){const at=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),p=at(ts[k]),q=at(ts[k+1]),mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2},len=Math.hypot(q.x-p.x,q.y-p.y),delta={x:-(q.y-p.y)/len*1e-5,y:(q.x-p.x)/len*1e-5},plus={x:mid.x+delta.x,y:mid.y+delta.y},minus={x:mid.x-delta.x,y:mid.y-delta.y},sample=inside(plus,rings)?plus:inside(minus,rings)?minus:mid,h=foundationTop+heightAt(sample.x,sample.y)+.2;wall(walls,p,q,groundA+(groundB-groundA)*ts[k],groundA+(groundB-groundA)*ts[k+1],h,h)}
 }offset+=ring.length}
 // Step walls occur only along zone boundaries inside the footprint. Ring
 // intersections split them around courtyards/concavities, never triangle edges.
 for(const [axis,lines,otherCuts]of [['x',xs,zs],['y',zs,xs]])for(const line of lines.slice(1,-1)){
  const other=axis==='x'?'y':'x',cuts=[...otherCuts];
  for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(Math.abs(b[axis]-a[axis])<EPS){if(Math.abs(a[axis]-line)<EPS)cuts.push(a[other],b[other]);continue}const t=(line-a[axis])/(b[axis]-a[axis]);if(t>=0&&t<=1)cuts.push(a[other]+(b[other]-a[other])*t)}
  const sorted=unique(cuts);for(let k=0;k<sorted.length-1;k++){
   const mid=(sorted[k]+sorted[k+1])/2,point={ [axis]:line,[other]:mid },left={...point,[axis]:line-1e-5},right={...point,[axis]:line+1e-5};if(!inside(left,rings)||!inside(right,rings))continue;
   const hl=heightAt(left.x,left.y),hr=heightAt(right.x,right.y);if(Math.abs(hl-hr)<EPS)continue;
   const a={ [axis]:line,[other]:sorted[k] },b={ [axis]:line,[other]:sorted[k+1] };wall(walls,a,b,foundationTop+Math.min(hl,hr)+.2,foundationTop+Math.min(hl,hr)+.2,foundationTop+Math.max(hl,hr)+.2,foundationTop+Math.max(hl,hr)+.2);
  }
 }
 wallPositions.push(...walls);roofPositions.push(...roof);return{maxHeight,defaultHeight:spec.defaultHeight};
}
