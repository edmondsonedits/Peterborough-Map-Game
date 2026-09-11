import clipping from './vendor/polygon-clipping-0.15.7.js';
import { createPavementField, conformPavementTriangles } from './pavement-continuity.js';

/** Local reconstruction only. The municipal outlines remain the ownership mask;
 * all resulting pieces use the same metric triangulated height field. */
export function reconcileStationPavement({ THREE, group, polygons, center, terrainHeight, roadIndex, Index }) {
  const radius = 240;
  const bounds = [center.x - radius, center.z - radius, center.x + radius, center.z + radius];
  const box = [[[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]], [bounds[0], bounds[1]]]];
  const intersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  const ringBounds = ring => ring.reduce((b, v) => [Math.min(b[0], v[0]), Math.min(b[1], v[1]), Math.max(b[2], v[0]), Math.max(b[3], v[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  // A large polygon can cross or contain the pilot without any vertex inside it.
  const local = polygons.filter(p => p.layer !== 'bridges' && intersects(ringBounds(p.rings[0]), bounds));
  const roadPolygons = local.filter(p => p.layer === 'road_surfaces').map(p => p.rings);
  const allPolygons = local.map(p => p.rings);
  if (!roadPolygons.length) return null;
  const roads = clipping.intersection(clipping.union(...roadPolygons), box);
  const owned = clipping.intersection(clipping.union(...allPolygons), box);
  const field = createPavementField({ center, radius, spacing: 4, heightAt(x, z) {
    const ground = terrainHeight(x, z) + 0.148;
    let sum = ground, weights = 1;
    for (const road of roadIndex.sampleAll(x, z, 24)) {
      if (road.bridge) continue;
      const reach = road.width / 2 + 24;
      const t = Math.max(0, 1 - road.distance / reach);
      const weight = 8 * t * t * t;
      sum += Math.max(ground, road.height + 0.008) * weight;
      weights += weight;
    }
    return Math.max(ground, sum / weights);
  } });
  const index = new Index();
  const snapshot = [];
  let changedMeshes = 0, reusedMeshes = 0, maximumHeightChange = 0;
  const replacements = [];
  const near = p => Math.min(p[0], p[3], p[6]) < bounds[2] && Math.max(p[0], p[3], p[6]) > bounds[0]
    && Math.min(p[2], p[5], p[8]) < bounds[3] && Math.max(p[2], p[5], p[8]) > bounds[1];
  function cut(positions, mask) {
    if (!mask?.length) return Array.from(positions);
    const components = mask.map(polygon => ({ polygon, bounds: ringBounds(polygon[0]) }));
    const output = [];
    for (let i = 0; i < positions.length; i += 9) {
      const p = Array.from(positions.slice(i, i + 9));
      if (!near(p)) { output.push(...p); continue; }
      const triangleBounds = [Math.min(p[0], p[3], p[6]), Math.min(p[2], p[5], p[8]), Math.max(p[0], p[3], p[6]), Math.max(p[2], p[5], p[8])];
      const relevant = components.filter(component => intersects(component.bounds, triangleBounds)).map(component => component.polygon);
      if (!relevant.length) { output.push(...p); continue; }
      const ax = p[0], az = p[2], ux = p[3] - ax, uz = p[5] - az, vx = p[6] - ax, vz = p[8] - az;
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 1e-9) { output.push(...p); continue; }
      const pieces = clipping.difference([[[ax, az], [p[3], p[5]], [p[6], p[8]], [ax, az]]], relevant);
      for (const polygon of pieces) {
        const rings = polygon.map(r => r.slice(0, -1).map(v => new THREE.Vector2(v[0], v[1])));
        const vertices = rings.flat();
        const faces = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
        for (const face of faces) {
          const tri = [];
          for (const n of face) {
            const v = vertices[n], dx = v.x - ax, dz = v.y - az;
            const b = (dx * vz - dz * vx) / det, c = (ux * dz - uz * dx) / det;
            tri.push(v.x, p[1] + b * (p[4] - p[1]) + c * (p[7] - p[1]), v.y);
          }
          // Keep the source face's winding after the boolean operation.
          if (((tri[3] - tri[0]) * (tri[8] - tri[2]) - (tri[5] - tri[2]) * (tri[6] - tri[0])) * det < 0)
            tri.splice(3, 6, ...tri.slice(6, 9), ...tri.slice(3, 6));
          output.push(...tri);
        }
      }
    }
    return output;
  }
  for (const mesh of [...group.children]) {
    const type = mesh.userData?.type || '';
    const official = type.startsWith('road-official-');
    const ordinary = ['road-surface-batch', 'road-foundation-batch'].includes(type);
    if (!official && !ordinary) continue;
    const layer = official ? type.slice('road-official-'.length, -'-batch'.length) : 'osm';
    const original = mesh.geometry.attributes.position.array;
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;
    const affected = layer !== 'bridges' && intersects([min.x, min.z, max.x, max.z], bounds);
    let positions = original;
    if (affected) {
      positions = cut(positions, ordinary ? owned : layer === 'parking_surfaces' ? roads : null);
      const offset = type === 'road-foundation-batch' ? -0.055 : 0;
      positions = conformPavementTriangles(positions, field, { offset });
      const replacement = new THREE.BufferGeometry();
      replacement.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      replacement.computeVertexNormals(); replacement.computeBoundingSphere();
      replacements.push({ mesh, replacement });
      changedMeshes++;
      for (let i = 0; i < original.length; i += 3) {
        if (Math.hypot(original[i] - center.x, original[i + 2] - center.z) < 200)
          maximumHeightChange = Math.max(maximumHeightChange, Math.abs(field.sample(original[i], original[i + 2]) + offset - original[i + 1]));
      }
    } else reusedMeshes++;
    if (official) for (let i = 0; i < positions.length; i += 9) {
      const p = positions.slice(i, i + 9);
      index.addTriangle(...p, { layer, drivable: layer !== 'parking_surfaces', parking: layer === 'parking_surfaces' });
      if (near(p)) snapshot.push({ vertices: p.map(Math.fround), metadata: { layer } });
    }
  }
  for (const { mesh, replacement } of replacements) { mesh.geometry.dispose(); mesh.geometry = replacement; }
  return { index, field, snapshot, diagnostics: { changedMeshes, reusedMeshes, maximumHeightChange, spacing: 4, radius, triangles: index.triangleCount } };
}
