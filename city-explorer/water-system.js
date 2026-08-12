/** Pure helpers for staged water surfaces and terrain carving. */

export const WATER_SURFACE_CLEARANCE = 0.065;
export const WATER_TERRAIN_RECESS = 0.18;

export function relativeWaterElevation(absoluteElevation, terrainBaseElevation, clearance = WATER_SURFACE_CLEARANCE) {
  const elevation = Number(absoluteElevation);
  const base = Number(terrainBaseElevation);
  return Number.isFinite(elevation) && Number.isFinite(base) ? elevation - base + clearance : Number.NaN;
}

export function robustFallbackWaterHeight(samples, clearance = WATER_SURFACE_CLEARANCE) {
  const values = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return clearance;
  // A low quartile rejects raised banks and islands while remaining much less
  // sensitive to a single low/no-data terrain pixel than a minimum.
  const position = (values.length - 1) * 0.22;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = values[lower] + (values[upper] - values[lower]) * (position - lower);
  return value + clearance;
}

export function watercourseWidth(properties = {}) {
  const name = String(properties.official_name_label || '').toLowerCase();
  const permanency = String(properties.permanency || '').toLowerCase();
  if (name.includes('jackson creek')) return 3.2;
  if (name.includes('meade creek') || name.includes('miller creek') || name.includes('bears creek')) return 2.6;
  return permanency === 'intermittent' ? 0.9 : 1.55;
}

export function createWaterStageSampler(rings, { sampleSpacing = 32, cellSize = 96, fallbackHeight = 0 } = {}) {
  const cells = new Map();
  const samples = [];
  const key = (cellX, cellZ) => `${cellX}:${cellZ}`;
  const add = (sample) => {
    if (![sample.x, sample.y, sample.z].every(Number.isFinite)) return;
    samples.push(sample);
    const cellKey = key(Math.floor(sample.x / cellSize), Math.floor(sample.z / cellSize));
    if (!cells.has(cellKey)) cells.set(cellKey, []);
    cells.get(cellKey).push(sample);
  };
  for (const ring of rings || []) {
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      if (!a || !b) continue;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.ceil(length / sampleSpacing));
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        add({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
  }
  const sample = (x, z) => {
    if (!samples.length) return fallbackHeight;
    const cellX = Math.floor(x / cellSize);
    const cellZ = Math.floor(z / cellSize);
    let candidates = [];
    // Expand only until a local shoreline/stage segment has been found. This
    // avoids a long Earcut diagonal blending lock levels kilometres apart.
    for (let radius = 0; radius <= 6 && candidates.length < 8; radius += 1) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (radius && Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== radius) continue;
          const bucket = cells.get(key(cellX + offsetX, cellZ + offsetZ));
          if (bucket) candidates.push(...bucket);
        }
      }
    }
    if (!candidates.length) candidates = samples;
    const nearest = candidates
      .map((candidate) => ({ candidate, distance2: (candidate.x - x) ** 2 + (candidate.z - z) ** 2 }))
      .sort((a, b) => a.distance2 - b.distance2)
      .slice(0, 8);
    if (nearest[0].distance2 < 0.0001) return nearest[0].candidate.y;
    let weighted = 0;
    let totalWeight = 0;
    for (const entry of nearest) {
      const weight = 1 / Math.max(16, entry.distance2);
      weighted += entry.candidate.y * weight;
      totalWeight += weight;
    }
    return totalWeight ? weighted / totalWeight : fallbackHeight;
  };
  sample.sampleCount = samples.length;
  return sample;
}

export function subdivideWaterTriangle(a, b, c, sampleHeight, { maximumEdge = 72, maximumTriangles = 4096 } = {}) {
  const triangles = [];
  const queue = [[a, b, c]];
  const edge2 = (first, second) => (first.x - second.x) ** 2 + (first.z - second.z) ** 2;
  while (queue.length && triangles.length + queue.length < maximumTriangles) {
    const triangle = queue.pop();
    const edges = [
      { a: triangle[0], b: triangle[1], other: triangle[2], length2: edge2(triangle[0], triangle[1]) },
      { a: triangle[1], b: triangle[2], other: triangle[0], length2: edge2(triangle[1], triangle[2]) },
      { a: triangle[2], b: triangle[0], other: triangle[1], length2: edge2(triangle[2], triangle[0]) },
    ].sort((left, right) => right.length2 - left.length2);
    const longest = edges[0];
    if (longest.length2 <= maximumEdge ** 2) {
      triangles.push(triangle);
      continue;
    }
    const midpoint = {
      x: (longest.a.x + longest.b.x) / 2,
      z: (longest.a.z + longest.b.z) / 2,
    };
    midpoint.y = sampleHeight(midpoint.x, midpoint.z);
    queue.push([longest.a, midpoint, longest.other], [midpoint, longest.b, longest.other]);
  }
  // A pathological source triangle still remains valid and bounded rather than
  // being discarded if it reaches the defensive split budget.
  triangles.push(...queue);
  return triangles;
}

export function triangleMaximumPlanarEdge(triangle) {
  const edge = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  return Math.max(edge(triangle[0], triangle[1]), edge(triangle[1], triangle[2]), edge(triangle[2], triangle[0]));
}

function triangleHeightAt(triangle, x, z) {
  const denominator = (triangle.bz - triangle.cz) * (triangle.ax - triangle.cx)
    + (triangle.cx - triangle.bx) * (triangle.az - triangle.cz);
  if (Math.abs(denominator) < 1e-9) return Number.NaN;
  const a = ((triangle.bz - triangle.cz) * (x - triangle.cx)
    + (triangle.cx - triangle.bx) * (z - triangle.cz)) / denominator;
  const b = ((triangle.cz - triangle.az) * (x - triangle.cx)
    + (triangle.ax - triangle.cx) * (z - triangle.cz)) / denominator;
  const c = 1 - a - b;
  if (a < -1e-5 || b < -1e-5 || c < -1e-5) return Number.NaN;
  return a * triangle.ay + b * triangle.by + c * triangle.cy;
}

export class HydroSurfaceIndex {
  constructor(cellSize = 120) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.triangleCount = 0;
  }

  key(cellX, cellZ) {
    return `${cellX}:${cellZ}`;
  }

  addTriangle(a, b, c) {
    const triangle = {
      ax: a.x, ay: a.y, az: a.z,
      bx: b.x, by: b.y, bz: b.z,
      cx: c.x, cy: c.y, cz: c.z,
    };
    const minCellX = Math.floor(Math.min(a.x, b.x, c.x) / this.cellSize);
    const maxCellX = Math.floor(Math.max(a.x, b.x, c.x) / this.cellSize);
    const minCellZ = Math.floor(Math.min(a.z, b.z, c.z) / this.cellSize);
    const maxCellZ = Math.floor(Math.max(a.z, b.z, c.z) / this.cellSize);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const key = this.key(cellX, cellZ);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(triangle);
      }
    }
    this.triangleCount += 1;
  }

  heightAt(x, z) {
    const candidates = this.cells.get(this.key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize))) || [];
    let height = Number.NaN;
    for (const triangle of candidates) {
      const candidate = triangleHeightAt(triangle, x, z);
      if (Number.isFinite(candidate) && (!Number.isFinite(height) || candidate > height)) height = candidate;
    }
    return height;
  }
}
