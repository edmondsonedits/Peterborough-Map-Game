import { createPavementField, conformPavementTriangles } from './pavement-continuity.js';
import { terrainEnvelopeNodes } from './road-terrain-envelope.js';

const LATTICE_SPACING = 8;
const LATTICE_RADIUS = 40_000;
const ROAD_SAMPLE_RADIUS = 24;
const SURFACE_LIFT = 0.008;
const FOUNDATION_OFFSET = -0.055;

function meshRole(mesh) {
  const type = String(mesh?.userData?.type || '');
  if (type.startsWith('road-official-') && type.endsWith('-batch')) {
    const layer = type.slice('road-official-'.length, -'-batch'.length);
    if (['road_surfaces', 'parking_surfaces', 'bridges'].includes(layer)) {
      return { kind: 'official', layer, foundation: false };
    }
    return null;
  }
  if (['road-surface-batch', 'connected-road-surface', 'connected-road-junction', 'road-junction-surfaces'].includes(type)) {
    return { kind: 'fallback', layer: 'road_surfaces', foundation: false };
  }
  if (['road-foundation-batch', 'connected-road-foundation', 'road-junction-foundations'].includes(type)) {
    return { kind: 'fallback', layer: 'foundations', foundation: true };
  }
  return null;
}

function specialRoadCandidate(candidate) {
  const layer = Number(candidate?.layer);
  return Boolean(candidate && (candidate.bridge || candidate.tunnel || (Number.isFinite(layer) && layer !== 0)));
}

function normalizedSourceId(value) {
  return String(value || '').replace(/:\d+$/, '');
}

function sourceRangesForTriangle(ranges, firstVertex) {
  if (!Array.isArray(ranges) || !ranges.length) return [];
  return ranges.filter((range) => Number.isSafeInteger(range?.startVertex)
    && Number.isSafeInteger(range?.vertexCount)
    && range.startVertex <= firstVertex && range.startVertex + range.vertexCount >= firstVertex + 3);
}

function matchingCandidate(candidates, ranges) {
  if (!candidates.length) return null;
  const sourceIds = ranges.map((range) => normalizedSourceId(range.sourceId)).filter(Boolean);
  if (sourceIds.length) {
    const matched = candidates.find((candidate) => sourceIds.includes(normalizedSourceId(candidate.lineId)));
    if (matched) return matched;
  }
  return candidates[0];
}

function appendRanges(target, sources, vertexCount) {
  if (vertexCount <= 0) return;
  const startVertex = target.outputVertexCount;
  for (const source of sources) {
    const key = `${source.sourceId}\u0000${source.key || ''}`;
    const previous = target.latest.get(key);
    if (previous && previous.startVertex + previous.vertexCount === startVertex) previous.vertexCount += vertexCount;
    else {
      const range = { sourceId: source.sourceId, key: source.key, startVertex, vertexCount };
      target.ranges.push(range);
      target.latest.set(key, range);
    }
  }
  target.outputVertexCount += vertexCount;
}

function ordinaryOfficialCoverage(officialIndex, x, z) {
  if (typeof officialIndex?.contains !== 'function') return false;
  const match = typeof officialIndex.query === 'function'
    ? officialIndex.query(x, z, { includeParking: true, includeBridges: false }) : null;
  if (match?.layer === 'bridges') return false;
  if (typeof officialIndex.query === 'function' && !match) return false;
  return officialIndex.contains(x, z, { includeParking: true, includeBridges: false });
}

function crossSectionHasOfficialCoverage(officialIndex, candidate) {
  if (!Number.isFinite(candidate?.nearestX) || !Number.isFinite(candidate?.nearestZ)) return [];
  const probes = [];
  if (ordinaryOfficialCoverage(officialIndex, candidate.nearestX, candidate.nearestZ)) {
    probes.push([candidate.nearestX, candidate.nearestZ]);
  }
  // A median or small island may leave the projected centerline outside the
  // official polygon while adjacent ordinary pavement still owns its road.
  const radius = Math.min(Math.max(0, Number(candidate?.width) / 2), 4);
  const directionX = Number(candidate?.directionX), directionZ = Number(candidate?.directionZ);
  const directionLength = Math.hypot(directionX, directionZ);
  if (radius < 0.25 || !Number.isFinite(directionLength) || directionLength < 1e-6) return probes;
  const normalX = -directionZ / directionLength, normalZ = directionX / directionLength;
  for (const fraction of [0.25, 0.5, 0.75, 0.9]) {
    const offset = radius * fraction;
    for (const side of [-1, 1]) {
      if (ordinaryOfficialCoverage(officialIndex, candidate.nearestX + normalX * offset * side,
        candidate.nearestZ + normalZ * offset * side)) {
        probes.push([candidate.nearestX + normalX * offset * side,
          candidate.nearestZ + normalZ * offset * side]);
      }
    }
  }
  return probes;
}

function officialCoverageSameGrade(probes, candidate, renderedOfficialIndex) {
  if (!probes.length) return false;
  if (typeof renderedOfficialIndex?.sample !== 'function') return true;
  if (!Number.isFinite(candidate?.height)) return false;
  return probes.some(([x, z]) => {
    const face = renderedOfficialIndex.sample(x, z, candidate.height,
      { includeParking: true, includeBridges: false });
    return Number.isFinite(face?.height) && Math.abs(face.height - candidate.height) <= 1;
  });
}
function customBridgeAt(surface, x, z) {
  if (typeof surface?.heightAt !== 'function') return false;
  try { return Number.isFinite(surface.heightAt(x, z)); } catch { return false; }
}

function barycentricXZ(pointX, pointZ, triangle) {
  const ax = triangle[0], az = triangle[2];
  const ux = triangle[3] - ax, uz = triangle[5] - az;
  const vx = triangle[6] - ax, vz = triangle[8] - az;
  const determinant = ux * vz - vx * uz;
  if (Math.abs(determinant) < 1e-12) return null;
  const dx = pointX - ax, dz = pointZ - az;
  const b = (dx * vz - dz * vx) / determinant;
  const c = (ux * dz - uz * dx) / determinant;
  return [1 - b - c, b, c];
}

function heightSampler({ terrainHeight, roadIndex, clearance }) {
  return (x, z) => {
    const terrain = terrainHeight(x, z);
    if (!Number.isFinite(terrain)) throw new RangeError('Non-finite terrain height in road finish');
    const minimum = terrain + clearance + SURFACE_LIFT;
    let sum = minimum, weights = 1;
    for (const road of roadIndex.sampleAll(x, z, ROAD_SAMPLE_RADIUS) || []) {
      if (!Number.isFinite(road.height) || !Number.isFinite(road.distance) || !Number.isFinite(road.width)
        || road.bridge || road.tunnel || (Number.isFinite(Number(road.layer)) && Number(road.layer) !== 0)) continue;
      const reach = Math.max(0.1, road.width / 2 + ROAD_SAMPLE_RADIUS);
      const t = Math.max(0, Math.min(1, 1 - road.distance / reach));
      const weight = 8 * t * t * t;
      if (weight <= 0) continue;
      sum += Math.max(minimum, road.height + SURFACE_LIFT) * weight;
      weights += weight;
    }
    return Math.max(minimum, sum / weights);
  };
}

/**
 * Rebuild official/fallback road contact from final citywide Float32 geometry.
 * Municipal XY ownership remains authoritative; unsupported source pieces keep
 * their original elevations and are reported instead of being guessed.
 */
export function finishRoadSurfaces({ THREE, roadGroup, roadIndex, officialIndex, terrainHeight,
  Index, clearance = 0.14, hunterBridgeSurface = null, sourceRangesByMesh = new Map(),
  renderedOfficialIndex = null, terrainGrid = null } = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Float32BufferAttribute || !roadGroup?.children
    || typeof roadIndex?.sampleAll !== 'function' || typeof terrainHeight !== 'function'
    || typeof Index !== 'function' || !Number.isFinite(clearance) || !(sourceRangesByMesh instanceof Map)) {
    throw new TypeError('Invalid road surface finish inputs');
  }
  const baseField = createPavementField({ center: { x: 0, z: 0 }, spacing: LATTICE_SPACING,
    radius: LATTICE_RADIUS, heightAt: heightSampler({ terrainHeight, roadIndex, clearance }) });
  const envelope=terrainGrid?terrainEnvelopeNodes({field:baseField,terrainHeight,grid:terrainGrid,clearance:clearance+SURFACE_LIFT}):null;
  const field=envelope?createPavementField({center:{x:0,z:0},spacing:LATTICE_SPACING,radius:LATTICE_RADIUS,heightAt:envelope.heightAt}):baseField;
  // This field spans the entire city; feathering its perimeter would reintroduce
  // source-plane differences many blocks away from its origin.
  field.weight = () => 1;
  const nextOfficialIndex = new Index();
  const nextFallbackIndex = new Index();
  const updatedRanges = new Map(sourceRangesByMesh);
  const stats = { latticeSpacing: LATTICE_SPACING, latticeRadius: LATTICE_RADIUS, meshCount: 0,
    trianglesBefore: 0, trianglesAfter: 0, conformedTriangles: 0, preservedSpecialTriangles: 0,
    maskedFallbackTriangles: 0, skippedUnsupportedTriangles: 0, skippedIndexedMeshes: 0,
    officialTriangles: 0, fallbackTriangles: 0 };

  for (const mesh of [...roadGroup.children]) {
    const role = meshRole(mesh);
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    if (!role || !position) continue;
    stats.meshCount += 1;
    if (geometry.index) {
      const expanded = expandIndexedPositions(geometry, sourceRangesByMesh.get(mesh) || []);
      if (!expanded) { stats.skippedIndexedMeshes += 1; continue; }
      stats.skippedIndexedMeshes += 1;
      stats.trianglesBefore += expanded.positions.length / 9;
      stats.skippedUnsupportedTriangles += expanded.positions.length / 9;
      addContactTriangles(role, expanded.positions, mesh, nextOfficialIndex, nextFallbackIndex, stats, expanded.ranges);
      continue;
    }
    if (position.itemSize !== 3 || position.count % 3 !== 0) {
      stats.skippedUnsupportedTriangles += Math.floor(position.count / 3);
      continue;
    }

    const original = position.array;
    const sourceRanges = sourceRangesByMesh.get(mesh) || [];
    const finished = [];
    const rangeTracker = { ranges: [], latest: new Map(), outputVertexCount: 0 };
    const attrsForOutput = new Map(Object.entries(geometry.attributes)
      .filter(([name, attribute]) => name !== 'position' && name !== 'normal' && attribute.count === position.count)
      .map(([name, attribute]) => [name, []]));

    for (let offset = 0; offset < original.length; offset += 9) {
      const triangle = Array.from(original.subarray(offset, offset + 9), Math.fround);
      const inputVertex = offset / 3;
      const sources = sourceRangesForTriangle(sourceRanges, inputVertex);
      const cx = (triangle[0] + triangle[3] + triangle[6]) / 3;
      const cz = (triangle[2] + triangle[5] + triangle[8]) / 3;
      stats.trianglesBefore += 1;
      const candidates = roadIndex.sampleAll(cx, cz, ROAD_SAMPLE_RADIUS) || [];
      const candidate = matchingCandidate(candidates, sources);
      const special = role.layer === 'bridges' || customBridgeAt(hunterBridgeSurface, cx, cz)
        || specialRoadCandidate(candidate);
      if (special) {
        finished.push(...triangle);
        appendRanges(rangeTracker, sources, 3);
        if (attrsForOutput.size) appendTriangleAttributes(geometry, triangle, offset, triangle, attrsForOutput);
        stats.preservedSpecialTriangles += 1;
        continue;
      }
      if (role.kind === 'fallback' && (!candidate || specialRoadCandidate(candidate))) {
        finished.push(...triangle);
        appendRanges(rangeTracker, sources, 3);
        if (attrsForOutput.size) appendTriangleAttributes(geometry, triangle, offset, triangle, attrsForOutput);
        stats.skippedUnsupportedTriangles += 1;
        continue;
      }
      if (role.kind === 'fallback' && candidate && candidate.distance <= candidate.width / 2 + 0.25
        && officialCoverageSameGrade(crossSectionHasOfficialCoverage(officialIndex, candidate),
          candidate, renderedOfficialIndex)) {
        stats.maskedFallbackTriangles += 1;
        continue;
      }
      if (role.kind === 'fallback' && !candidate.onRoad) {
        finished.push(...triangle);
        appendRanges(rangeTracker, sources, 3);
        if (attrsForOutput.size) appendTriangleAttributes(geometry, triangle, offset, triangle, attrsForOutput);
        stats.skippedUnsupportedTriangles += 1;
        continue;
      }
      let conformed;
      try { conformed = conformPavementTriangles(triangle, field, { offset: role.foundation ? FOUNDATION_OFFSET : 0 }); }
      catch {
        finished.push(...triangle);
        appendRanges(rangeTracker, sources, 3);
        if (attrsForOutput.size) appendTriangleAttributes(geometry, triangle, offset, triangle, attrsForOutput);
        stats.skippedUnsupportedTriangles += 1;
        continue;
      }
      finished.push(...conformed);
      const outputVertexCount = conformed.length / 3;
      appendRanges(rangeTracker, sources, outputVertexCount);
      if (attrsForOutput.size) appendTriangleAttributes(geometry, triangle, offset, conformed, attrsForOutput);
      stats.conformedTriangles += conformed.length / 9;
    }

    const output = new Float32Array(finished);
    const replacement = new THREE.BufferGeometry();
    replacement.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
    for (const [name, values] of attrsForOutput) {
      const originalAttribute = geometry.attributes[name];
      replacement.setAttribute(name, new THREE.BufferAttribute(new originalAttribute.array.constructor(values),
        originalAttribute.itemSize, originalAttribute.normalized));
    }
    replacement.computeVertexNormals();
    replacement.computeBoundingBox();
    replacement.computeBoundingSphere();
    geometry.dispose();
    mesh.geometry = replacement;
    if (sourceRangesByMesh.has(mesh)) updatedRanges.set(mesh, rangeTracker.ranges);
    addContactTriangles(role, output, mesh, nextOfficialIndex, nextFallbackIndex, stats,
      updatedRanges.get(mesh) || []);
  }
  stats.trianglesAfter = stats.officialTriangles + stats.fallbackTriangles;
  if(envelope)stats.terrainEnvelope={...envelope.stats};
  return { officialIndex: nextOfficialIndex, fallbackIndex: nextFallbackIndex,
    sourceRangesByMesh: updatedRanges, heightAt: field.sample, stats };
}

function expandIndexedPositions(geometry, sourceRanges) {
  const position = geometry.attributes.position, index = geometry.index;
  if (position.itemSize !== 3 || index.count % 3 !== 0) return null;
  const positions = new Float32Array(index.count * 3);
  const tracker = { ranges: [], latest: new Map(), outputVertexCount: 0 };
  for (let offset = 0; offset < index.count; offset += 3) {
    const vertices = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const source = vertices[vertex], target = offset + vertex * 3;
      positions[target] = position.getX(source);
      positions[target + 1] = position.getY(source);
      positions[target + 2] = position.getZ(source);
    }
    const sources = sourceRanges.filter((range) => vertices.every((vertex) => vertex >= range.startVertex
      && vertex < range.startVertex + range.vertexCount));
    appendRanges(tracker, sources, 3);
  }
  return { positions, ranges: tracker.ranges };
}
function appendTriangleAttributes(geometry, sourceTriangle, sourceOffset, output, attributeTargets) {
  const weightsFor = [];
  for (let offset = 0; offset < output.length; offset += 3) {
    const weights = barycentricXZ(output[offset], output[offset + 2], sourceTriangle);
    weightsFor.push(weights || [1, 0, 0]);
  }
  for (const [name, values] of attributeTargets) {
    const attribute = geometry.attributes[name];
    const firstVertex = sourceOffset / 3;
    for (const weights of weightsFor) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        values.push(weights.reduce((sum, weight, vertex) => sum
          + weight * attribute.getComponent(firstVertex + vertex, component), 0));
      }
    }
  }
}

function addContactTriangles(role, positions, mesh, officialIndex, fallbackIndex, stats, ranges) {
  if (role.foundation) return;
  for (let offset = 0; offset + 8 < positions.length; offset += 9) {
    const sourceId = sourceRangesForTriangle(ranges, offset / 3)[0]?.sourceId || '';
    const metadata = { id: sourceId, sourceId, layer: role.layer,
      drivable: role.layer !== 'parking_surfaces', parking: role.layer === 'parking_surfaces',
      contact: role.kind };
    const index = role.kind === 'official' ? officialIndex : fallbackIndex;
    if (!index.addTriangle(...positions.slice(offset, offset + 9), metadata)) continue;
    if (role.kind === 'official' && !role.foundation) stats.officialTriangles += 1;
    else if (role.kind === 'fallback' && !role.foundation) stats.fallbackTriangles += 1;
  }
}
