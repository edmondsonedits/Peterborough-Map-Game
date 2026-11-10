// Photo-supported open canopies. Keep original map geometry and contacts owned
// by the caller; this module returns bounded appearance triangles only.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const ULTRAMAR_ID = 'way/446339023';
const sourceRingLonLat = [
  [-78.3312310, 44.3189701], [-78.3311098, 44.3190320],
  [-78.3310571, 44.3189790], [-78.3311783, 44.3189170],
];

export const RECORDED_CANOPIES = freeze({
  [ULTRAMAR_ID]: {
    sourceId: ULTRAMAR_ID,
    photoIds: ['R041', 'R043', 'R045', 'R047', 'R049'],
    sourceRingLonLat,
    observed: 'Open flat fuel canopy; pale square supports; navy southwest wordmark fascia; pale southeast return with blue lower edge.',
    estimated: '4.7 m minimum underside clearance, 0.55 m slab/fascia, 0.4 m support width and four inset support positions are visual estimates; source footprint is retained.',
    groundRequirement: { parkingSourceId: '10/99', restoredHoleIndex: 2, preserveHoleIndices: [1] },
    clearHeightMetres: 4.7,
    fasciaHeightMetres: .55,
    blueEdgeHeightMetres: .075,
    supportWidthMetres: .4,
    supports: [{ u: .2, v: .18 }, { u: .8, v: .18 }, { u: .2, v: .82 }, { u: .8, v: .82 }],
    fasciaFamilies: ['pale', 'pale', 'pale', 'navy'],
    blueEdgeIndices: [2, 3],
    colors: { roof: '#909592', underside: '#dce0d9', pale: '#d6dcd8', navy: '#234f79', blue: '#4a95bc' },
    signProfile: {
      id: ULTRAMAR_ID, label: 'CHEM-852-CANOPY', name: 'Ultramar canopy, 852 Chemong Road',
      confidence: 'observed', appearanceOnly: true, preserveMappedMassing: true,
      style: 'canopy', blankFacade: true, skipGroundWindows: true, levels: 1, windowColumns: 1,
      entryDoor: null, porch: false, features: [],
      frontLatLon: [
        { lat: 44.3189170, lon: -78.3311783 }, { lat: 44.3189701, lon: -78.3312310 },
      ],
      signText: 'Ultramar', signBusinessName: 'Ultramar', signStyle: 'applied',
      signTextColor: '#f5f5ee', signFont: 'italic 700 46px Arial,sans-serif',
      signWidthMetres: 4.1, signBoardHeightMetres: .44, signHeightMetres: 4.95,
      signFraction: .5, signOutsetMetres: .025, detailHeightMetres: 5.25,
      notes: 'The southwest canopy wordmark is readable in R041/R043. No named sign is inferred on the rear, side, garage or freestanding pylon.',
    },
  },
});

const finite = Number.isFinite;
const point = value => ({ x: value?.x, z: finite(value?.z) ? value.z : value?.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const familyNames = ['roof', 'underside', 'pale', 'navy', 'blue'];
const emptySurfaces = definition => Object.fromEntries(familyNames.map(family => [family, {
  color: definition?.colors?.[family] || '#808080', positions: [],
}]));

/**
 * Return source-footprint triangles suitable for the app's spatial/material
 * buffers. Ground must be supplied by the separately verified forecourt repair.
 * Numeric or {height} samples are accepted; this helper cannot authorize ground
 * contact from an arbitrary sampler. Failure is atomic: no triangles/signs.
 */
export function buildRecordedCanopy({ sourceId = ULTRAMAR_ID, definition = RECORDED_CANOPIES[sourceId],
  ring: sourceRing, holes = [], project, groundHeightAt, maxTriangles = 256, lite = false } = {}) {
  const fail = reason => ({ valid: false, reason, sourceId, surfaces: emptySurfaces(definition),
    footprint: [], posts: [], groundSamples: [], signProfile: null, triangleCount: 0 });
  if (!definition || definition.sourceId !== sourceId || typeof project !== 'function'
    || typeof groundHeightAt !== 'function') return fail('missing-reviewed-source-or-ground');
  if (!Array.isArray(sourceRing) || !Array.isArray(holes) || holes.length) return fail('unsupported-footprint');
  let ring = sourceRing.map(point);
  if (ring.length === 5 && distance(ring[0], ring[4]) < .0001) ring = ring.slice(0, 4);
  if (ring.length !== 4 || ring.some(p => !finite(p.x) || !finite(p.z))) return fail('invalid-footprint');
  if (!Array.isArray(definition.sourceRingLonLat) || definition.sourceRingLonLat.length !== 4) return fail('invalid-source-outline');
  let expected;
  try { expected = definition.sourceRingLonLat.map(([lon, lat]) => point(project(lat, lon))); }
  catch { return fail('invalid-projection'); }
  if (expected.some(p => !finite(p.x) || !finite(p.z))) return fail('invalid-projection');
  // Canonical ordering assigns photographed edge colors correctly even when a
  // source parser reverses or rotates the four vertices. Retain caller points.
  let ordered;
  for (let start = 0; start < 4 && !ordered; start++) for (const direction of [1, -1]) {
    const candidate = expected.map((_, i) => ring[(start + direction * i + 8) % 4]);
    if (candidate.every((p, i) => distance(p, expected[i]) <= .04)) { ordered = candidate; break; }
  }
  if (!ordered) return fail('source-footprint-mismatch');
  ring = ordered;
  const turns = ring.map((p, i) => cross(p, ring[(i + 1) % 4], ring[(i + 2) % 4]));
  if (turns.some(value => Math.abs(value) < 1) || !turns.every(value => Math.sign(value) === Math.sign(turns[0]))) return fail('nonconvex-footprint');
  const area = Math.abs(ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % 4].z - ring[(i + 1) % 4].x * p.z, 0)) / 2;
  if (area < 20 || area > 250) return fail('unsupported-footprint-area');
  const { clearHeightMetres: clearance, fasciaHeightMetres: fascia, supportWidthMetres: supportWidth,
    blueEdgeHeightMetres: blueHeight, supports } = definition;
  if (![clearance, fascia, supportWidth, blueHeight].every(finite) || clearance < 3 || clearance > 6.5
    || fascia < .2 || fascia > 1 || supportWidth < .2 || supportWidth > .7 || blueHeight < .02 || blueHeight > fascia / 2
    || !Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > 1024
    || !Array.isArray(supports) || supports.length !== 4
    || !Array.isArray(definition.fasciaFamilies) || definition.fasciaFamilies.length !== 4
    || definition.fasciaFamilies.some(family => !['pale', 'navy'].includes(family))
    || !Array.isArray(definition.blueEdgeIndices) || definition.blueEdgeIndices.some(index => !Number.isInteger(index) || index < 0 || index > 3)
    || familyNames.some(family => !/^#[\da-f]{6}$/i.test(definition.colors?.[family] || ''))) return fail('invalid-definition');
  const inside = p => ring.every((a, i) => cross(a, ring[(i + 1) % 4], p) * Math.sign(turns[0]) > .001);
  const uLength = distance(ring[0], ring[1]), vLength = distance(ring[0], ring[3]);
  const u = { x: (ring[1].x - ring[0].x) / uLength, z: (ring[1].z - ring[0].z) / uLength };
  const v = { x: (ring[3].x - ring[0].x) / vLength, z: (ring[3].z - ring[0].z) / vLength };
  if (Math.abs(u.x * v.x + u.z * v.z) > .04) return fail('skewed-support-frame');
  const pointAt = (s, t) => ({
    x: ring[0].x * (1 - s) * (1 - t) + ring[1].x * s * (1 - t) + ring[2].x * s * t + ring[3].x * (1 - s) * t,
    z: ring[0].z * (1 - s) * (1 - t) + ring[1].z * s * (1 - t) + ring[2].z * s * t + ring[3].z * (1 - s) * t,
  });
  const posts = [];
  for (const support of supports) {
    if (![support?.u, support?.v].every(finite) || support.u < .1 || support.u > .9 || support.v < .1 || support.v > .9) return fail('invalid-support');
    const center = pointAt(support.u, support.v), half = supportWidth / 2;
    const footprint = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
      x: center.x + u.x * a * half + v.x * b * half,
      z: center.z + u.z * a * half + v.z * b * half,
    }));
    if (!footprint.every(inside) || posts.some(post => distance(post.center, center) < supportWidth + .5)) return fail('unsafe-support-footprint');
    posts.push({ center, footprint, u: support.u, v: support.v });
  }
  const groundSamples = [], cache = new Map();
  const sample = p => {
    const key = `${p.x}:${p.z}`;
    if (cache.has(key)) return cache.get(key);
    let value;
    try { const hit = groundHeightAt(p.x, p.z); value = finite(hit) ? hit : hit?.height; }
    catch { value = NaN; }
    cache.set(key, value); groundSamples.push({ x: p.x, z: p.z, height: value }); return value;
  };
  for (const p of [...ring, pointAt(.5, .5), ...posts.flatMap(post => [post.center, ...post.footprint])]) sample(p);
  if (groundSamples.some(p => !finite(p.height))) return fail('ground-not-ready');
  const heights = groundSamples.map(p => p.height), minimum = Math.min(...heights), foundationTop = Math.max(...heights);
  if (foundationTop - minimum > 1.2) return fail('unsafe-ground-grade');
  for (const a of groundSamples) for (const b of groundSamples) {
    const span = distance(a, b);
    if (span > .1 && Math.abs(a.height - b.height) > .15 + span * .12) return fail('discontinuous-ground');
  }
  const undersideY = foundationTop + clearance, roofTop = undersideY + fascia;
  const surfaces = emptySurfaces(definition);
  function triangle(family, a, b, c, normal) {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const dot = (ab.y * ac.z - ab.z * ac.y) * normal.x + (ab.z * ac.x - ab.x * ac.z) * normal.y + (ab.x * ac.y - ab.y * ac.x) * normal.z;
    for (const p of dot < 0 ? [a, c, b] : [a, b, c]) surfaces[family].positions.push(p.x, p.y, p.z);
  }
  function quad(family, a, b, c, d, normal) { triangle(family, a, b, c, normal); triangle(family, a, c, d, normal); }
  const xyz = (p, y) => ({ x: p.x, y, z: p.z });
  quad('roof', ...ring.map(p => xyz(p, roofTop)), { x: 0, y: 1, z: 0 });
  quad('underside', ...ring.map(p => xyz(p, undersideY)), { x: 0, y: -1, z: 0 });
  const centroid = pointAt(.5, .5);
  for (let edge = 0; edge < 4; edge++) {
    const a = ring[edge], b = ring[(edge + 1) % 4], midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    let normal = { x: -(b.z - a.z), y: 0, z: b.x - a.x };
    if ((midpoint.x - centroid.x) * normal.x + (midpoint.z - centroid.z) * normal.z < 0) normal = { x: -normal.x, y: 0, z: -normal.z };
    const hasBlue = definition.blueEdgeIndices.includes(edge), bandTop = undersideY + (hasBlue ? blueHeight : 0);
    if (hasBlue) quad('blue', xyz(a, undersideY), xyz(b, undersideY), xyz(b, bandTop), xyz(a, bandTop), normal);
    quad(definition.fasciaFamilies[edge], xyz(a, bandTop), xyz(b, bandTop), xyz(b, roofTop), xyz(a, roofTop), normal);
  }
  for (const post of posts) {
    post.bottomHeights = post.footprint.map(sample); post.top = undersideY;
    for (let edge = 0; edge < 4; edge++) {
      const a = post.footprint[edge], b = post.footprint[(edge + 1) % 4];
      const normal = { x: (a.x + b.x) / 2 - post.center.x, y: 0, z: (a.z + b.z) / 2 - post.center.z };
      quad('pale', xyz(a, post.bottomHeights[edge]), xyz(b, post.bottomHeights[(edge + 1) % 4]), xyz(b, undersideY), xyz(a, undersideY), normal);
    }
  }
  const positions = familyNames.flatMap(family => surfaces[family].positions), triangleCount = positions.length / 9;
  if (triangleCount > maxTriangles || !positions.every(finite)) return fail('triangle-budget-or-nonfinite-output');
  return { valid: true, reason: null, sourceId, surfaces, footprint: ring.map(p => ({ ...p })),
    foundationTop, undersideY, roofTop, posts, groundSamples, triangleCount,
    signProfile: { ...definition.signProfile, detailHeightMetres: clearance + fascia,
      signHeightMetres: clearance + fascia / 2 - .025 },
    diagnostics: { supportCount: posts.length, areaSquareMetres: area, minimumClearanceMetres: clearance,
      estimatedDimensions: true, geometryQualityIndependent: true, groundContactOwnedByCaller: true },
  };
}
