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

  sample(x, z, referenceHeight = null, { includeParking = true } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const faces = this.cells.get(`${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`) || [];
    let best = null;
    let distance = Infinity;
    for (const face of faces) {
      if (!includeParking && face.metadata.layer === 'parking_surfaces') continue;
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

