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
  ring: sourceRing, wallTop, roofTop, triangles, triangulate,
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
  for(let edge=0;edge<ring.length;edge++) {
    const a=ring[edge],b=ring[(edge+1)%ring.length],va=dot(a,sideAxis),vb=dot(b,sideAxis);
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
