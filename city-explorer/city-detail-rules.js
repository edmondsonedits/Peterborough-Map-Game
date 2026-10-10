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
  // Tracks, shoulders, sharrows and bus lanes are not proof of bicycle-lane
  // paint. A side-specific `no` takes precedence over the generic tag.
  const common = tags['cycleway:both'] ?? tags.cycleway ?? '';
  return ['left', 'right'].filter(side =>
    /^(lane|opposite_lane)$/.test(String(tags[`cycleway:${side}`] ?? common).toLowerCase()));
}

/** Lane order is LEFT-to-RIGHT looking along the original OSM way.
 * Parking and bicycle lanes are not included in OSM's motor-vehicle count.
 * An odd two-way count without directional tags is ambiguous, not permission
 * to guess which side has the extra lane. Reversible lanes need a timed model.
 */
export function roadLaneLayout(tags = {}, profile = {}) {
  const parse = value => /^\d+$/.test(String(value ?? '')) ? Number(value) : null;
  if (/^(reversible|alternating)$/.test(String(tags.oneway || ''))) return null;
  const lanes = parse(tags.lanes) || Number(profile.lanes);
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 20) return null;
  const oneWay = Boolean(profile.oneWay) || /^(yes|1|-1)$/.test(String(tags.oneway || ''));
  if (oneWay) return { lanes, forward: tags.oneway === '-1' ? 0 : lanes,
    backward: tags.oneway === '-1' ? lanes : 0, shared: 0, oneWay: true };
  let forward = parse(tags['lanes:forward']), backward = parse(tags['lanes:backward']);
  if (forward === null && tags['turn:lanes:forward']) forward = String(tags['turn:lanes:forward']).split('|').length;
  if (backward === null && tags['turn:lanes:backward']) backward = String(tags['turn:lanes:backward']).split('|').length;
  const shared = parse(tags['lanes:both_ways']) || 0;
  if (forward === null && backward !== null) forward = lanes - backward - shared;
  if (backward === null && forward !== null) backward = lanes - forward - shared;
  if (forward === null && backward === null && (lanes - shared) % 2 === 0) {
    forward = backward = (lanes - shared) / 2;
  }
  if (!(forward > 0 && backward > 0) || forward + backward + shared !== lanes || shared > 1) return null;
  return { lanes, forward, backward, shared, oneWay: false };
}

/** Convention-based paint, not a claim of per-road photogrammetric verification.
 * References: Ontario Traffic Manual Book 11, Figures 3 and 34. A permission to
 * overtake is NOT an observation of a broken yellow line.
 */
export function roadLaneMarkingBoundaries(tags = {}, profile = {}) {
  if (profile.unpaved || profile.tunnel || profile.parkingAisle) return [];
  if (tags.junction === 'roundabout' || String(tags.lane_markings || '').toLowerCase() === 'no') return [];
  const highway = String(profile.highway || tags.highway || '').toLowerCase();
  const markable = /^(motorway|trunk|primary|secondary|tertiary)(?:_link)?$/.test(highway)
    || String(tags.lane_markings || '').toLowerCase() === 'yes';
  const layout = roadLaneLayout(tags, profile);
  if (!markable || !layout || layout.lanes < 2) return [];
  const result = [];
  for (let boundary = 1; boundary < layout.lanes; boundary += 1) {
    const sharedBorder = layout.shared && (boundary === layout.backward || boundary === layout.backward + 1);
    const opposing = !layout.oneWay && (boundary === layout.backward || sharedBorder);
    const entry = { boundary, materialKey: opposing ? 'roadPaintYellow' : 'roadPaintWhite',
      pattern: sharedBorder ? 'shared' : opposing ? 'solid' : 'dash' };
    if (sharedBorder) entry.sharedInsideSign = boundary === layout.backward ? -1 : 1;
    result.push(entry);
  }
  return result;
}

/** Positive offset points LEFT of the original OSM way, matching renderer normals. */
export function laneBoundaryOffset(width, lanes, boundary) {
  return width / 2 - width * boundary / lanes;
}

export function turnLaneOffset(tags, profile, direction, laneIndex) {
  const layout = roadLaneLayout(tags, profile);
  if (!layout || !Number.isInteger(laneIndex) || laneIndex < 0) return null;
  const count = layout[direction];
  if (!(count > laneIndex)) return null;
  const index = direction === 'backward' ? layout.backward - 1 - laneIndex
    : layout.backward + layout.shared + laneIndex;
  return profile.width / 2 - profile.width * (index + 0.5) / layout.lanes;
}

/** Ontario Book 11 urban/rural dash templates; actual exceptions require survey. */
export function roadDashPattern(tags = {}) {
  return { length: 3, period: /^(motorway|trunk)(?:_link)?$/.test(tags.highway || '')
    || Number.parseFloat(tags.maxspeed) >= 90 ? 12 : 9 };
}

const TURN_SYMBOLS = new Set(['left', 'slight_left', 'sharp_left', 'through', 'right', 'slight_right', 'sharp_right', 'reverse', 'merge_to_left', 'merge_to_right']);

function turnLaneSymbols(value) {
  return String(value || '').split('|').map((lane) => {
    const choices = lane.split(';').map((choice) => choice.trim().toLowerCase()).filter(Boolean);
    return choices.filter((choice) => TURN_SYMBOLS.has(choice)).join(';') || null;
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
