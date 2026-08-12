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
  const sides = new Set();
  const both = String(tags.cycleway || tags['cycleway:both'] || '').toLowerCase();
  const left = String(tags['cycleway:left'] || '').toLowerCase();
  const right = String(tags['cycleway:right'] || '').toLowerCase();
  // A mapped `shared_lane` is a sharrow rather than a continuous cycle-lane
  // boundary, so it must not generate a misleading solid edge line.
  const lane = (value) => /^(lane|track|share_busway|shoulder)$/.test(value);
  if (lane(both)) { sides.add('left'); sides.add('right'); }
  if (lane(left)) sides.add('left');
  if (lane(right)) sides.add('right');
  return [...sides];
}

/**
 * Return the paint boundaries between mapped vehicle lanes.
 *
 * Ontario convention uses yellow to divide opposing traffic and white between
 * lanes moving in the same direction. Urban opposing-traffic boundaries are
 * continuous by default; OSM `overtaking=yes` is treated as explicit evidence
 * that a broken centre line is appropriate.
 */
export function roadLaneMarkingBoundaries(tags = {}, profile = {}) {
  if (profile.unpaved || profile.tunnel || profile.parkingAisle) return [];
  if (tags.junction === 'roundabout' || String(tags.lane_markings || '').toLowerCase() === 'no') return [];
  const highway = String(profile.highway || tags.highway || '').toLowerCase();
  const markableClass = /^(motorway|trunk|primary|secondary|tertiary)(?:_link)?$/.test(highway)
    || String(tags.lane_markings || '').toLowerCase() === 'yes';
  const lanes = Math.max(1, Math.round(Number(profile.lanes) || Number(tags.lanes) || 1));
  if (!markableClass || lanes < 2) return [];

  const twoWay = !profile.oneWay;
  const mappedBackward = Number.parseFloat(tags['lanes:backward']);
  const centerBoundary = twoWay
    ? Number.isFinite(mappedBackward) && mappedBackward > 0 ? Math.round(mappedBackward) : Math.floor(lanes / 2)
    : -1;
  const brokenOpposingBoundary = /^(yes|permissive)$/i.test(String(tags.overtaking || ''));
  const boundaries = [];
  for (let boundary = 1; boundary < lanes; boundary += 1) {
    const opposing = twoWay && boundary === centerBoundary;
    boundaries.push({
      boundary,
      materialKey: opposing ? 'roadPaintYellow' : 'roadPaintWhite',
      pattern: opposing && !brokenOpposingBoundary ? 'solid' : 'dash',
    });
  }
  return boundaries;
}

const TURN_SYMBOLS = new Set(['left', 'slight_left', 'sharp_left', 'through', 'right', 'slight_right', 'sharp_right', 'reverse', 'merge_to_left', 'merge_to_right']);

function turnLaneSymbols(value) {
  return String(value || '').split('|').map((lane) => {
    const choices = lane.split(';').map((choice) => choice.trim().toLowerCase()).filter(Boolean);
    return choices.find((choice) => TURN_SYMBOLS.has(choice)) || null;
  });
}

/** Return only explicitly mapped turn arrows; blank/`none` lanes stay unpainted. */
export function mappedTurnLaneGroups(tags = {}, profile = {}) {
  const groups = [];
  const oneWay = Boolean(profile.oneWay);
  const oneWayDirection = String(tags.oneway || '').toLowerCase() === '-1' ? 'backward' : 'forward';
  const generic = turnLaneSymbols(tags['turn:lanes']);
  if (generic.some(Boolean) && oneWay) groups.push({ direction: oneWayDirection, symbols: generic, oneWay: true });
  const forward = turnLaneSymbols(tags['turn:lanes:forward']);
  if (forward.some(Boolean)) groups.push({ direction: 'forward', symbols: forward, oneWay: false });
  const backward = turnLaneSymbols(tags['turn:lanes:backward']);
  if (backward.some(Boolean)) groups.push({ direction: 'backward', symbols: backward, oneWay: false });
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
