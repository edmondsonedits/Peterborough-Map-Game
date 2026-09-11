/** Shared presentation datum. Source polygon XY borders remain unchanged. */
export function createPavementField({ center, heightAt, spacing = 4, radius = 240 }) {
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.z) || typeof heightAt !== 'function'
    || !Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(radius) || radius <= 0) throw new TypeError('Invalid pavement field');
  const origin = { x: center.x, z: center.z };
  const cache = new Map();
  const node = (ix, iz) => {
    const key = `${ix}:${iz}`;
    if (!cache.has(key)) {
      const height = heightAt(ix * spacing, iz * spacing);
      if (!Number.isFinite(height)) throw new RangeError('Non-finite pavement height');
      cache.set(key, height);
    }
    return cache.get(key);
  };
  const sample = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('Invalid pavement coordinate');
    const ix = Math.floor(x / spacing), iz = Math.floor(z / spacing);
    const u = x / spacing - ix, v = z / spacing - iz;
    if (u + v <= 1) return node(ix, iz) * (1 - u - v) + node(ix + 1, iz) * u + node(ix, iz + 1) * v;
    return node(ix + 1, iz + 1) * (u + v - 1) + node(ix, iz + 1) * (1 - u) + node(ix + 1, iz) * (1 - v);
  };
  const featherStart = Math.min(200, radius * 5 / 6);
  const weight = (x, z) => {
    const distance = Math.hypot(x - origin.x, z - origin.z);
    const t = Math.max(0, Math.min(1, (radius - distance) / (radius - featherStart)));
    return t * t * (3 - 2 * t);
  };
  return { center: origin, spacing, radius, sample, weight };
}

// Sutherland-Hodgman clipping; interpolating Y retains the input triangle plane.
function clip(polygon, signedDistance) {
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = signedDistance(a), db = signedDistance(b);
    if (da >= 0) output.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return output;
}

/** Conform triangle soup to the common lattice; full agreement inside 200m.
 * In the outer feather, each input's original elevation is deliberately retained
 * in proportion to distance. This does not resolve differing surface ownership.
 */
export function conformPavementTriangles(positions, field, { offset = 0 } = {}) {
  if (positions.length % 9 || !Number.isFinite(offset)) throw new TypeError('Invalid pavement triangle buffer');
  const output = [];
  const { spacing, radius, center } = field;
  const xmin = center.x - radius, xmax = center.x + radius;
  const zmin = center.z - radius, zmax = center.z + radius;
  const emit = (polygon, conform) => {
    if (polygon.length < 3) return;
    const vertices = polygon.map((p) => {
      const weight = conform ? field.weight(p.x, p.z) : 0;
      return { ...p, y: weight > 0 ? p.y + weight * (field.sample(p.x, p.z) + offset - p.y) : p.y };
    });
    for (let i = 1; i + 1 < vertices.length; i++) {
      const a = vertices[0], b = vertices[i], c = vertices[i + 1];
      if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-12) continue;
      for (const p of [a, b, c]) output.push(p.x, p.y, p.z);
    }
  };
  const boundaries = [p => p.x - xmin, p => xmax - p.x, p => p.z - zmin, p => zmax - p.z];
  for (let index = 0; index < positions.length; index += 9) {
    const triangle = [0, 3, 6].map((j) => ({ x: positions[index + j], y: positions[index + j + 1], z: positions[index + j + 2] }));
    if (!triangle.every(p => [p.x, p.y, p.z].every(Number.isFinite))) throw new TypeError('Non-finite pavement vertex');
    const minX = Math.min(...triangle.map(p => p.x)), maxX = Math.max(...triangle.map(p => p.x));
    const minZ = Math.min(...triangle.map(p => p.z)), maxZ = Math.max(...triangle.map(p => p.z));
    const nearestX = Math.max(minX, Math.min(center.x, maxX)), nearestZ = Math.max(minZ, Math.min(center.z, maxZ));
    if (Math.hypot(nearestX - center.x, nearestZ - center.z) >= radius) {
      for (let j = 0; j < 9; j++) output.push(positions[index + j]);
      continue;
    }
    let inside = triangle;
    for (const boundary of boundaries) {
      emit(clip(inside, p => -boundary(p)), false);
      inside = clip(inside, boundary);
      if (inside.length < 3) break;
    }
    if (inside.length < 3) continue;
    const firstX = Math.floor(Math.min(...inside.map(p => p.x)) / spacing);
    const lastX = Math.ceil(Math.max(...inside.map(p => p.x)) / spacing) - 1;
    const firstZ = Math.floor(Math.min(...inside.map(p => p.z)) / spacing);
    const lastZ = Math.ceil(Math.max(...inside.map(p => p.z)) / spacing) - 1;
    for (let ix = firstX; ix <= lastX; ix++) for (let iz = firstZ; iz <= lastZ; iz++) {
      const x = ix * spacing, z = iz * spacing;
      let cell = clip(inside, p => p.x - x);
      cell = clip(cell, p => x + spacing - p.x);
      cell = clip(cell, p => p.z - z);
      cell = clip(cell, p => z + spacing - p.z);
      if (cell.length < 3) continue;
      const diagonal = p => x + z + spacing - p.x - p.z;
      emit(clip(cell, diagonal), true);
      emit(clip(cell, p => -diagonal(p)), true);
    }
  }
  return output;
}
