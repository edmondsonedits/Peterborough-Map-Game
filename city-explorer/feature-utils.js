export function featureTags(feature) {
  const properties = feature?.properties || {};
  return properties.tags || properties;
}

export function stableHash(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicNumber(seed, min, max) {
  const normalized = (stableHash(seed) % 10000) / 10000;
  return min + (max - min) * normalized;
}

export function parseMeters(value) {
  if (value === undefined || value === null) return NaN;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const number = Number.parseFloat(match[0]);
  if (!Number.isFinite(number)) return NaN;
  if (/ft|feet|foot|'/i.test(String(value))) return number * 0.3048;
  return number;
}

export function simplifyRing(points, tolerance = 0.75, maxPoints = 100) {
  if (points.length <= 4) return points;
  const simplified = [points[0]];
  let last = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    if (points[index].distanceTo(last) >= tolerance) {
      simplified.push(points[index]);
      last = points[index];
    }
  }
  simplified.push(points[points.length - 1]);
  if (simplified.length <= maxPoints) return simplified;
  const stride = Math.ceil(simplified.length / maxPoints);
  return simplified.filter((_, index) => index % stride === 0 || index === simplified.length - 1);
}

export function polygonArea(ring) {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index].x * ring[index + 1].y - ring[index + 1].x * ring[index].y;
  }
  return Math.abs(sum / 2);
}

export function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

export function geometryPolygons(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

export function geometryLines(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

export function geometryPoints(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'MultiPoint') return geometry.coordinates;
  return [];
}

export function createFootprintCentroidIndex(cellSize = 80) {
  const cells = new Map();
  const add = (rings) => {
    if (!rings?.[0]?.length) return;
    const outer = rings[0];
    const bounds = {
      minX: Math.min(...outer.map((point) => point.x)),
      maxX: Math.max(...outer.map((point) => point.x)),
      minZ: Math.min(...outer.map((point) => point.y)),
      maxZ: Math.max(...outer.map((point) => point.y)),
    };
    const entry = { bounds, rings };
    for (let cellX = Math.floor(bounds.minX / cellSize); cellX <= Math.floor(bounds.maxX / cellSize); cellX += 1) {
      for (let cellZ = Math.floor(bounds.minZ / cellSize); cellZ <= Math.floor(bounds.maxZ / cellSize); cellZ += 1) {
        const key = `${cellX}:${cellZ}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(entry);
      }
    }
  };
  return {
    add,
    contains(x, z, tolerance = 4.5) {
      const cellX = Math.floor(x / cellSize);
      const cellZ = Math.floor(z / cellSize);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
          for (const entry of cells.get(`${cellX + offsetX}:${cellZ + offsetZ}`) || []) {
            if (x < entry.bounds.minX - tolerance || x > entry.bounds.maxX + tolerance
              || z < entry.bounds.minZ - tolerance || z > entry.bounds.maxZ + tolerance) continue;
            const point = { x, y:z };
            if (pointInPolygon(point, entry.rings)) return true;
            const toleranceSquared = tolerance * tolerance;
            for (const ring of entry.rings) {
              for (let index = 0; index < ring.length; index += 1) {
                const a = ring[index];
                const b = ring[(index + 1) % ring.length];
                const dx = b.x - a.x;
                const dz = b.y - a.y;
                const lengthSquared = dx * dx + dz * dz;
                const rawT = lengthSquared > 0.000001
                  ? ((x - a.x) * dx + (z - a.y) * dz) / lengthSquared
                  : 0;
                const t = Math.max(0, Math.min(1, rawT));
                const nearestX = a.x + dx * t;
                const nearestZ = a.y + dz * t;
                if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 <= toleranceSquared) return true;
              }
            }
          }
        }
      }
      return false;
    },
  };
}
