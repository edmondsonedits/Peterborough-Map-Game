import {parseMeters} from './feature-utils.js';

export function pathSurface(tags, municipalTrail = false) {
  const surface = String(tags.surface || '').toLowerCase();
  if (/^(concrete|paving_stones|sett|cobblestone)/.test(surface)) return 'concrete';
  if (/^(asphalt|paved|chipseal)$/.test(surface)) return 'paved';
  if (/^(compacted|gravel|fine_gravel|pebblestone)$/.test(surface)) return 'gravel';
  if (/^(ground|dirt|earth|mud|grass|sand|unpaved|woodchips)$/.test(surface)) return 'earth';
  if (municipalTrail) return 'gravel';
  if (tags.highway === 'cycleway' || tags.highway === 'pedestrian') return 'paved';
  return tags.highway === 'footway' ? 'concrete' : 'earth';
}

export function buildPathCorners(segments) {
  const normals = new Map();
  const joints = new Map();
  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dz);
    const normal = {x: dz / length, z: -dx / length};
    normals.set(segment, normal);
    for (const point of [segment.a, segment.b]) {
      if (!joints.has(point)) joints.set(point, []);
      joints.get(point).push(normal);
    }
  }
  return (point, segment) => {
    const normal = normals.get(segment);
    let x = 0, z = 0;
    for (const other of joints.get(point)) {
      const direction = other.x * normal.x + other.z * normal.z < 0 ? -1 : 1;
      x += other.x * direction;
      z += other.z * direction;
    }
    const offset = segment.width / 2 / Math.max(0.65 * Math.hypot(x,z), x * normal.x + z * normal.z);
    return [{x: point.x + x * offset, z: point.y + z * offset}, {x: point.x - x * offset, z: point.y - z * offset}];
  };
}

export function treeForm(tags = {}, seed) {
  const conifer = tags.leaf_type === 'needleleaved' || (tags.leaf_type !== 'broadleaved' && seed < 0.19);
  const measuredHeight = parseMeters(tags.height);
  const measuredCrown = parseMeters(tags.diameter_crown);
  const height = measuredHeight > 0 ? Math.max(2, Math.min(34, measuredHeight)) : null;
  const crown = measuredCrown > 0 ? Math.max(0.3, Math.min(3, measuredCrown / 7)) : 0.78 + 0.48 * seed;
  return {conifer, height, crown};
}

export function recreationTreeClearance(type = '') {
  if (/baseball|softball|slo-pitch|cricket pitch|sports field/i.test(type)) return 27;
  if (/court|playground|skateboard|splash pad|wading pool/i.test(type)) return 9;
  return 0;
}

export function pathCoverageOverlaps(segment, other, x, z) {
  const dx = segment.b.x - segment.a.x, dz = segment.b.y - segment.a.y;
  const ox = other.b.x - other.a.x, oz = other.b.y - other.a.y;
  const lengthSquared = ox * ox + oz * oz;
  const dot = dx * ox + dz * oz;
  if (dot * dot < 0.8 * (dx * dx + dz * dz) * lengthSquared) return false;
  const t = ((x - other.a.x) * ox + (z - other.a.y) * oz) / lengthSquared;
  if (t < 0 || t > 1) return false;
  return (x - other.a.x - t * ox) ** 2 + (z - other.a.y - t * oz) ** 2 <= 4;
}

export function installParkGroundDetail(material) {
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => cacheKey + ':park-ground';
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.vertexShader = 'varying vec2 parkGroundXZ;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nparkGroundXZ = (modelMatrix * vec4(position, 1.0)).xz;',
    );
    shader.fragmentShader = 'varying vec2 parkGroundXZ;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      float greenCover = smoothstep(0.008, 0.055, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
      vec2 parkPosition = parkGroundXZ;
      float coarseGround = sin(dot(parkPosition, vec2(0.19, 0.11))) * sin(dot(parkPosition, vec2(-0.12, 0.17)));
      float nearGround = 1.0 - smoothstep(0.045, 0.24, fwidth(parkPosition.x) + fwidth(parkPosition.y));
      float grassGrain = sin(dot(parkPosition, vec2(8.3, 6.6))) * sin(dot(parkPosition, vec2(-11.2, 7.7)));
      diffuseColor.rgb *= 1.0 + greenCover * (0.11 * coarseGround + 0.028 * nearGround * grassGrain);
      `,
    );
  };
}

export function pathGradeStops(leftStart, leftEnd, rightStart, rightEnd, length, grid) {
  const count = Math.max(1, Math.ceil(length / 14));
  const stops = new Set(Array.from({length: count + 1}, (_, index) => index / count));
  if (!grid) return [...stops];
  const spacing = grid.size / grid.segments;
  function addCrossings(start, end, origin) {
    const a = (start - origin) / spacing;
    const b = (end - origin) / spacing;
    for (let edge = Math.floor(Math.min(a,b)) + 1; edge < Math.max(a,b); edge += 1) {
      const t = (edge - a) / (b - a);
      if (t > 1e-7 && t < 1 - 1e-7) stops.add(Math.round(t * 1e7) / 1e7);
    }
  }
  // Match PlaneGeometry's x/z grid lines and its x + z triangle diagonals.
  for (const [start, end] of [[leftStart,leftEnd], [rightStart,rightEnd]]) {
    addCrossings(start.x, end.x, grid.minX);
    addCrossings(start.z, end.z, grid.minZ);
    addCrossings(start.x + start.z, end.x + end.z, grid.minX + grid.minZ);
  }
  return [...stops].sort((a,b) => a - b).filter((stop, index, sorted) => !index || stop - sorted[index - 1] > 1e-7);
}
