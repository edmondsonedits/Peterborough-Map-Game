// Footprint-preserving roof planes for Sherbrooke footage houses. The caller
// owns wall/roof materials and mesh assembly; this module appends triangles only.
const MAX_ROOF_RISE = 4;

function clipByPlane(poly, value) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], av = value(a), bv = value(b), ai = av <= 1e-9, bi = bv <= 1e-9;
    if (ai) out.push(new a.constructor(a.x, a.y));
    if (ai !== bi) { const t = av / (av - bv); out.push(new a.constructor(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)); }
  }
  return out;
}

function triangulate(THREE, polygon) {
  const contour = polygon.map(p => new THREE.Vector2(p.x, p.y));
  return THREE.ShapeUtils.triangulateShape(contour, []).map(face => face.map(i => contour[i]));
}

function appendTriangle(target, a, b, c) { target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }

function asWorld(p, y, THREE) { return new THREE.Vector3(p.x, y, p.y); }

/**
 * Append pitched roof and boundary-closure triangles. `outer` is the existing
 * world-space footprint in Three.js x/y (world x/z). Roof planes are clipped
 * against each triangulated footprint face, so concave outlines never expand.
 * Returns false for unsupported/degenerate profiles so the caller can retain
 * its conservative roof fallback.
 */
export function appendFootageRoof({ THREE, roofPositions, wallPositions, outer, wallTop, roofTop, profile, project }) {
  if (!THREE?.ShapeUtils?.triangulateShape || !Array.isArray(roofPositions) || !Array.isArray(wallPositions) || !Array.isArray(outer) || outer.length < 3 || !Number.isFinite(wallTop) || !Number.isFinite(roofTop) || typeof project !== "function") return false;
  const shape = String(profile?.roof || profile?.roofShape || "").toLowerCase();
  if (!/^(gable|hip|pyramid|mansard)$/.test(shape) || roofTop <= wallTop || outer.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  if (!Array.isArray(profile.frontLatLon) || profile.frontLatLon.length !== 2) return false;
  const projected = profile.frontLatLon.map(p => project(p.lat, p.lon));
  const start = { x: projected[0].x, z: projected[0].y ?? projected[0].z }, end = { x: projected[1].x, z: projected[1].y ?? projected[1].z };
  const dx = end.x - start.x, dz = end.z - start.z, frontLength = Math.hypot(dx, dz);
  if (!(frontLength > 1) || ![start.x, start.z, end.x, end.z].every(Number.isFinite)) return false;

  const ux = dx / frontLength, uz = dz / frontLength, vx = -uz, vz = ux;
  const local = p => ({ u: (p.x - start.x) * ux + (p.y - start.z) * uz, v: (p.x - start.x) * vx + (p.y - start.z) * vz });
  const coords = outer.map(local), us = coords.map(p => p.u), vs = coords.map(p => p.v);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), ridgeU = (u0 + u1) / 2;
  if (!(u1 - u0 > .1) || !(v1 - v0 > .1)) return false;
  const rise = Math.min(MAX_ROOF_RISE, roofTop - wallTop);
  if (!(rise > .05)) return false;

  // A plane's coefficients describe its normalized rise: a*u + b*v + c.
  // Gable slope varies across the frontage axis, leaving its ridge perpendicular
  // to the frontage. Hip roofs use the lower envelope of four edge-slope planes.
  const runU = shape === 'mansard' ? Math.min((u1-u0)/3, Math.max(.6, Number(profile.roofInsetMetres) || 1.25)) : (u1-u0)/2;
  const runV = shape === 'mansard' ? Math.min((v1-v0)/3, Math.max(.6, Number(profile.roofInsetMetres) || 1.25)) : (v1-v0)/2;
  const planes = shape === "gable"
    ? [
      { a: 1 / (ridgeU - u0), b: 0, c: -u0 / (ridgeU - u0) },
      { a: -1 / (u1 - ridgeU), b: 0, c: u1 / (u1 - ridgeU) },
    ]
    : [
      { a: 1 / runU, b: 0, c: -u0 / runU },
      { a: -1 / runU, b: 0, c: u1 / runU },
      { a: 0, b: 1 / runV, c: -v0 / runV },
      { a: 0, b: -1 / runV, c: v1 / runV },
    ];
  if (shape === 'mansard') planes.push({a:0,b:0,c:1});
  const normalizedPlane = (plane, point) => { const q = local(point); return plane.a * q.u + plane.b * q.v + plane.c; };
  const roofY = point => wallTop + rise * Math.max(0, Math.min(1, ...planes.map(plane => normalizedPlane(plane, point))));

  const faces = triangulate(THREE, outer);
  if (!faces.length) return false;
  for (const face of faces) {
    for (let winner = 0; winner < planes.length; winner++) {
      let region = face;
      for (let other = 0; other < planes.length && region.length >= 3; other++) {
        if (other === winner) continue;
        region = clipByPlane(region, point => normalizedPlane(planes[winner], point) - normalizedPlane(planes[other], point));
      }
      if (region.length < 3) continue;
      for (const triangle of triangulate(THREE, region)) appendTriangle(roofPositions, ...triangle.map(point => asWorld(point, roofY(point), THREE)));
    }
  }

  // Close wall-to-roof wedges along the original boundary. Split every edge at
  // plane intersections so gable peaks/hip corners meet the roof without gaps.
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length], cuts = [0, 1];
    for (let p = 0; p < planes.length; p++) for (let q = p + 1; q < planes.length; q++) {
      const difference = point => normalizedPlane(planes[p], point) - normalizedPlane(planes[q], point), da = difference(a), db = difference(b);
      if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) cuts.push(da / (da - db));
    }
    cuts.sort((x, y) => x - y);
    const unique = cuts.filter((t, j) => !j || Math.abs(t - cuts[j - 1]) > 1e-8);
    for (let k = 0; k < unique.length - 1; k++) {
      const at = t => new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      const p0 = at(unique[k]), p1 = at(unique[k + 1]), y0 = roofY(p0), y1 = roofY(p1);
      if (y0 <= wallTop + 1e-6 && y1 <= wallTop + 1e-6) continue;
      const a0 = asWorld(p0, wallTop, THREE), b0 = asWorld(p1, wallTop, THREE), a1 = asWorld(p0, y0, THREE), b1 = asWorld(p1, y1, THREE);
      appendTriangle(wallPositions, a0, b0, b1); appendTriangle(wallPositions, a0, b1, a1);
    }
  }
  return true;
}

export const FOOTAGE_ROOF_MAX_RISE = MAX_ROOF_RISE;
