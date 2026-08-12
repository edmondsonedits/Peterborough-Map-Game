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

export class OfficialDrivableSurfaceIndex {
  constructor(cellSize = 120) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entries = [];
  }

  add(rings, metadata = {}) {
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

