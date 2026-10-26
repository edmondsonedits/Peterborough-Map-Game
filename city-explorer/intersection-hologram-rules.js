/** Pure same-grade street-junction and camera-heading rules for intersection labels. */

const DEFAULTS = Object.freeze({ nodeSnapMetres: 0.12, heightTolerance: 0.35,
  directionToleranceRadians: 0.16, headingHysteresis: 0.08 });

const NON_MOTOR_HIGHWAYS = new Set(['footway', 'cycleway', 'path', 'pedestrian', 'steps',
  'bridleway', 'corridor', 'platform', 'crossing', 'proposed', 'construction']);

function pointFor(segment, endpoint) { return endpoint === 'a' ? segment.a : segment.b; }
function heightFor(segment, endpoint) { return Number(endpoint === 'a' ? segment.aY : segment.bY); }
function endpointDirection(segment, endpoint) {
  const sign = endpoint === 'a' ? 1 : -1;
  const dx = (Number(segment.b?.x) - Number(segment.a?.x)) * sign;
  const dz = (Number(segment.b?.y) - Number(segment.a?.y)) * sign;
  const length = Math.hypot(dx, dz);
  return length > 1e-5 ? { x: dx / length, z: dz / length } : null;
}
function layerOf(segment) {
  const value = Number.parseFloat(segment.tags?.layer);
  return Number.isFinite(value) ? value : 0;
}
function nameOf(segment) {
  return String(segment.name || segment.tags?.name || '').trim();
}
function eligible(segment) {
  const tags = segment.tags || {}, profile = segment.profile || {};
  const highway = String(tags.highway || profile.highway || '').toLowerCase();
  const accessValues = [tags.access, tags.vehicle, tags.motor_vehicle, tags.motorcar]
    .map(value => String(value || '').toLowerCase());
  return Boolean(nameOf(segment)) && !NON_MOTOR_HIGHWAYS.has(highway)
    && !accessValues.some(value => ['no', 'foot', 'pedestrian', 'bicycle', 'ski'].includes(value))
    && !profile.tunnel && !profile.parkingAisle && !segment.tunnel && tags.tunnel !== 'yes';
}
function horizontalNodeKey(point, layer, snap) {
  return `${Math.round(Number(point.x) / snap)}:${Math.round(Number(point.y) / snap)}:${layer}`;
}
function distinctAxes(arms, tolerance) {
  const axes = [];
  for (const arm of arms) {
    // An axis treats opposite travel directions as the same street direction.
    const duplicate = axes.some(axis => Math.acos(Math.max(-1, Math.min(1,
      Math.abs(axis.x * arm.direction.x + axis.z * arm.direction.z)))) < tolerance);
    if (!duplicate) axes.push(arm.direction);
  }
  return axes;
}

/**
 * Build all named, source-endpoint junctions. A junction needs at least two
 * distinct street names and two non-collinear arms; coordinate proximity alone
 * cannot connect different elevations or mapped layers.
 */
export function buildIntersectionHolograms(segments = [], options = {}) {
  const config = { ...DEFAULTS, ...options };
  if (![config.nodeSnapMetres, config.heightTolerance, config.directionToleranceRadians]
    .every(Number.isFinite) || config.nodeSnapMetres <= 0 || config.heightTolerance <= 0
    || config.directionToleranceRadians <= 0) throw new TypeError('Invalid intersection hologram options');

  const sourceNodes = new Map();
  for (const segment of segments) {
    if (!eligible(segment) || !Number.isFinite(Number(segment.width || segment.profile?.width || 6))) continue;
    for (const endpoint of ['a', 'b']) {
      if (!(endpoint === 'a' ? segment.aSourceVertex || segment.aLineEndpoint
        : segment.bSourceVertex || segment.bLineEndpoint)) continue;
      const point = pointFor(segment, endpoint), height = heightFor(segment, endpoint);
      if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))
        || !Number.isFinite(height)) continue;
      const direction = endpointDirection(segment, endpoint);
      if (!direction) continue;
      const layer = layerOf(segment), key = horizontalNodeKey(point, layer, config.nodeSnapMetres);
      if (!sourceNodes.has(key)) sourceNodes.set(key, []);
      sourceNodes.get(key).push({ x: Number(point.x), z: Number(point.y), y: height, layer,
        name: nameOf(segment), direction, width: Number(segment.width || segment.profile?.width || 6), segment });
    }
  }

  const results = [];
  for (const [sourceKey, sourceArms] of sourceNodes) {
    sourceArms.sort((a, b) => a.y - b.y || a.name.localeCompare(b.name));
    const clusters = [];
    for (const arm of sourceArms) {
      // Complete-linkage elevation clusters prevent a sequence of small height
      // steps from connecting roads whose total separation exceeds tolerance.
      let cluster = clusters.find(candidate => arm.y - candidate.minHeight <= config.heightTolerance
        && Math.hypot(candidate.x - arm.x, candidate.z - arm.z) <= config.nodeSnapMetres * 1.5);
      if (!cluster) {
        cluster = { x: arm.x, z: arm.z, minHeight: arm.y, y: arm.y, layer: arm.layer, arms: [] };
        clusters.push(cluster);
      }
      cluster.y = Math.max(cluster.y, arm.y);
      cluster.arms.push(arm);
    }
    for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
      const node = clusters[clusterIndex];
      const names = [...new Set(node.arms.map(arm => arm.name))].sort((a, b) => a.localeCompare(b));
      if (names.length < 2 || distinctAxes(node.arms, config.directionToleranceRadians).length < 2) continue;
      const roads = names.map(name => {
        const arms = node.arms.filter(arm => arm.name === name);
        const directions = [];
        for (const arm of arms) {
          if (!directions.some(direction => Math.acos(Math.max(-1, Math.min(1,
            Math.abs(direction.x * arm.direction.x + direction.z * arm.direction.z))))
            < config.directionToleranceRadians)) directions.push({ ...arm.direction });
        }
        return { name, directions, width: Math.max(...arms.map(arm => arm.width)) };
      });
      results.push({ id: `${sourceKey}:${clusterIndex}`, x: node.x, z: node.z, y: node.y, names, roads,
        roadWidth: Math.max(...node.arms.map(arm => arm.width)) });
    }
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

/** Choose the road aligned with vehicle travel heading (independent of camera
 * look direction), retaining the prior
 * choice within a 0.08 heading-score margin so labels switch near turn midpoint. */
export function chooseIntersectionStreet(junction, heading, previousStreet = null) {
  const hx = Number(heading?.x), hz = Number(heading?.z), length = Math.hypot(hx, hz);
  if (!Number.isFinite(length) || length < 1e-8) throw new TypeError('Heading must be a finite non-zero direction');
  const roads = Array.isArray(junction?.roads) ? junction.roads : [];
  const scored = roads.map(road => ({ name: road.name,
    score: Math.max(0, ...(road.directions || []).map(direction =>
      Math.abs((hx / length) * Number(direction.x) + (hz / length) * Number(direction.z)))) }));
  scored.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
  const best = scored[0];
  const previous = scored.find(road => road.name === previousStreet);
  const currentStreet = previous && best && best.score - previous.score <= DEFAULTS.headingHysteresis
    ? previous.name : best?.name || null;
  const displayNames = roads.map(road => road.name).filter(name => name && name !== currentStreet);
  return { currentStreet, displayNames, displayText: displayNames.join(' / ') };
}
