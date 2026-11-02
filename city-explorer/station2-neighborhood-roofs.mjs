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
