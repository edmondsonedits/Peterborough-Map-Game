/* Spatial index for Peterborough's surveyed pavement polygons.

   The renderer and any future vehicle controller share this exact semantic
   boundary.  Centreline ribbons remain useful for elevation and routing, but
   they are no longer treated as proof that a point lies on public pavement. */

function pointInRing(x, z, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    if (((a.y > z) !== (b.y > z)) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x, z, rings) {
  return Boolean(rings?.[0]?.length) && pointInRing(x, z, rings[0])
    && !rings.slice(1).some((hole) => pointInRing(x, z, hole));
}

export function officialSurfaceStatusActive(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return !/^(rmvd|removed|prop|proposed|closed|inactive|abandoned)$/.test(normalized);
}

/** Municipal bridge footprints describe structures, not necessarily pavement.
 * A culvert outline is not its overlying road; pedestrian/railway structures
 * remain represented by their own mapped paths/rails rather than asphalt.
 */
export function officialBridgeIsVehicular(properties = {}) {
  const use = Object.entries(properties).find(([key]) => key.toUpperCase() === 'BR_USE')?.[1];
  return String(use || '').trim().toLowerCase() === 'vehicular';
}

/** Height queries against the actual Float32 pavement faces sent to WebGL.
 * XY source outlines remain unchanged; this index owns no inferred geography.
 * A height hint retains the current deck at grade-separated crossings.
 */
function clipPaintHalfPlane(polygon, distance) {
  const result=[];
  for (let i=0;i<polygon.length;i++) {
    const a=polygon[i], b=polygon[(i+1)%polygon.length], da=distance(a), db=distance(b);
    if (da >= -1e-9) result.push(a);
    if ((da >= -1e-9) !== (db >= -1e-9)) {
      const t=da/(da-db);
      result.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
    }
  }
  return result;
}

export class RenderedPavementIndex {
  constructor(cellSize = 60) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Invalid pavement cell size');
    this.cellSize = cellSize;
    this.cells = new Map();
    this.triangleCount = 0;
  }

  addTriangle(ax, ay, az, bx, by, bz, cx, cy, cz, metadata = {}) {
    const values = [ax, ay, az, bx, by, bz, cx, cy, cz].map(Math.fround);
    if (!values.every(Number.isFinite)) return false;
    [ax, ay, az, bx, by, bz, cx, cy, cz] = values;
    const ux = bx - ax, uz = bz - az, vx = cx - ax, vz = cz - az;
    const determinant = ux * vz - vx * uz;
    if (Math.abs(determinant) < 1e-10) return false;
    const face = { ax, ay, az, ux, uz, vx, vz, dyB: by - ay, dyC: cy - ay,
      inverse: 1 / determinant, metadata };
    const minX = Math.floor(Math.min(ax, bx, cx) / this.cellSize);
    const maxX = Math.floor(Math.max(ax, bx, cx) / this.cellSize);
    const minZ = Math.floor(Math.min(az, bz, cz) / this.cellSize);
    const maxZ = Math.floor(Math.max(az, bz, cz) / this.cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = `${x}:${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(face);
      }
    }
    this.triangleCount += 1;
    return true;
  }

  /** Project a convex paint footprint onto the EXACT rendered Float32 faces.
   * Clips at road edges and holes instead of letting a long floating box cross
   * traffic islands. Adjacent faces keep their actual planes; no height averaging.
   * Distinct bridge decks are selected with the caller's road-height hint.
   */
  projectPaintPolygon(polygon, referenceHeight = null, options = {}) {
    if (!Array.isArray(polygon) || polygon.length < 3
      || !polygon.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))) return [];
    const minX = Math.min(...polygon.map(p => p.x)), maxX = Math.max(...polygon.map(p => p.x));
    const minZ = Math.min(...polygon.map(p => p.z)), maxZ = Math.max(...polygon.map(p => p.z));
    const candidates = new Set();
    for (let x = Math.floor(minX / this.cellSize); x <= Math.floor(maxX / this.cellSize); x++) {
      for (let z = Math.floor(minZ / this.cellSize); z <= Math.floor(maxZ / this.cellSize); z++) {
        for (const face of this.cells.get(`${x}:${z}`) || []) candidates.add(face);
      }
    }
    const result = [];
    const offset = options.offset ?? 0.006;
    if (!Number.isFinite(offset) || offset < 0 || offset > 0.1) throw new RangeError('Invalid paint offset');
    const includeBridges = options.includeBridges ?? Boolean(options.bridge);
    for (const face of candidates) {
      if (face.metadata.layer === 'parking_surfaces' || (!includeBridges && face.metadata.layer === 'bridges')) continue;
      const a = {x:face.ax,z:face.az}, b = {x:face.ax+face.ux,z:face.az+face.uz}, c = {x:face.ax+face.vx,z:face.az+face.vz};
      if (Math.max(a.x,b.x,c.x)<minX || Math.min(a.x,b.x,c.x)>maxX
        || Math.max(a.z,b.z,c.z)<minZ || Math.min(a.z,b.z,c.z)>maxZ) continue;
      const sign = Math.sign(1 / face.inverse);
      let clipped = polygon;
      for (const [u,v] of [[a,b],[b,c],[c,a]]) {
        clipped = clipPaintHalfPlane(clipped, p => sign*((v.x-u.x)*(p.z-u.z)-(v.z-u.z)*(p.x-u.x)));
        if (clipped.length < 3) break;
      }
      if (clipped.length < 3) continue;
      const heightAt = p => {
        const dx=p.x-face.ax, dz=p.z-face.az;
        return face.ay + (dx*face.vz-dz*face.vx)*face.inverse*face.dyB
          + (face.ux*dz-face.uz*dx)*face.inverse*face.dyC;
      };
      const centre = clipped.reduce((p,q)=>({x:p.x+q.x/clipped.length,z:p.z+q.z/clipped.length}),{x:0,z:0});
      const owner = this.sample(centre.x,centre.z,referenceHeight,{includeParking:false,includeBridges});
      // Do not paint a lower carriageway from an upper-deck way, or vice versa.
      // Near-coincident municipal faces are allowed; the visible upper face owns
      // its own paint, rather than a midpoint guess bridging the two surfaces.
      if (owner && Math.abs(heightAt(centre)-owner.height) > 0.05) continue;
      for (let i=1;i+1<clipped.length;i++) {
        const points=[clipped[0],clipped[i],clipped[i+1]];
        const area=(points[1].x-points[0].x)*(points[2].z-points[0].z)-(points[1].z-points[0].z)*(points[2].x-points[0].x);
        if (Math.abs(area)<1e-10) continue;
        if (area>0) [points[1],points[2]]=[points[2],points[1]];
        result.push(points.map(p=>({x:p.x,y:heightAt(p)+offset,z:p.z})));
      }
    }
    return result;
  }

  sample(x, z, referenceHeight = null, { includeParking = true, includeBridges = true } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const faces = this.cells.get(`${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`) || [];
    let best = null;
    let distance = Infinity;
    for (const face of faces) {
      if (!includeParking && face.metadata.layer === 'parking_surfaces') continue;
      if (!includeBridges && face.metadata.layer === 'bridges') continue;
      const dx = x - face.ax, dz = z - face.az;
      const b = (dx * face.vz - dz * face.vx) * face.inverse;
      const c = (face.ux * dz - face.uz * dx) * face.inverse;
      if (b < -1e-8 || c < -1e-8 || b + c > 1 + 1e-8) continue;
      const height = face.ay + b * face.dyB + c * face.dyC;
      const nextDistance = Number.isFinite(referenceHeight) ? Math.abs(height - referenceHeight) : 0;
      // Prefer the top of coincident faces; retain distinct stacked decks by
      // proximity to the actor's previous height, never by insertion order.
      if (!best || nextDistance < distance - 1e-8
        || (Math.abs(nextDistance - distance) <= 1e-8 && height > best.height)) {
        best = { ...face.metadata, height, heightSource: 'rendered-pavement-triangle' };
        distance = nextDistance;
      }
    }
    return best;
  }
}

export class OfficialDrivableSurfaceIndex {
  constructor(cellSize = 120) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entries = [];
  }

  add(rings, metadata = {}) {
    if (metadata.layer === 'bridges' && !officialBridgeIsVehicular(metadata.properties)) return false;
    if (!Array.isArray(rings) || !rings[0]?.length) return false;
    const outer = rings[0];
    const minX = Math.min(...outer.map((point) => point.x));
    const maxX = Math.max(...outer.map((point) => point.x));
    const minZ = Math.min(...outer.map((point) => point.y));
    const maxZ = Math.max(...outer.map((point) => point.y));
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return false;
    const entry = {
      bounds: { minX, maxX, minZ, maxZ },
      drivable: metadata.layer === 'road_surfaces' || metadata.layer === 'bridges',
      id: metadata.id || '',
      layer: metadata.layer || 'road_surfaces',
      properties: metadata.properties || {},
      rings,
    };
    this.entries.push(entry);
    for (let cellX = Math.floor(minX / this.cellSize); cellX <= Math.floor(maxX / this.cellSize); cellX += 1) {
      for (let cellZ = Math.floor(minZ / this.cellSize); cellZ <= Math.floor(maxZ / this.cellSize); cellZ += 1) {
        const key = `${cellX}:${cellZ}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(entry);
      }
    }
    return true;
  }

  query(x, z, options = {}) {
    const includeParking = options.includeParking !== false;
    const candidates = this.cells.get(`${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`) || [];
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const entry = candidates[index];
      if (!includeParking && !entry.drivable) continue;
      const bounds = entry.bounds;
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
      if (!pointInPolygon(x, z, entry.rings)) continue;
      return {
        drivable: entry.drivable,
        id: entry.id,
        layer: entry.layer,
        parking: entry.layer === 'parking_surfaces',
        properties: entry.properties,
      };
    }
    return null;
  }

  contains(x, z, options = {}) {
    const match = this.query(x, z, options);
    return Boolean(match && (options.includeParking !== false || match.drivable));
  }

  get polygonCount() {
    return this.entries.length;
  }
}

