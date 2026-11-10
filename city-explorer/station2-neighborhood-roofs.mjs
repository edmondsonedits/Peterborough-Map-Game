const asPoint = value => {
  if (Array.isArray(value)) return { x: Number(value[0]), z: Number(value[2] ?? value[1]) };
  return { x: Number(value?.x), z: Number(value?.z ?? value?.y) };
};
const dot = (p, axis) => p.x * axis.x + p.z * axis.z;
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

function clipHalfPlane(polygon, axis, boundary, keepBelow) {
  const out = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i], next = polygon[(i + 1) % polygon.length];
    const a = dot(current, axis) - boundary, b = dot(next, axis) - boundary;
    const insideA = keepBelow ? a <= 1e-8 : a >= -1e-8;
    const insideB = keepBelow ? b <= 1e-8 : b >= -1e-8;
    if (insideA) out.push(current);
    if (insideA !== insideB) out.push(mix(current, next, a / (a - b)));
  }
  return out.filter((p, i) => !i || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z) > 1e-8);
}

function clipPlaneComparison(polygon, first, second) {
  const out=[];
  for(let i=0;i<polygon.length;i++) {
    const current=polygon[i],next=polygon[(i+1)%polygon.length];
    const a=first(current)-second(current),b=first(next)-second(next),insideA=a<=1e-8,insideB=b<=1e-8;
    if(insideA)out.push(current);
    if(insideA!==insideB)out.push(mix(current,next,a/(a-b)));
  }
  return out.filter((p,i)=>!i||Math.hypot(p.x-out[i-1].x,p.z-out[i-1].z)>1e-8);
}

function polygonArea(ring) {
  let area=0;
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a.x*b.z-b.x*a.z;}
  return Math.abs(area)/2;
}

function toTriangles(source, ring) {
  if (!Array.isArray(source)) return [];
  return source.map(triangle => triangle.map(vertex => {
    if (Number.isInteger(vertex)) return ring[vertex];
    return asPoint(vertex);
  })).filter(triangle => triangle.length === 3 && triangle.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.z)));
}

function appendUpTriangle(target, a, b, c) {
  const ab = [b.x - a.x, b.y - a.y, b.z - a.z];
  const ac = [c.x - a.x, c.y - a.y, c.z - a.z];
  const normalY = ab[2] * ac[0] - ab[0] * ac[2];
  const points = normalY >= 0 ? [a, b, c] : [a, c, b];
  points.forEach(p => target.push(p.x, p.y, p.z));
}

/**
 * Build a bounded ridge roof from a triangulated, simple footprint.
 * Coordinates use Three.js world convention: X/Z footprint, Y height.
 * The caller supplies THREE.ShapeUtils.triangulateShape output or an equivalent
 * callback; roof top is fixed to roofTop, preserving mapped vertical bounds.
 */
export function buildStation2NeighborhoodGableRoof({
  ring: sourceRing, boundaryRings, wallTop, roofTop, triangles, triangulate, roofShape = 'gabled',
  maxRoofTriangles = 2048, maxGableTriangles = 128,
} = {}) {
  const ring = Array.isArray(sourceRing) ? sourceRing.map(asPoint) : [];
  if (ring.length > 3 && Math.hypot(ring[0].x - ring.at(-1).x, ring[0].z - ring.at(-1).z) < 1e-7) ring.pop();
  if (ring.length < 4 || ring.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return { valid:false, reason:'invalid-ring', roofTriangles:[], gableTriangles:[] };
  const height = Number(roofTop) - Number(wallTop);
  if (!Number.isFinite(wallTop) || !Number.isFinite(roofTop) || height < 0.25) return { valid:false, reason:'invalid-roof-height', roofTriangles:[], gableTriangles:[] };

  let ridgeEdge = null;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i], b = ring[(i + 1) % ring.length], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!ridgeEdge || length > ridgeEdge.length) ridgeEdge = { a, b, length };
  }
  if (!ridgeEdge || ridgeEdge.length < 2.2) return { valid:false, reason:'degenerate-footprint', roofTriangles:[], gableTriangles:[] };
  const axis = { x:(ridgeEdge.b.x-ridgeEdge.a.x)/ridgeEdge.length, z:(ridgeEdge.b.z-ridgeEdge.a.z)/ridgeEdge.length };
  const sideAxis = { x:-axis.z, z:axis.x };
  const ridgeCoordinates=ring.map(p=>dot(p,axis)),sideCoordinates=ring.map(p=>dot(p,sideAxis));
  const minU=Math.min(...ridgeCoordinates),maxU=Math.max(...ridgeCoordinates),minV=Math.min(...sideCoordinates),maxV=Math.max(...sideCoordinates);
  const spanV=maxV-minV,spanU=maxU-minU,midV=(minV+maxV)/2;
  if (spanV < 1.4 || spanU < 1.8 || !Number.isFinite(spanV)) return { valid:false, reason:'degenerate-footprint', roofTriangles:[], gableTriangles:[] };
  const sourceTriangles=triangles ?? (typeof triangulate==='function'?triangulate(ring):null);
  const baseTriangles=toTriangles(sourceTriangles,ring);
  if (!baseTriangles.length) return { valid:false, reason:'missing-triangulation', roofTriangles:[], gableTriangles:[] };
  const roofTriangles=[];
  const shape=String(roofShape||'gabled').toLowerCase();
  const rings=(Array.isArray(boundaryRings)?boundaryRings:[sourceRing]).map(points=>Array.isArray(points)?points.map(asPoint):[]).filter(points=>points.length>=3);
  if(/hip|pyramid/.test(shape)) {
    const run=Math.max(1e-5,Math.min(spanU,spanV)/2);
    const planes=[
      p=>(dot(p,axis)-minU)/run,
      p=>(maxU-dot(p,axis))/run,
      p=>(dot(p,sideAxis)-minV)/run,
      p=>(maxV-dot(p,sideAxis))/run,
      ()=>1,
    ];
    for(const triangle of baseTriangles)for(let winner=0;winner<planes.length;winner++) {
      let piece=triangle;
      for(let other=0;other<planes.length&&piece.length>=3;other++)if(other!==winner)piece=clipPlaneComparison(piece,planes[winner],planes[other]);
      if(piece.length<3||polygonArea(piece)<1e-8)continue;
      for(let index=1;index+1<piece.length;index++) {
        if(roofTriangles.length/9>=maxRoofTriangles)return {valid:false,reason:'triangle-budget',roofTriangles:[],gableTriangles:[]};
        const points=[piece[0],piece[index],piece[index+1]].map(p=>({x:p.x,y:Number(wallTop)+height*Math.max(0,Math.min(1,planes[winner](p))),z:p.z}));
        appendUpTriangle(roofTriangles,points[0],points[1],points[2]);
      }
    }
    const gableTriangles=[];
    const heightAt=p=>Number(wallTop)+height*Math.max(0,Math.min(1,...planes.map(plane=>plane(p))));
    for(const boundary of rings)for(let edge=0;edge<boundary.length;edge++) {
      const a=boundary[edge],b=boundary[(edge+1)%boundary.length],cuts=[0,1];
      const values=planes.map(plane=>[plane(a),plane(b)]);
      const addCrossing=(a0,a1)=>{if((a0<0&&a1>0)||(a0>0&&a1<0)){const t=a0/(a0-a1);if(t>1e-8&&t<1-1e-8)cuts.push(t);}};
      for(let i=0;i<values.length;i++) {
        addCrossing(values[i][0]-1,values[i][1]-1);
        for(let j=i+1;j<values.length;j++)addCrossing(values[i][0]-values[j][0],values[i][1]-values[j][1]);
      }
      cuts.sort((x,y)=>x-y);
      const split=cuts.filter((t,index)=>!index||t-cuts[index-1]>1e-7).map(t=>mix(a,b,t));
      for(let i=0;i+1<split.length;i++) {
        const p=split[i],q=split[i+1],pY=heightAt(p),qY=heightAt(q);
        if(Math.max(pY,qY)-wallTop<1e-8)continue;
        if(gableTriangles.length/9+2>maxGableTriangles)return {valid:false,reason:'gable-budget',roofTriangles:[],gableTriangles:[]};
        const bottomP={x:p.x,y:Number(wallTop),z:p.z},bottomQ={x:q.x,y:Number(wallTop),z:q.z},topP={x:p.x,y:pY,z:p.z},topQ={x:q.x,y:qY,z:q.z};
        for(const point of [bottomP,bottomQ,topQ,bottomP,topQ,topP])gableTriangles.push(point.x,point.y,point.z);
      }
    }
    return {valid:true,reason:null,roofTriangles,gableTriangles,ridgeAxis:axis,spanMetres:{ridge:spanU,perpendicular:spanV},wallTop:Number(wallTop),roofTop:Number(roofTop)};
  }
  if(/hip|pyramid|round|dome/.test(shape)) {
    const distanceToBoundary=p=>{
      let nearest=Infinity;
      for(const boundary of rings)for(let i=0;i<boundary.length;i++){
        const a=boundary[i],b=boundary[(i+1)%boundary.length],dx=b.x-a.x,dz=b.z-a.z,denom=dx*dx+dz*dz;
        const t=denom?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/denom)):0;
        nearest=Math.min(nearest,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t));
      }
      return nearest;
    };
    const interiorReach=Math.max(1e-5,...baseTriangles.map(triangle=>distanceToBoundary({x:(triangle[0].x+triangle[1].x+triangle[2].x)/3,z:(triangle[0].z+triangle[1].z+triangle[2].z)/3})));
    const roofHeightAt=p=>{
      const inset=Math.max(0,Math.min(1,distanceToBoundary(p)/interiorReach));
      const shaped=Math.sqrt(inset);
      return Number(wallTop)+height*shaped;
    };
    for(const triangle of baseTriangles){
      const [a,b,c]=triangle,ab=mix(a,b,.5),bc=mix(b,c,.5),ca=mix(c,a,.5);
      const sub=[[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]];
      for(const tri of sub){
        if(roofTriangles.length/9>=maxRoofTriangles)return {valid:false,reason:'triangle-budget',roofTriangles:[],gableTriangles:[]};
        const xyz=tri.map(p=>({x:p.x,y:roofHeightAt(p),z:p.z}));appendUpTriangle(roofTriangles,xyz[0],xyz[1],xyz[2]);
      }
    }
    return {valid:true,reason:null,roofTriangles,gableTriangles:[],ridgeAxis:axis,spanMetres:{ridge:spanU,perpendicular:spanV},wallTop:Number(wallTop),roofTop:Number(roofTop)};
  }
  const heightAt=p=>Number(wallTop)+height*(1-Math.abs(2*(dot(p,sideAxis)-minV)/spanV-1));
  const appendRoofPolygon=poly=>{
    if(poly.length<3)return true;
    for(let i=1;i+1<poly.length;i++){
      if(roofTriangles.length/9>=maxRoofTriangles)return false;
      const xyz=poly.map(p=>({x:p.x,y:heightAt(p),z:p.z}));appendUpTriangle(roofTriangles,xyz[0],xyz[i],xyz[i+1]);
    }
    return true;
  };
  for(const triangle of baseTriangles){
    const low=clipHalfPlane(triangle,sideAxis,midV,true),high=clipHalfPlane(triangle,sideAxis,midV,false);
    if(!appendRoofPolygon(low)||!appendRoofPolygon(high))return {valid:false,reason:'triangle-budget',roofTriangles:[],gableTriangles:[]};
  }

  const gableTriangles=[];
  for(const boundary of rings)for(let edge=0;edge<boundary.length;edge++) {
    const a=boundary[edge],b=boundary[(edge+1)%boundary.length],va=dot(a,sideAxis),vb=dot(b,sideAxis);
    const split=[a]; if((va-midV)*(vb-midV)<-1e-10)split.push(mix(a,b,(midV-va)/(vb-va))); split.push(b);
    for(let i=0;i+1<split.length;i++) {
      const p=split[i],q=split[i+1];
      const verts=[{...p,y:wallTop},{...q,y:wallTop},{...q,y:heightAt(q)},{...p,y:heightAt(p)}];
      for(const indices of [[0,1,2],[0,2,3]]) {
        const [u,v,w]=indices.map(k=>verts[k]);
        if(Math.max(u.y,v.y,w.y)-wallTop<1e-8)continue;
        if(gableTriangles.length/9>=maxGableTriangles)return {valid:false,reason:'gable-budget',roofTriangles:[],gableTriangles:[]};
        for(const vert of [u,v,w])gableTriangles.push(vert.x,vert.y,vert.z);
      }
    }
  }
  return {valid:true,reason:null,roofTriangles,gableTriangles,ridgeAxis:axis,spanMetres:{ridge:spanU,perpendicular:spanV},wallTop:Number(wallTop),roofTop:Number(roofTop)};
}

/** Repartition only an untagged visual envelope; source dimensions stay owned by the caller. */
export function resolveRecordedRoofHeights({foundationTop,wallTop,roofTop,eaveHeightMetres,tags={}}={}) {
  const unchanged={wallTop,roofTop,applied:false};
  if(![foundationTop,wallTop,roofTop,eaveHeightMetres].every(Number.isFinite))return unchanged;
  if(['height','roof:height','roof:shape','building:roof:shape','building:levels'].some(key=>tags[key]!=null&&tags[key]!==''))return unchanged;
  const candidate=foundationTop+eaveHeightMetres;
  if(eaveHeightMetres<2.6||candidate>=roofTop-.25||candidate>=wallTop)return unchanged;
  return {wallTop:candidate,roofTop,applied:true};
}

const roofPlaneY=(plane,p)=>plane.a*p.x+plane.b*p.z+plane.c;
function roofPlane(points) {
  const [a,b,c]=points,dx=b.x-a.x,dz=b.z-a.z,ex=c.x-a.x,ez=c.z-a.z,det=dx*ez-ex*dz;
  if(Math.abs(det)<1e-10)return null;
  const u=((b.y-a.y)*ez-(c.y-a.y)*dz)/det,v=(dx*(c.y-a.y)-ex*(b.y-a.y))/det;
  return {a:u,b:v,c:a.y-u*a.x-v*a.z};
}
function containsRoofPoint(p,polygon) {
  let sign=0;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
    if(Math.abs(cross)<1e-7)continue;
    if(sign&&Math.sign(cross)!==sign)return false;
    sign=Math.sign(cross);
  }
  return true;
}
const patchHeight=(patches,p)=>{
  let height=-Infinity;
  for(const patch of patches)if(containsRoofPoint(p,patch.polygon))height=Math.max(height,roofPlaneY(patch.plane,p));
  return height;
};
function clippedRoofPiece(polygon,value,inside=true) {
  const piece=clipPlaneComparison(polygon,inside?value:p=>-value(p),()=>0);
  return piece.length>=3&&polygonArea(piece)>1e-9?piece:[];
}
// Overlay only the portion of a convex plane domain above the current roof.
// The rejected pieces retain their prior plane, so no hidden duplicate roof or
// open slot is introduced in the visible surface.
function overlayRoofPlane(patches,plane,boundaries,maxPatches) {
  const result=[];
  for(const patch of patches){
    let remaining=patch.polygon;
    for(const boundary of [...boundaries,p=>roofPlaneY(patch.plane,p)-roofPlaneY(plane,p)]){
      if(!remaining.length)break;
      const rejected=clippedRoofPiece(remaining,boundary,false);
      if(rejected.length)result.push({polygon:rejected,plane:patch.plane});
      remaining=clippedRoofPiece(remaining,boundary);
    }
    if(remaining.length)result.push({polygon:remaining,plane});
    if(result.length>maxPatches)return null;
  }
  return result;
}
function roofEdgeCuts(a,b,patches) {
  const cuts=[0,1],dx=b.x-a.x,dz=b.z-a.z;
  for(const patch of patches)for(let i=0;i<patch.polygon.length;i++){
    const p=patch.polygon[i],q=patch.polygon[(i+1)%patch.polygon.length],ex=q.x-p.x,ez=q.z-p.z,denom=dx*ez-dz*ex;
    if(Math.abs(denom)<1e-10)continue;
    const t=((p.x-a.x)*ez-(p.z-a.z)*ex)/denom,s=((p.x-a.x)*dz-(p.z-a.z)*dx)/denom;
    if(t>1e-8&&t<1-1e-8&&s>=-1e-8&&s<=1+1e-8)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  return cuts.filter((value,index)=>!index||value-cuts[index-1]>1e-7);
}
function appendRoofWallTriangle(target,a,b,c,outward) {
  const ab=[b.x-a.x,b.y-a.y,b.z-a.z],ac=[c.x-a.x,c.y-a.y,c.z-a.z];
  const nx=ab[1]*ac[2]-ab[2]*ac[1],ny=ab[2]*ac[0]-ab[0]*ac[2],nz=ab[0]*ac[1]-ab[1]*ac[0];
  if(Math.hypot(nx,ny,nz)<1e-8)return;
  if(outward&&nx*outward.x+nz*outward.z<0)[b,c]=[c,b];
  for(const p of [a,b,c])target.push(p.x,p.y,p.z);
}

/**
 * Opt-in recorded roof details for a single source outline without courtyards.
 * `frontage` contains two projected X/Z (or Three Vector2 X/Y) endpoints.
 * `spec.shape` is gabled/hipped; `dormers` and `frontGables` are estimated,
 * non-overlapping frontage projections, at most four in total. Returned roof
 * triangles replace the main roof; wall/glass arrays join existing batches.
 * Invalid detail requests return no partial geometry, allowing the old roof.
 */
export function buildRecordedFrontRoof({ring:sourceRing,frontage,triangles,wallTop,roofTop,spec,maxRoofTriangles=1024,maxDetailTriangles=256}={}) {
  const fail=reason=>({valid:false,reason,roofTriangles:[],wallTriangles:[],glassTriangles:[],projections:[]});
  if(!spec||!['gabled','hipped'].includes(spec.shape))return fail('unsupported-recorded-roof');
  if((spec.dormers!=null&&!Array.isArray(spec.dormers))||(spec.frontGables!=null&&!Array.isArray(spec.frontGables)))return fail('invalid-projection-list');
  const requested=[...(spec.dormers||[]).map(value=>({...value,kind:'dormer'})),...(spec.frontGables||[]).map(value=>({...value,kind:'front-gable'}))];
  if(!requested.length||requested.length>4)return fail('projection-count');
  if(!Array.isArray(frontage)||frontage.length!==2||!Array.isArray(sourceRing))return fail('invalid-frontage');
  const ring=sourceRing.map(asPoint),[start,end]=frontage.map(asPoint),length=Math.hypot(end.x-start.x,end.z-start.z);
  if(!(length>3)||ring.some(p=>!Number.isFinite(p.x+p.z)))return fail('invalid-frontage');
  const tangent={x:(end.x-start.x)/length,z:(end.z-start.z)/length},inward={x:-tangent.z,z:tangent.x};
  const centroid=ring.reduce((sum,p)=>({x:sum.x+p.x/ring.length,z:sum.z+p.z/ring.length}),{x:0,z:0});
  if((centroid.x-start.x)*inward.x+(centroid.z-start.z)*inward.z<0){inward.x*=-1;inward.z*=-1;}
  const local=p=>({x:(p.x-start.x)*tangent.x+(p.z-start.z)*tangent.z,z:(p.x-start.x)*inward.x+(p.z-start.z)*inward.z});
  const world=(p,y)=>({x:start.x+tangent.x*p.x+inward.x*p.z,y,z:start.z+tangent.z*p.x+inward.z*p.z});
  const base=buildStation2NeighborhoodGableRoof({ring:sourceRing,wallTop,roofTop,triangles,roofShape:spec.shape,maxRoofTriangles,maxGableTriangles:maxDetailTriangles});
  if(!base.valid)return fail(base.reason);
  // Keep the existing ridge. Its true line, not a frontage-axis bounding box,
  // supplies the rear intersection even for slightly skewed mapped rectangles.
  const side={x:-base.ridgeAxis.z,z:base.ridgeAxis.x},sideValues=ring.map(p=>dot(p,side)),ridgeSide=(Math.min(...sideValues)+Math.max(...sideValues))/2,denom=dot(inward,side);
  if(Math.abs(denom)<.9)return fail('frontage-not-roof-slope');
  const ridgeDepth=u=>(ridgeSide-dot(start,side)-u*dot(tangent,side))/denom;
  const basePatches=[];
  for(let i=0;i<base.roofTriangles.length;i+=9){
    const points=[0,3,6].map(j=>({...local({x:base.roofTriangles[i+j],z:base.roofTriangles[i+j+2]}),y:base.roofTriangles[i+j+1]})),plane=roofPlane(points);
    if(plane)basePatches.push({polygon:points.map(({x,z})=>({x,z})),plane});
  }
  let patches=basePatches;
  const projections=[];
  for(const request of requested){
    const fraction=request.fraction,width=request.widthMetres,center=fraction*length,half=width/2,frontDepth=request.frontInsetMetres??(request.kind==='dormer'?.85:.04),left=center-half,right=center+half;
    if(![fraction,width,frontDepth].every(Number.isFinite)||width<.5||width>length*.4||fraction<=0||fraction>=1||left<.04||right>length-.04||frontDepth<.025||ridgeDepth(left)<=frontDepth+.2||ridgeDepth(right)<=frontDepth+.2)return fail('invalid-projection');
    if(projections.some(p=>left<p.right-1e-7&&right>p.left+1e-7))return fail('overlapping-projections');
    const baseY=patchHeight(basePatches,{x:center,z:frontDepth});
    if(!Number.isFinite(baseY))return fail('projection-outside-roof');
    let shoulderY,peakY;
    if(request.kind==='dormer'){
      if(![request.wallHeightMetres,request.roofRiseMetres].every(Number.isFinite)||request.wallHeightMetres<.3||request.roofRiseMetres<.15)return fail('invalid-dormer-height');
      shoulderY=baseY+request.wallHeightMetres;peakY=shoulderY+request.roofRiseMetres;
    }else{
      const rise=request.riseFraction!=null?(roofTop-wallTop)*request.riseFraction:request.riseMetres;
      if(!Number.isFinite(rise)||rise<.25)return fail('invalid-gable-height');
      shoulderY=wallTop;peakY=wallTop+rise;
    }
    if(peakY>roofTop+1e-7||shoulderY>=peakY)return fail('projection-exceeds-roof-top');
    const rise=peakY-shoulderY,front={x:left,z:frontDepth},back={x:right,z:ridgeDepth(right)};
    const polygon=[front,{x:right,z:frontDepth},back,{x:left,z:ridgeDepth(left)}];
    // Restrict every side of a projection to an existing roof surface. This
    // intentionally rejects courtyards/notches instead of bridging a gap.
    for(let edge=0;edge<4;edge++)for(const t of roofEdgeCuts(polygon[edge],polygon[(edge+1)%4],basePatches)){
      if(!Number.isFinite(patchHeight(basePatches,mix(polygon[edge],polygon[(edge+1)%4],t))))return fail('projection-outside-roof');
    }
    const baseBoundaries=[p=>left-p.x,p=>p.x-right,p=>frontDepth-p.z,p=>p.z-ridgeDepth(p.x)];
    for(const [a,c,boundary] of [[rise/half,peakY-rise*center/half,p=>p.x-center],[-rise/half,peakY+rise*center/half,p=>center-p.x]]){
      patches=overlayRoofPlane(patches,{a,b:0,c},[...baseBoundaries,boundary],maxRoofTriangles);
      if(!patches)return fail('triangle-budget');
    }
    projections.push({...request,left,right,frontDepth,center,half,polygon,baseY,shoulderY,peakY});
  }
  const roofTriangles=[],wallTriangles=[...base.gableTriangles],glassTriangles=[];
  for(const patch of patches)for(let i=1;i+1<patch.polygon.length;i++){
    if(polygonArea([patch.polygon[0],patch.polygon[i],patch.polygon[i+1]])<1e-9)continue;
    appendUpTriangle(roofTriangles,...[patch.polygon[0],patch.polygon[i],patch.polygon[i+1]].map(p=>world(p,roofPlaneY(patch.plane,p))));
    if(roofTriangles.length/9>maxRoofTriangles)return fail('triangle-budget');
  }
  for(const projection of projections){
    const {polygon,frontDepth,center,half,baseY,shoulderY,peakY,kind}=projection;
    for(let edge=0;edge<4;edge++){
      const a=polygon[edge],b=polygon[(edge+1)%4],cuts=roofEdgeCuts(a,b,[...basePatches,...patches]);
      const outward={x:tangent.x*(b.z-a.z)-inward.x*(b.x-a.x),z:tangent.z*(b.z-a.z)-inward.z*(b.x-a.x)};
      for(let i=0;i+1<cuts.length;i++){
        const p=mix(a,b,cuts[i]),q=mix(a,b,cuts[i+1]),mid=mix(p,q,.5),loP=patchHeight(basePatches,p),loQ=patchHeight(basePatches,q),hiP=patchHeight(patches,p),hiQ=patchHeight(patches,q);
        if(![loP,loQ,hiP,hiQ,patchHeight(basePatches,mid)].every(Number.isFinite))return fail('projection-outside-roof');
        if(edge===2&&Math.max(hiP-loP,hiQ-loQ)>1e-6)return fail('unmerged-projection-back');
        if(Math.max(hiP-loP,hiQ-loQ)<1e-7)continue;
        const A=world(p,loP),B=world(q,loQ),C=world(q,hiQ),D=world(p,hiP);
        appendRoofWallTriangle(wallTriangles,A,B,C,outward);appendRoofWallTriangle(wallTriangles,A,C,D,outward);
      }
    }
    const paneAt=(u,y,offset=.018)=>world({x:u,z:frontDepth-offset},y);
    const frontOutward={x:-inward.x,z:-inward.z};
    if(kind==='dormer'){
      const width=projection.glassWidthMetres??projection.widthMetres*.65,height=projection.glassHeightMetres??.72,bottom=baseY+.12;
      if(![width,height].every(Number.isFinite)||width<=.1||width>projection.widthMetres-.12||height<=.1||bottom+height>shoulderY-.06)return fail('invalid-dormer-glazing');
      const A=paneAt(center-width/2,bottom),B=paneAt(center+width/2,bottom),C=paneAt(center+width/2,bottom+height),D=paneAt(center-width/2,bottom+height);
      appendRoofWallTriangle(glassTriangles,A,B,C,frontOutward);appendRoofWallTriangle(glassTriangles,A,C,D,frontOutward);
    }else if(projection.glazed){
      const bottom=baseY+.12,top=peakY-.12,paneHalf=half*(peakY-bottom)/(peakY-shoulderY)-.12;
      if(top<=bottom+.1||paneHalf<=.1)return fail('invalid-gable-glazing');
      appendRoofWallTriangle(glassTriangles,paneAt(center-paneHalf,bottom),paneAt(center+paneHalf,bottom),paneAt(center,top),frontOutward);
      // The central cream mullion remains in the existing reviewed wall batch.
      const A=paneAt(center-.035,bottom,.023),B=paneAt(center+.035,bottom,.023),C=paneAt(center+.035,top-.04,.023),D=paneAt(center-.035,top-.04,.023);
      appendRoofWallTriangle(wallTriangles,A,B,C,frontOutward);appendRoofWallTriangle(wallTriangles,A,C,D,frontOutward);
    }
    if((wallTriangles.length+glassTriangles.length)/9>maxDetailTriangles)return fail('detail-triangle-budget');
  }
  return {valid:true,reason:null,roofTriangles,wallTriangles,glassTriangles,wallTop,roofTop,projections:projections.map(p=>({kind:p.kind,fraction:p.fraction,widthMetres:p.widthMetres,frontInsetMetres:p.frontDepth,baseY:p.baseY,shoulderY:p.shoulderY,peakY:p.peakY,mergedAtBack:true}))};
}
