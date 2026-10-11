import { mappedTurnLaneGroups } from './city-detail-rules.js?v=street-evidence-2&simulatorTasks=20261011b';
/** Mapped arrow paint is presentation only: no lane or physics changes. */
export function mappedArrowLaneOffsets(tags, profile, group, width) {
  if (!mappedTurnLaneGroups(tags, profile).some(candidate => candidate.direction === group.direction
    && candidate.oneWay === group.oneWay && candidate.symbols.join('|') === group.symbols.join('|'))) return [];
  const count = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  const forward = count(tags['lanes:forward']) || (tags['turn:lanes:forward'] ? String(tags['turn:lanes:forward']).split('|').length : 0)
    || (group.direction === 'forward' ? group.symbols.length : 0);
  const backward = count(tags['lanes:backward']) || (tags['turn:lanes:backward'] ? String(tags['turn:lanes:backward']).split('|').length : 0)
    || (group.direction === 'backward' ? group.symbols.length : 0);
  const shared = count(tags['lanes:both_ways']);
  const total = group.oneWay ? (count(tags.lanes) || group.symbols.length)
    : Math.max(count(profile?.lanes), count(tags.lanes), forward + backward + shared, group.symbols.length + 1);
  const laneWidth = width / total;
  const directional = group.direction === 'forward' ? forward : backward;
  return group.symbols.map((_, i) => group.oneWay ? width / 2 - (i + .5) * laneWidth
    : -width / 2 + (directional - i - .5) * laneWidth);
}

/** Local +X is driver's left; +Z is forward, all faces point upward. */
export function mappedArrowTriangles(symbol) {
  const positions = [];
  const triangle = (a,b,c) => {
    if ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0) [b,c]=[c,b];
    for (const p of [a,b,c]) positions.push(p[0],0,p[1]);
  };
  const quad = (a,b,c,d) => { triangle(a,b,c); triangle(a,c,d); };
  const movements = symbol.split(';');
  quad([-.14,-1.75],[.14,-1.75],[.14,.52],[-.14,.52]);
  if (movements.includes('through')) triangle([-.68,.52],[.68,.52],[0,1.72]);
  for (const side of [1,-1]) {
    if (!movements.some(m => side === 1 ? /left|reverse/.test(m) : /right/.test(m))) continue;
    quad([0,.24],[side*1.02,.24],[side*1.02,.52],[0,.52]);
    triangle([side*1.58,.38],[side*.82,-.25],[side*.82,1.01]);
  }
  return positions;
}

/** Subdivide on actual final face support; never interpolate across missing pavement.
 * Seven absent probes terminate immediately, bounding unsupported-region work. */
export function drapeMappedArrowTriangles(positions, sampleHeight,
  { spacing = .2, minimumSpacing = .025, tolerance = .002, lift = .008 } = {}) {
  const output = [], cache = new Map();
  const height = p => {
    const key = `${p[0]}:${p[2]}`;
    if (!cache.has(key)) cache.set(key, sampleHeight(p[0],p[2]));
    return cache.get(key);
  };
  const point = p => [Math.fround(p[0]), 0, Math.fround(p[2])];
  const midpoint = (a,b) => point([(a[0]+b[0])/2,0,(a[2]+b[2])/2]);
  function visit(a,b,c) {
    const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    const center=[(a[0]+b[0]+c[0])/3,0,(a[2]+b[2]+c[2])/3];
    const probes=[a,b,c,ab,bc,ca,center], heights=probes.map(height), valid=heights.map(Number.isFinite);
    if (!valid.some(Boolean)) return;
    const edges=[Math.hypot(a[0]-b[0],a[2]-b[2]),Math.hypot(b[0]-c[0],b[2]-c[2]),Math.hypot(c[0]-a[0],c[2]-a[2])];
    const size=Math.max(...edges);
    const planar=valid.every(Boolean) && Math.max(Math.abs(heights[3]-(heights[0]+heights[1])/2),
      Math.abs(heights[4]-(heights[1]+heights[2])/2),Math.abs(heights[5]-(heights[2]+heights[0])/2),
      Math.abs(heights[6]-(heights[0]+heights[1]+heights[2])/3)) <= tolerance;
    if (size <= spacing && planar) {
      for (let i=0;i<3;i++) output.push(probes[i][0],heights[i]+lift,probes[i][2]);
    } else if (size > minimumSpacing) {
      // Bisect only the longest edge. Uniform quartering repeatedly splits the
      // already-narrow width of stems and multiplies queries/vertices needlessly.
      // Both children retain winding and exact projected parent coverage; each
      // still has to pass the same seven-probe spacing/support/plane criteria.
      if (edges[0] === size) { visit(a,ab,c); visit(ab,b,c); }
      else if (edges[1] === size) { visit(a,b,bc); visit(a,bc,c); }
      else { visit(a,b,ca); visit(ca,b,c); }
    }
  }
  for (let i=0;i<positions.length;i+=9) visit(point(positions.slice(i,i+3)),point(positions.slice(i+3,i+6)),point(positions.slice(i+6,i+9)));
  return output;
}

/** Parking support needs explicit mapped service/access turn evidence. Bridges
 * require the real bridge deck; neither off-road terrain nor inferred ribbons
 * may fill gaps in municipal ownership. */
export function mappedArrowSupport(index, x, z, referenceHeight, tags = {}, profile = {}) {
  const parking = tags.highway === 'service' && Object.keys(tags).some(key => /^turn:lanes(?::forward|:backward)?$/.test(key) && /left|right|through|reverse/.test(tags[key]));
  const bridge = Boolean(profile.bridge) || ['yes','true','1'].includes(String(tags.bridge));
  const hit = index?.sample(x,z,referenceHeight,{includeParking:parking,includeBridges:bridge});
  if (!hit || (bridge && hit.layer !== 'bridges')) return null;
  return Number.isFinite(hit.height) ? hit.height : null;
}
