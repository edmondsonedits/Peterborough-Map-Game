/** Pure classification helpers for scalable road and building detail. */

const URBAN_CURB_HIGHWAYS = new Set([
  'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary',
  'tertiary_link', 'residential', 'unclassified', 'living_street',
]);

export function shouldRenderUrbanCurb(tags = {}, profile = {}) {
  const highway = String(tags.highway || profile.highway || '').toLowerCase();
  if (!URBAN_CURB_HIGHWAYS.has(highway) || profile.unpaved || profile.bridge || profile.tunnel) return false;
  const maxspeed = Number.parseFloat(tags.maxspeed);
  if (Number.isFinite(maxspeed) && maxspeed > 70) return false;
  if (['residential', 'living_street'].includes(highway)) return true;
  const sidewalk = String(tags.sidewalk || '').toLowerCase();
  const lit = String(tags.lit || '').toLowerCase();
  return lit === 'yes' || ['both', 'left', 'right', 'separate'].includes(sidewalk) || !Number.isFinite(maxspeed) || maxspeed <= 60;
}

export function mappedCycleLaneSides(tags = {}) {
  const both = tags['cycleway:both'] ?? tags.cycleway;
  // Separate tracks, shoulders and shared bus lanes are not painted bike lanes.
  return ['left', 'right'].filter(side =>
    String(tags[`cycleway:${side}`] ?? both ?? '').toLowerCase() === 'lane');
}

/**
 * Return the paint boundaries between mapped vehicle lanes.
 *
 * Yellow separates opposing traffic and white separates same-direction lanes.
 * Defaults are inferred, not photographic confirmation. Passing permission is
 * not proof of dashed paint. Explicit dividers and shared-turn lanes win.
 */
export function roadLaneMarkingBoundaries(tags = {}, profile = {}) {
  if (profile.unpaved || profile.tunnel || profile.parkingAisle) return [];
  if (tags.junction === 'roundabout' || String(tags.lane_markings || '').toLowerCase() === 'no') return [];
  const highway = String(profile.highway || tags.highway || '').toLowerCase();
  const markable = /^(motorway|trunk|primary|secondary|tertiary)(?:_link)?$/.test(highway)
    || tags.lane_markings === 'yes' || Boolean(tags.divider);
  const lanes = Number(profile.lanes || tags.lanes);
  if (!markable || !Number.isInteger(lanes) || lanes < 2) return [];
  const twoWay = !profile.oneWay;
  const count = value => value !== undefined && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0
    ? Number(value) : null;
  const shared = count(tags['lanes:both_ways']) || 0;
  let backward = count(tags['lanes:backward']);
  const forward = count(tags['lanes:forward']);
  if (twoWay) {
    if (backward === null && forward !== null) backward = lanes - forward - shared;
    if (backward === null && (lanes - shared) % 2 === 0) backward = (lanes - shared) / 2;
    // An unallocated odd total may include a turn pocket; don't invent its side.
    if (backward === null || backward <= 0 || backward + shared >= lanes
      || (forward !== null && forward + backward + shared !== lanes)) return [];
  }
  const result = [];
  for (let boundary = 1; boundary < lanes; boundary++) {
    const opposing = twoWay && (boundary === backward || (shared > 0 && boundary === backward + shared));
    const materialKey = opposing ? 'roadPaintYellow' : 'roadPaintWhite';
    if (opposing && shared === 1) {
      // Solid outside the centre lane, dashed inside. Offset is positive left.
      const sign = boundary === backward ? 1 : -1;
      result.push({ boundary, materialKey, pattern: 'solid', offsetMetres: sign * 0.12 });
      result.push({ boundary, materialKey, pattern: 'dash', offsetMetres: -sign * 0.12 });
    } else if (opposing && tags.divider === 'no') {
      continue;
    } else if (opposing && tags.divider === 'double_solid_line') {
      for (const offsetMetres of [-0.12, 0.12]) result.push({ boundary, materialKey, pattern: 'solid', offsetMetres });
    } else {
      result.push({ boundary, materialKey, pattern: opposing && tags.divider !== 'dashed_line' ? 'solid' : 'dash' });
    }
  }
  return result;
}

const TURN_SYMBOLS = new Set(['left', 'slight_left', 'sharp_left', 'through', 'right', 'slight_right', 'sharp_right', 'reverse', 'merge_to_left', 'merge_to_right']);

function turnLaneSymbols(value) {
  return String(value || '').split('|').map((lane) => {
    const choices = lane.split(';').map((choice) => choice.trim().toLowerCase()).filter(Boolean);
    return [...new Set(choices.filter((choice) => TURN_SYMBOLS.has(choice)))].join(';') || null;
  });
}

/** Return only explicitly mapped turn arrows; blank/`none` lanes stay unpainted. */
export function mappedTurnLaneGroups(tags = {}, profile = {}) {
  const groups = [];
  const oneWay = Boolean(profile.oneWay) || ['yes', '1', '-1'].includes(String(tags.oneway).toLowerCase());
  const oneWayDirection = String(tags.oneway || '').toLowerCase() === '-1' ? 'backward' : 'forward';
  const count = key => tags[key] === undefined || tags[key] === '' ? null
    : Number.isInteger(Number(tags[key])) && Number(tags[key]) >= 0 ? Number(tags[key]) : NaN;
  const total = count('lanes'), forwardCount = count('lanes:forward'), backwardCount = count('lanes:backward');
  const shared = count('lanes:both_ways') ?? 0;
  const inferredForward = forwardCount ?? (tags['turn:lanes:forward'] ? turnLaneSymbols(tags['turn:lanes:forward']).length : null);
  const inferredBackward = backwardCount ?? (tags['turn:lanes:backward'] ? turnLaneSymbols(tags['turn:lanes:backward']).length : null);
  if (!oneWay && total !== null && inferredForward !== null && inferredBackward !== null
    && inferredForward + inferredBackward + shared !== total) return [];
  if ([total, forwardCount, backwardCount, shared].some(Number.isNaN)) return [];
  if (total !== null && (total < 1 || (forwardCount !== null && backwardCount !== null
    && forwardCount + backwardCount + shared !== total))) return [];
  const add = (direction, value) => {
    const symbols = turnLaneSymbols(value);
    const directionalCount = direction === 'forward' ? forwardCount : backwardCount;
    if (!symbols.some(Boolean) || (directionalCount !== null && directionalCount !== symbols.length)
      || (oneWay && total !== null && total !== symbols.length)
      || (!oneWay && total !== null && symbols.length + shared >= total)) return;
    groups.push({ direction, symbols, oneWay });
  };
  if (oneWay) {
    const directional = tags[`turn:lanes:${oneWayDirection}`];
    // Even a blank directional tag overrides generic evidence: don't invent a
    // second group or send arrows against a reverse one-way restriction.
    add(oneWayDirection, directional !== undefined ? directional : tags['turn:lanes']);
  } else {
    add('forward', tags['turn:lanes:forward']);
    add('backward', tags['turn:lanes:backward']);
  }
  return groups;
}

export function estimatedBuildingFloors(tags = {}, wallHeight = 6.5) {
  const mapped = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(mapped) && mapped > 0) return Math.max(1, Math.min(24, Math.round(mapped)));
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  if (/garage|shed|carport|roof/.test(type)) return 0;
  return Math.max(1, Math.min(24, Math.round(Number(wallHeight) / 3.15)));
}

export function facadeDetailClass(tags = {}) {
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const use = `${type} ${tags.shop || ''} ${tags.office || ''} ${tags.amenity || ''} ${tags.tourism || ''}`.toLowerCase();
  if (/garage|shed|carport|roof|greenhouse/.test(type)) return 'none';
  if (/retail|commercial|office|supermarket|mall|restaurant|cafe|fast_food|bank|hotel/.test(use)) return 'storefront';
  if (/industrial|warehouse|manufacture/.test(use)) return 'industrial';
  return 'windows';
}

export function selectStreetSignIntersections(segments = [], maximum = 220) {
  const nodes = new Map();
  const keyFor = (point) => `${Math.round(point.x * 2)}:${Math.round(point.y * 2)}`;
  const add = (point, segment, endpoint) => {
    const name = String(segment.name || segment.tags?.name || '').trim();
    if (!name || !point) return;
    const key = keyFor(point);
    if (!nodes.has(key)) nodes.set(key, { x: point.x, z: point.y, y: endpoint === 'a' ? segment.aY : segment.bY, roads: new Map(), segments: [] });
    const node = nodes.get(key);
    node.y = Math.max(Number(node.y) || 0, Number(endpoint === 'a' ? segment.aY : segment.bY) || 0);
    node.roads.set(name, Math.max(node.roads.get(name) || 0, roadImportance(segment.tags?.highway)));
    node.segments.push(segment);
  };
  for (const segment of segments) {
    if (segment.aSourceVertex || segment.aLineEndpoint) add(segment.a, segment, 'a');
    if (segment.bSourceVertex || segment.bLineEndpoint) add(segment.b, segment, 'b');
  }
  const results = [];
  for (const node of nodes.values()) {
    const names = [...node.roads.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (names.length < 2) continue;
    const segment = node.segments.sort((a, b) => roadImportance(b.tags?.highway) - roadImportance(a.tags?.highway))[0];
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const importance = names[0][1] + names[1][1];
    const signs = names.slice(0, 2).map(([name]) => {
      const namedSegment = node.segments.find((candidate) => String(candidate.name || candidate.tags?.name || '').trim() === name) || segment;
      const signDx = namedSegment.b.x - namedSegment.a.x;
      const signDz = namedSegment.b.y - namedSegment.a.y;
      const signLength = Math.max(0.001, Math.hypot(signDx, signDz));
      return { name, directionX: signDx / signLength, directionZ: signDz / signLength };
    });
    results.push({
      x: node.x,
      z: node.z,
      y: node.y,
      names: names.slice(0, 2).map(([name]) => name),
      directionX: dx / length,
      directionZ: dz / length,
      signs,
      roadWidth: Number(segment.width || segment.profile?.width || 6),
      score: importance * 1000 + names.reduce((sum, [, rank]) => sum + rank, 0),
    });
  }
  return results.sort((a, b) => b.score - a.score || a.names.join('/').localeCompare(b.names.join('/'))).slice(0, Math.max(0, maximum));
}

function roadImportance(highway = '') {
  return ({ motorway: 10, trunk: 9, primary: 8, secondary: 7, tertiary: 6, residential: 4, unclassified: 3, living_street: 2, service: 1 })[String(highway).replace(/_link$/, '')] || 0;
}
