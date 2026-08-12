/*
  PETERBOROUGH LANDMARK REGISTRY + PROCEDURAL MODELS

  This module intentionally keeps the landmark registry separate from the
  renderer. Every anchor records the OSM feature(s) used for placement, so a
  map-data refresh can be audited without hunting through scene code. The
  meshes are lightweight, stylized massing models: the base OSM renderer keeps
  the true footprint layer, while these models add the silhouettes and facade
  cues that make well-known places recognizable from street and aerial views.

  Source snapshot: prepared OSM extract, 2026-06-12. Custom models do not copy
  Google imagery or Street View. Those sources can be used for manual QA only.
*/

export const LANDMARKS = Object.freeze([
  { id: 'downtown', name: 'Downtown Peterborough', category: 'District', lat: 44.30906, lon: -78.31984, altitude: 185, osmRefs: ['way/1005970246'] },
  { id: 'city-hall', name: 'Peterborough City Hall', category: 'Civic landmark', lat: 44.30906, lon: -78.31984, altitude: 150, osmRefs: ['way/1005970246'], model: 'cityHall', headingDeg: 0 },
  { id: 'market-hall', name: 'Peterborough Market Hall', category: 'Downtown heritage landmark', lat: 44.30372, lon: -78.31966, altitude: 145, osmRefs: ['way/995885331'], model: 'marketHall', headingDeg: 0 },
  // Source-footprint centroid of OSM way/77774650. The former entrance-style
  // point sat about 60 m northeast of the building and left the broad roof
  // detail suspended over the neighbouring block.
  { id: 'peterborough-square', name: 'Peterborough Square', category: 'Downtown shopping district', lat: 44.3041876, lon: -78.3193510, altitude: 145, osmRefs: ['way/77774650'], model: 'peterboroughSquare', headingDeg: 90 },
  { id: 'public-library', name: 'Peterborough Public Library', category: 'Civic landmark', lat: 44.30400, lon: -78.32378, altitude: 145, osmRefs: ['way/1006217221'], model: 'library', headingDeg: 0 },
  { id: 'lift-lock', name: 'Peterborough Lift Lock', category: 'National Historic Site', lat: 44.307889, lon: -78.300583, altitude: 145, osmRefs: ['way/1302044106', 'way/1302044107', 'way/177176463'], model: 'liftLock', headingDeg: 0 },
  { id: 'ashburnham-bridge', name: 'Ashburnham Bridge (Hunter Street)', category: 'Bridge / East City', lat: 44.305884, lon: -78.314833, altitude: 135, osmRefs: ['way/33954231', 'way/177049271'], model: 'ashburnhamBridge', headingDeg: 90 },
  { id: 'quaker-oats', name: 'Quaker Oats', category: 'Industrial landmark', lat: 44.307157, lon: -78.315293, altitude: 170, osmRefs: ['way/764450189', 'way/1031894168', 'way/1031894169', 'way/1031894170', 'way/1031894171', 'way/1031894172'], model: 'quakerOats', headingDeg: 0 },
  { id: 'showplace', name: 'Showplace Performance Centre', category: 'Performing arts / Downtown', lat: 44.3025439, lon: -78.3194774, altitude: 145, osmRefs: ['way/1009651261', 'node/7855584464'], model: 'showplace', bearingDeg: 86.7 },
  { id: 'cathedral', name: 'Cathedral of Saint Peter-in-Chains', category: 'Gothic Revival landmark', lat: 44.3056281, lon: -78.3275624, altitude: 165, osmRefs: ['way/77774064'], model: 'cathedral', bearingDeg: 176.5 },
  { id: 'peterborough-museum', name: 'Peterborough Museum & Archives', category: 'Museum / Armour Hill', lat: 44.3095442, lon: -78.3030871, altitude: 145, osmRefs: ['way/77712993'], model: 'peterboroughMuseum', bearingDeg: 70.7 },
  { id: 'millennium-park', name: 'Millennium Park', category: 'Riverfront park', lat: 44.3029540, lon: -78.3171514, altitude: 130, osmRefs: ['way/77774132'] },
  { id: 'del-crary-park', name: 'Del Crary Park', category: 'Waterfront park', lat: 44.2954357, lon: -78.3179812, altitude: 130, osmRefs: ['way/490565928'] },
  { id: 'little-lake', name: 'Little Lake', category: 'Waterfront', lat: 44.2979566, lon: -78.3101906, altitude: 175, osmRefs: ['node/953147602'] },
  { id: 'canoe-museum', name: 'Canadian Canoe Museum', category: 'National museum / Little Lake', lat: 44.2980688, lon: -78.3018158, altitude: 155, osmRefs: ['way/1375439338'], model: 'canoeMuseum', bearingDeg: 161.6 },
  { id: 'art-gallery', name: 'Art Gallery of Peterborough', category: 'Gallery / Little Lake', lat: 44.2945350, lon: -78.3177137, altitude: 135, osmRefs: ['way/77774586'], model: 'artGallery', bearingDeg: 176.7 },
  { id: 'centennial-fountain', name: 'Peterborough Centennial Fountain', category: 'Little Lake landmark', lat: 44.29564, lon: -78.31309, altitude: 160, osmRefs: ['node/4826208549'], model: 'centennialFountain', headingDeg: 0 },
  { id: 'beavermead-park', name: 'Beavermead Park', category: 'Waterfront park', lat: 44.2941181, lon: -78.3028056, altitude: 145, osmRefs: ['way/77713396'] },
  { id: 'holiday-inn-waterfront', name: 'Holiday Inn Peterborough Waterfront & Marina', category: 'Hotel / Marina', lat: 44.2980720, lon: -78.3189701, altitude: 145, osmRefs: ['way/77772916'] },
  { id: 'memorial-centre', name: 'Peterborough Memorial Centre', category: 'Arena', lat: 44.288573, lon: -78.315683, altitude: 145, osmRefs: ['way/77774252'], model: 'memorialCentre', headingDeg: 0 },
  { id: 'healthy-planet-arena', name: 'Healthy Planet Arena', category: 'Twin-pad arena', lat: 44.2872868, lon: -78.3324154, altitude: 150, osmRefs: ['way/319173845'], model: 'healthyPlanetArena', bearingDeg: 43.9 },
  { id: 'lansdowne-place', name: 'Lansdowne Place', category: 'Shopping district', lat: 44.282903, lon: -78.331971, altitude: 170, osmRefs: ['way/77772361'], model: 'lansdownePlace', headingDeg: 0 },
  { id: 'walmart-chemong', name: 'Walmart Supercentre - Chemong Road', category: 'Chemong shopping district', lat: 44.3246242, lon: -78.3331749, altitude: 145, osmRefs: ['way/176908280'] },
  { id: 'prhc', name: 'Peterborough Regional Health Centre', category: 'Hospital', lat: 44.299933, lon: -78.347263, altitude: 180, osmRefs: ['relation/3367879'], model: 'prhc', headingDeg: 0 },
  { id: 'riverview-zoo', name: 'Riverview Park & Zoo', category: 'Park / Zoo', lat: 44.3428859, lon: -78.3094060, altitude: 180, osmRefs: ['way/77717245'] },
  { id: 'pagoda-bridge', name: 'Jackson Park Pagoda Bridge', category: 'Covered pedestrian bridge', lat: 44.3122216, lon: -78.3384232, altitude: 130, osmRefs: ['way/746752002'], model: 'pagodaBridge', bearingDeg: 96 },
  { id: 'trent', name: 'Trent University — Bata Library', category: 'University', lat: 44.357249, lon: -78.290394, altitude: 175, osmRefs: ['way/294800007'], model: 'trentBata', headingDeg: 0 },
  { id: 'fleming', name: 'Fleming College — Sutherland Campus', category: 'College', lat: 44.2664, lon: -78.3737, altitude: 175, osmRefs: ['way/856589079', 'relation/11731197', 'way/77714560', 'way/856589080'], model: 'fleming', headingDeg: 0 },
]);

// Audited landmark base heights are applied to the exact OSM footprint by the
// city renderer. They keep additive roofs and facade pieces aligned without
// replacing an irregular source polygon with a loose rectangular mass.
export const LANDMARK_BUILDING_HEIGHT_OVERRIDES = Object.freeze({
  'way/995885331': 27,
  'way/1006217221': 9,
  'way/77772361': 12.2,
  'way/1375439338': 8.1,
  'way/1009651261': 8.5,
});

function createMaterials(THREE) {
  const make = (color, options = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0,
    ...(options.transparent !== undefined ? { transparent: options.transparent } : {}),
    ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
    ...(options.side !== undefined ? { side: options.side } : {}),
    ...(options.depthWrite !== undefined ? { depthWrite: options.depthWrite } : {}),
  });
  return {
    concrete: make(0xa5a7a1, { roughness: 0.83 }),
    paleConcrete: make(0xc5c7be, { roughness: 0.72 }),
    darkConcrete: make(0x56605d, { roughness: 0.77 }),
    brick: make(0x8e5141, { roughness: 0.9 }),
    redBrick: make(0x9b4a3a, { roughness: 0.88 }),
    weatheringSteel: make(0x9b4f2f, { roughness: 0.74, metalness: 0.22 }),
    limestone: make(0xaaa28c, { roughness: 0.94 }),
    timber: make(0x956a42, { roughness: 0.86 }),
    green: make(0x3f8454, { roughness: 0.6 }),
    black: make(0x202827, { roughness: 0.5, metalness: 0.18 }),
    stainedGlass: make(0x355f72, { roughness: 0.14, metalness: 0.09 }),
    whiteMetal: make(0xb8c2be, { roughness: 0.38, metalness: 0.28 }),
    charcoalMetal: make(0x3b4949, { roughness: 0.4, metalness: 0.34 }),
    glass: make(0x3e7180, { roughness: 0.19, metalness: 0.12 }),
    paleGlass: make(0x89aeb1, { roughness: 0.22, metalness: 0.08 }),
    roof: make(0x394342, { roughness: 0.8 }),
    roofPale: make(0x929a93, { roughness: 0.57, metalness: 0.1 }),
    water: make(0x397b88, { roughness: 0.16, metalness: 0.06, transparent: true, opacity: 0.74, depthWrite: false }),
    rail: make(0x778382, { roughness: 0.34, metalness: 0.45 }),
    gold: make(0xbfa45d, { roughness: 0.52, metalness: 0.2 }),
    fountainWater: new THREE.MeshStandardMaterial({ color: 0xbceeff, emissive: 0x5ebbd9, emissiveIntensity: 0.42, roughness: 0.16, transparent: true, opacity: 0.68, depthWrite: false }),
  };
}

function coordinateOf(point, primary, fallback) {
  const value = Number(point?.[primary] ?? point?.[fallback]);
  return Number.isFinite(value) ? value : NaN;
}

function cleanPlacementRing(ring) {
  const points = (ring || [])
    .map((point) => ({ x: coordinateOf(point, 'x', 0), z: coordinateOf(point, 'z', 'y') }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (points.length > 1) {
    const first = points[0];
    const last = points.at(-1);
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.01) points.pop();
  }
  return points.length >= 3 ? points : [];
}

function measuredRing(ring) {
  const points = cleanPlacementRing(ring);
  if (!points.length) return null;
  let twiceArea = 0;
  let centroidX = 0;
  let centroidZ = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const cross = points[index].x * points[next].z - points[next].x * points[index].z;
    twiceArea += cross;
    centroidX += (points[index].x + points[next].x) * cross;
    centroidZ += (points[index].z + points[next].z) * cross;
  }
  const area = Math.abs(twiceArea) / 2;
  if (!Number.isFinite(area) || area < 0.25 || Math.abs(twiceArea) < 0.5) return null;
  return {
    points,
    area,
    centroid: {
      x: centroidX / (3 * twiceArea),
      z: centroidZ / (3 * twiceArea),
    },
  };
}

function pointInPlacementRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const crosses = (a.z > point.z) !== (b.z > point.z);
    if (!crosses) continue;
    const intersectionX = (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || Number.EPSILON) + a.x;
    if (point.x < intersectionX) inside = !inside;
  }
  return inside;
}

/**
 * Capture the same surveyed foundation datum used by the batched OSM building.
 * Keeping this as plain data lets landmark detail models align to refreshed map
 * footprints without importing Three.js or duplicating terrain calculations.
 */
export function createBuildingFootprintPlacement(featureId, rings, foundationTop) {
  const measured = measuredRing(rings?.[0]);
  if (!measured || !Number.isFinite(Number(foundationTop))) return null;
  const holes = (rings || []).slice(1).map(cleanPlacementRing).filter((ring) => ring.length >= 3);
  return {
    featureId: String(featureId || ''),
    outer: measured.points,
    holes,
    area: measured.area,
    centroid: measured.centroid,
    foundationTop: Number(foundationTop),
  };
}

/**
 * Resolve a model root against its referenced OSM building. Authored points
 * that are still inside the current footprint remain untouched. Stale points
 * outside the footprint snap to its measured centroid, preventing a future map
 * refresh from creating detached roofs or facades. In both cases the root uses
 * the exact flat foundation elevation chosen by the building renderer.
 */
export function resolveLandmarkRootPlacement(landmark, authoredPoint, placementsByRef) {
  const authored = {
    x: coordinateOf(authoredPoint, 'x', 0),
    z: coordinateOf(authoredPoint, 'z', 'y'),
  };
  if (!Number.isFinite(authored.x) || !Number.isFinite(authored.z)) return null;
  const candidates = (landmark?.osmRefs || [])
    .flatMap((reference) => placementsByRef?.get?.(reference) || [])
    .filter((placement) => placement?.outer?.length >= 3 && Number.isFinite(placement.foundationTop));
  if (!candidates.length) return { ...authored, y: null, featureId: '', sourceAligned: false, snapped: false };

  const contains = (placement) => pointInPlacementRing(authored, placement.outer)
    && !placement.holes.some((hole) => pointInPlacementRing(authored, hole));
  const containing = candidates.filter(contains).sort((a, b) => b.area - a.area)[0];
  const selected = containing || candidates.slice().sort((a, b) => b.area - a.area)[0];
  const snapped = !containing;
  return {
    x: snapped ? selected.centroid.x : authored.x,
    z: snapped ? selected.centroid.z : authored.z,
    y: selected.foundationTop,
    featureId: selected.featureId,
    sourceAligned: true,
    snapped,
  };
}

function makeRoot(context, landmark, counter) {
  const point = context.project(landmark.lat, landmark.lon);
  const placement = resolveLandmarkRootPlacement(landmark, point, context.landmarkBuildingPlacements);
  const root = new context.THREE.Group();
  root.name = landmark.name;
  const rootX = placement?.x ?? point.x;
  const rootZ = placement?.z ?? point.y;
  const rootY = Number.isFinite(placement?.y)
    ? placement.y
    : context.terrainHeightAtWorld(rootX, rootZ);
  root.position.set(rootX, rootY, rootZ);
  // Projected world +Z points south. Newer entries retain their audited map
  // bearing explicitly; this conversion aligns the model's local +Z long axis
  // with that clockwise-from-north bearing. Legacy headingDeg entries retain
  // their original authored rotation unchanged.
  const headingDeg = Number.isFinite(landmark.headingDeg)
    ? landmark.headingDeg
    : 180 - (landmark.bearingDeg || 0);
  root.rotation.y = context.THREE.MathUtils.degToRad(headingDeg);
  root.userData = {
    type: 'landmark',
    landmarkId: landmark.id,
    osmRefs: landmark.osmRefs,
    sourceFeatureId: placement?.featureId || '',
    sourceAligned: placement?.sourceAligned === true,
    snappedToFootprint: placement?.snapped === true,
  };
  context.group.add(root);
  counter.roots += 1;
  return root;
}

function addBox(context, root, counter, options) {
  const mesh = new context.THREE.Mesh(
    new context.THREE.BoxGeometry(options.width, options.height, options.depth),
    options.material,
  );
  mesh.position.set(options.x || 0, (options.y || 0) + options.height / 2, options.z || 0);
  mesh.rotation.y = options.yaw || 0;
  mesh.userData = { type: 'landmark-detail', landmarkId: root.userData.landmarkId };
  root.add(mesh);
  counter.objects += 1;
  return mesh;
}

function addCylinder(context, root, counter, options) {
  const mesh = new context.THREE.Mesh(
    new context.THREE.CylinderGeometry(options.radiusTop, options.radiusBottom, options.height, options.segments || 10),
    options.material,
  );
  mesh.position.set(options.x || 0, (options.y || 0) + options.height / 2, options.z || 0);
  mesh.rotation.set(options.pitch || 0, options.yaw || 0, options.roll || 0);
  mesh.userData = { type: 'landmark-detail', landmarkId: root.userData.landmarkId };
  root.add(mesh);
  counter.objects += 1;
  return mesh;
}

function addFacadeRhythm(context, root, counter, options) {
  const step = options.span / options.count;
  for (let index = 0; index < options.count; index += 1) {
    const offset = -options.span / 2 + step * (index + 0.5);
    addBox(context, root, counter, {
      material: options.material,
      width: options.vertical ? options.thickness : step * 0.64,
      height: options.height,
      depth: options.vertical ? step * 0.64 : options.thickness,
      x: (options.x || 0) + (options.vertical ? 0 : offset),
      z: (options.z || 0) + (options.vertical ? offset : 0),
      y: options.y || 0,
    });
  }
}

function addGableRoof(context, root, counter, options) {
  const width = options.width;
  const depth = options.depth;
  const ridgeX = options.ridgeX || 0;
  const height = options.height;
  const vertices = new Float32Array([
    -width / 2, 0, -depth / 2,
    width / 2, 0, -depth / 2,
    ridgeX, height, -depth / 2,
    -width / 2, 0, depth / 2,
    width / 2, 0, depth / 2,
    ridgeX, height, depth / 2,
  ]);
  const geometry = new context.THREE.BufferGeometry();
  geometry.setAttribute('position', new context.THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 2, 1, 3, 4, 5,
    0, 3, 5, 0, 5, 2,
    2, 5, 4, 2, 4, 1,
    0, 1, 4, 0, 4, 3,
  ]);
  geometry.computeVertexNormals();
  const mesh = new context.THREE.Mesh(geometry, options.material);
  mesh.position.set(options.x || 0, options.y || 0, options.z || 0);
  mesh.rotation.y = options.yaw || 0;
  mesh.userData = { type: 'landmark-detail', landmarkId: root.userData.landmarkId };
  root.add(mesh);
  counter.objects += 1;
  return mesh;
}

function addSign(context, root, counter, options) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const draw = canvas.getContext('2d');
  if (!draw) return null;
  draw.fillStyle = options.background || '#202827';
  draw.fillRect(0, 0, canvas.width, canvas.height);
  draw.strokeStyle = options.border || 'rgba(255,255,255,.7)';
  draw.lineWidth = 13;
  draw.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  const lines = String(options.text || '').split('\n');
  let fontSize = options.fontSize || (lines.length > 1 ? 70 : 96);
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.font = `700 ${fontSize}px system-ui, sans-serif`;
  const widest = Math.max(...lines.map((line) => draw.measureText(line).width));
  if (widest > canvas.width - 92) {
    fontSize *= (canvas.width - 92) / widest;
    draw.font = `700 ${fontSize}px system-ui, sans-serif`;
  }
  draw.fillStyle = options.color || '#f4f1e8';
  const lineHeight = fontSize * 1.03;
  const firstY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => draw.fillText(line, canvas.width / 2, firstY + index * lineHeight));

  const texture = new context.THREE.CanvasTexture(canvas);
  if (context.THREE.SRGBColorSpace) texture.colorSpace = context.THREE.SRGBColorSpace;
  texture.minFilter = context.THREE.LinearFilter;
  const material = new context.THREE.MeshBasicMaterial({ map: texture, side: context.THREE.DoubleSide, toneMapped: false });
  const mesh = new context.THREE.Mesh(new context.THREE.PlaneGeometry(options.width, options.height), material);
  mesh.position.set(options.x || 0, options.y || 0, options.z || 0);
  mesh.rotation.y = options.yaw || 0;
  mesh.userData = { type: 'landmark-detail', landmarkId: root.userData.landmarkId };
  root.add(mesh);
  counter.objects += 1;
  return mesh;
}

function liftLock(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Lock 21 has two 42.4 m × 9.7 m chambers and a 19.8 m lift. The water,
  // caissons, gates, and upper crosswalk make its unique silhouette legible.
  addBox(context, root, counter, { material: materials.water, width: 34, height: 0.42, depth: 91, y: 0.22 });
  [-10.5, 10.5].forEach((x) => {
    addBox(context, root, counter, { material: materials.paleConcrete, width: 11.8, height: 19.8, depth: 42.4, x, y: 0.25 });
    addBox(context, root, counter, { material: materials.water, width: 8.3, height: 0.32, depth: 39.5, x, y: 20.1 });
    [-22.5, 22.5].forEach((z) => addBox(context, root, counter, { material: materials.charcoalMetal, width: 12.2, height: 2.1, depth: 1.15, x, z, y: 18.8 }));
  });
  [-20, 20].forEach((z) => {
    addBox(context, root, counter, { material: materials.concrete, width: 38, height: 2.3, depth: 4.5, z, y: 20.2 });
    [-16, 16].forEach((x) => addCylinder(context, root, counter, { material: materials.rail, radiusTop: 0.28, radiusBottom: 0.38, height: 12.5, x, z, y: 20.8, segments: 8 }));
  });
  return root;
}

function ashburnhamBridge(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Local Z is rotated E–W by the registry heading. The OSM source keeps the
  // actual bridge alignment; these elements add deck, rails and river piers.
  // The core renderer supplies the single source-aligned graded deck and rails;
  // this landmark layer adds only the river piers.
  [-105, -38, 36, 103].forEach((z) => {
    addCylinder(context, root, counter, { material: materials.concrete, radiusTop: 1.45, radiusBottom: 2.1, height: 8.2, z, y: 0, segments: 8 });
    addBox(context, root, counter, { material: materials.concrete, width: 5.2, height: 0.8, depth: 4.5, z, y: 7.7 });
  });
  return root;
}

function quakerOats(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Actual primary OSM footprint reports 218 m × 125 m, 71 m / 14 levels.
  addBox(context, root, counter, { material: materials.whiteMetal, width: 125, height: 24, depth: 218, y: 0 });
  addBox(context, root, counter, { material: materials.roofPale, width: 120, height: 1.2, depth: 213, y: 24 });
  addBox(context, root, counter, { material: materials.paleConcrete, width: 42, height: 71, depth: 58, x: -25, z: -24, y: 0 });
  addBox(context, root, counter, { material: materials.roofPale, width: 40, height: 1.2, depth: 56, x: -25, z: -24, y: 71 });
  [-43, -27, -11, 5].forEach((z, index) => addBox(context, root, counter, { material: materials.whiteMetal, width: 12, height: 38 + index * 3, depth: 13, x: 54, z, y: 0 }));
  addFacadeRhythm(context, root, counter, { material: materials.paleGlass, span: 108, count: 12, height: 3.6, thickness: 0.22, z: -109.2, y: 7.4 });
  return root;
}

function memorialCentre(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // 119 m × 82 m, three levels. The exact OSM footprint supplies the arena
  // bowl; the real building reads as a low, boxy corrugated-metal venue from
  // George Street, not a dome. Keep the roof tight to the mapped wall datum.
  addBox(context, root, counter, { material: materials.roofPale, width: 116, height: 0.85, depth: 79, y: 9.35 });
  addBox(context, root, counter, { material: materials.whiteMetal, width: 112, height: 2.8, depth: 76, y: 6.55 });
  addBox(context, root, counter, { material: materials.glass, width: 54, height: 8.8, depth: 2.2, z: -42.1, y: 1.2 });
  addBox(context, root, counter, { material: materials.brick, width: 24, height: 4.1, depth: 6.2, z: -44, y: 0 });
  return root;
}

function lansdownePlace(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // The true irregular 455 m × 315 m mall footprint remains in the OSM layer.
  // These restrained entrance/skylight pieces make the one-storey retail mass read.
  addBox(context, root, counter, { material: materials.roofPale, width: 210, height: 1.2, depth: 26, y: 12.2 });
  addBox(context, root, counter, { material: materials.paleGlass, width: 64, height: 6.8, depth: 5.4, z: -92, y: 0 });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 70, height: 0.8, depth: 10, z: -96, y: 6.6 });
  [-72, -24, 24, 72].forEach((x) => addBox(context, root, counter, { material: materials.paleGlass, width: 18, height: 1.1, depth: 20, x, y: 12.9 }));
  return root;
}

function prhc(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // The relation geometry supplies the exact five-level multi-wing hospital
  // plan. Layered clinical wings and a glazed entry make it distinguishable.
  // The five-level OSM relation supplies the base mass. Only the taller wing
  // continues above that source height.
  addBox(context, root, counter, { material: materials.paleConcrete, width: 48, height: 8.3, depth: 112, x: 30, z: 25, y: 15.7 });
  addBox(context, root, counter, { material: materials.glass, width: 46, height: 8.4, depth: 3.4, z: -25, y: 0 });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 54, height: 0.85, depth: 11, z: -28, y: 7.8 });
  addFacadeRhythm(context, root, counter, { material: materials.paleGlass, span: 116, count: 13, height: 4.1, thickness: 0.22, z: -23.2, y: 9.2 });
  return root;
}

function trentBata(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Bata Library: OSM 82 m × 70 m, four storeys, concrete/light-grey roof.
  // The exact four-level OSM footprint supplies the concrete base.
  addBox(context, root, counter, { material: materials.roofPale, width: 78, height: 1, depth: 66, y: 12.6 });
  addBox(context, root, counter, { material: materials.paleGlass, width: 42, height: 8, depth: 1.8, z: -35.9, y: 2.8 });
  [-28, -12, 4, 20, 36].forEach((x) => addBox(context, root, counter, { material: materials.darkConcrete, width: 2.1, height: 16, depth: 74, x, y: 0 }));
  return root;
}

function fleming(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Sutherland A–D are a low connected two-level campus cluster.
  // Buildings A-D retain their individual surveyed OSM footprints below.
  addBox(context, root, counter, { material: materials.paleGlass, width: 32, height: 5.8, depth: 3, x: -18, z: -4, y: 0 });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 40, height: 0.8, depth: 8, x: -18, z: -7, y: 5.2 });
  return root;
}

function cityHall(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // OSM supplies the exact footprint and measured 18 m height.
  addBox(context, root, counter, { material: materials.glass, width: 29, height: 8.5, depth: 1.6, z: -21.5, y: 1.8 });
  addBox(context, root, counter, { material: materials.roofPale, width: 54, height: 0.9, depth: 38, y: 18 });
  [-16, 0, 16].forEach((x) => addCylinder(context, root, counter, { material: materials.rail, radiusTop: 0.08, radiusBottom: 0.1, height: 15, x, z: -28, y: 0, segments: 6 }));
  return root;
}

function marketHall(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // 42 m × 21 m, 36 m tall: a compact red-brick vertical focal point.
  // OSM supplies the exact brick footprint, measured height, and roof shape.
  // Do not place a second pale rectangle across that irregular mapped roof.
  addBox(context, root, counter, { material: materials.redBrick, width: 13, height: 8, depth: 11, y: 28 });
  addCylinder(context, root, counter, { material: materials.roofPale, radiusTop: 2.2, radiusBottom: 5.4, height: 3.4, y: 36, segments: 8 });
  addFacadeRhythm(context, root, counter, { material: materials.paleGlass, span: 32, count: 5, height: 4.3, thickness: 0.3, z: -10.7, y: 11.5 });
  return root;
}

function library(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  addBox(context, root, counter, { material: materials.concrete, width: 49, height: 9, depth: 66, y: 0 });
  addBox(context, root, counter, { material: materials.roofPale, width: 46, height: 0.8, depth: 62, y: 9 });
  addBox(context, root, counter, { material: materials.paleGlass, width: 27, height: 6.5, depth: 1.8, z: -33.9, y: 0.9 });
  return root;
}

function peterboroughSquare(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // The authoritative OSM building already supplies the irregular stepped roof.
  // Do not cover it with a rectangular authored slab: that old 106 x 68 m cap
  // projected well beyond the footprint and appeared to float over Water Street.
  // This landmark layer now adds only the George Street glazed entrance.
  addBox(context, root, counter, { material: materials.glass, width: 46, height: 7.2, depth: 1.8, z: -36.9, y: 3.2 });
  return root;
}

function canoeMuseum(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // The exact 2024 waterfront footprint stays in the OSM building layer. The
  // authored pieces reproduce its long asymmetric ridge, weathering-steel road
  // facade, diagonal glass cut and double-height south entrance.
  addGableRoof(context, root, counter, {
    material: materials.weatheringSteel,
    width: 51.5,
    depth: 100,
    height: 6.2,
    ridgeX: -5.2,
    y: 8.1,
  });
  [-25.9, 25.9].forEach((x) => addBox(context, root, counter, {
    material: materials.weatheringSteel,
    width: 0.34,
    height: 8.15,
    depth: 84,
    x,
    z: -4,
  }));
  addBox(context, root, counter, { material: materials.glass, width: 0.38, height: 7.1, depth: 18, x: -26.15, z: 27, y: 0.7 });
  addBox(context, root, counter, { material: materials.glass, width: 18.5, height: 7.5, depth: 0.38, z: 50.25, y: 0.35 });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 22, height: 0.48, depth: 5.2, z: 52.2, y: 7.55 });
  [-8.2, -2.7, 2.7, 8.2].forEach((x) => addBox(context, root, counter, {
    material: materials.timber,
    width: 0.5,
    height: 7.2,
    depth: 0.55,
    x,
    z: 50.55,
    y: 0.45,
  }));
  addSign(context, root, counter, {
    text: 'THE CANADIAN\nCANOE MUSEUM',
    background: '#984d2e',
    border: '#d7c7a4',
    color: '#fff8e9',
    width: 18,
    height: 4.5,
    x: -26.38,
    y: 4.8,
    z: -5,
    yaw: -Math.PI / 2,
  });
  return root;
}

function showplace(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // A shallow street-wall treatment leaves the 42.6 m x 19.1 m OSM mass in
  // charge while restoring Showplace's vertical entry bay and projecting sign.
  addBox(context, root, counter, { material: materials.brick, width: 19.1, height: 10.2, depth: 0.38, z: 21.45 });
  addBox(context, root, counter, { material: materials.paleConcrete, width: 8.8, height: 14.2, depth: 0.62, z: 21.72 });
  addBox(context, root, counter, { material: materials.glass, width: 7.2, height: 4.2, depth: 0.22, z: 22.08, y: 0.25 });
  [-4.95, 4.95].forEach((x) => addBox(context, root, counter, {
    material: materials.darkConcrete,
    width: 0.72,
    height: 10.8,
    depth: 0.74,
    x,
    z: 21.78,
  }));
  addBox(context, root, counter, { material: materials.black, width: 14.6, height: 0.8, depth: 4.7, z: 23.7, y: 4.45 });
  addSign(context, root, counter, {
    text: 'SHOWPLACE',
    background: '#702d2d',
    border: '#d5b476',
    color: '#fff3d6',
    width: 13.3,
    height: 2.7,
    y: 6.5,
    z: 26.08,
  });
  addBox(context, root, counter, { material: materials.roofPale, width: 18.5, height: 0.55, depth: 41, y: 8.5 });
  return root;
}

function peterboroughMuseum(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Zeidler's compact Armour Hill museum reads as a low, strongly horizontal
  // composition. OSM supplies the plan; overhanging roof, monitor and facade
  // fins make it distinct from nearby institutional extrusions.
  addBox(context, root, counter, { material: materials.roof, width: 29.2, height: 0.62, depth: 31.5, y: 9.45 });
  addGableRoof(context, root, counter, { material: materials.roofPale, width: 14.5, depth: 21.5, height: 3.2, y: 10.05, z: -1.8 });
  addBox(context, root, counter, { material: materials.glass, width: 13.8, height: 4.2, depth: 0.26, z: 15.18, y: 1.0 });
  addBox(context, root, counter, { material: materials.paleConcrete, width: 18.5, height: 0.48, depth: 3.8, z: 16.55, y: 5.05 });
  [-12.4, -8.2, 8.2, 12.4].forEach((x) => addBox(context, root, counter, {
    material: materials.concrete,
    width: 0.72,
    height: 7.7,
    depth: 0.7,
    x,
    z: 15.25,
  }));
  addSign(context, root, counter, {
    text: 'PETERBOROUGH\nMUSEUM & ARCHIVES',
    background: '#4e5a57',
    width: 11.8,
    height: 3.1,
    y: 6.9,
    z: 15.55,
  });
  return root;
}

function artGallery(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Preserve the irregular lakeside footprint and add the gallery's low roof
  // datum, street-facing studio glazing and sheltered Crescent Street entry.
  addBox(context, root, counter, { material: materials.roofPale, width: 34.2, height: 0.58, depth: 44.3, y: 6.3 });
  addBox(context, root, counter, { material: materials.glass, width: 22.5, height: 3.9, depth: 0.24, z: -21.78, y: 1.0 });
  addBox(context, root, counter, { material: materials.redBrick, width: 7.2, height: 6.1, depth: 0.38, x: -11.7, z: -21.72 });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 26, height: 0.46, depth: 4.2, z: -23.5, y: 5.75 });
  addFacadeRhythm(context, root, counter, {
    material: materials.paleGlass,
    span: 29,
    count: 6,
    height: 3.3,
    thickness: 0.24,
    x: 16.58,
    y: 1.15,
    vertical: true,
  });
  addSign(context, root, counter, {
    text: 'ART GALLERY OF\nPETERBOROUGH',
    background: '#f0eee7',
    border: '#343b39',
    color: '#2f3735',
    width: 10.8,
    height: 2.8,
    x: 8,
    y: 4.8,
    z: -21.95,
    yaw: Math.PI,
  });
  return root;
}

function cathedral(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Saint Peter-in-Chains is defined by its squared-rubble cruciform body,
  // parapet gables, side buttresses, lancets and single 150-foot tower/spire.
  // Thin wall dressings extend the under-height OSM extrusion without replacing
  // its surveyed footprint.
  [-15.72, 15.72].forEach((x) => addBox(context, root, counter, {
    material: materials.limestone,
    width: 0.55,
    height: 11.1,
    depth: 40.5,
    x,
    z: -1.5,
  }));
  addBox(context, root, counter, { material: materials.limestone, width: 31.2, height: 11.1, depth: 0.55, z: 21.8 });
  addGableRoof(context, root, counter, { material: materials.roof, width: 31.1, depth: 43.5, height: 6.1, y: 11.05, z: -1.3 });
  addGableRoof(context, root, counter, { material: materials.roof, width: 18, depth: 37, height: 5.1, y: 11.05, z: -6.2, yaw: Math.PI / 2 });

  [-14.8, -6.8, 1.2, 9.2, 17.2].forEach((z) => {
    [-16.02, 16.02].forEach((x) => {
      addBox(context, root, counter, { material: materials.limestone, width: 1.15, height: 7.9, depth: 1.55, x, z });
      addBox(context, root, counter, { material: materials.stainedGlass, width: 0.24, height: 4.15, depth: 1.35, x: x + (x < 0 ? -0.64 : 0.64), z, y: 4.0 });
    });
  });

  addBox(context, root, counter, { material: materials.limestone, width: 10.2, height: 30, depth: 10.8, z: 20.2 });
  addBox(context, root, counter, { material: materials.timber, width: 4.4, height: 4.8, depth: 0.28, z: 25.72, y: 0.2 });
  addBox(context, root, counter, { material: materials.stainedGlass, width: 3.25, height: 7.2, depth: 0.25, z: 25.75, y: 12.2 });
  addCylinder(context, root, counter, {
    material: materials.stainedGlass,
    radiusTop: 1.48,
    radiusBottom: 1.48,
    height: 0.28,
    z: 25.88,
    y: 8.8,
    pitch: Math.PI / 2,
    segments: 16,
  });
  addCylinder(context, root, counter, {
    material: materials.charcoalMetal,
    radiusTop: 0.18,
    radiusBottom: 5.05,
    height: 15.2,
    z: 20.2,
    y: 30,
    segments: 8,
  });
  addCylinder(context, root, counter, { material: materials.gold, radiusTop: 0.13, radiusBottom: 0.13, height: 3.1, z: 20.2, y: 45.1, segments: 8 });
  addCylinder(context, root, counter, { material: materials.gold, radiusTop: 0.12, radiusBottom: 0.12, height: 2.0, z: 20.2, y: 46.25, roll: Math.PI / 2, segments: 8 });
  return root;
}

function healthyPlanetArena(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Two parallel roof ridges mirror the two regulation ice pads. The surveyed
  // 127.5 m x 73.3 m footprint remains the base and controls site placement.
  [-18.1, 18.1].forEach((x) => addGableRoof(context, root, counter, {
    material: materials.whiteMetal,
    width: 34.3,
    depth: 120.5,
    height: 5.4,
    x,
    y: 6.3,
  }));
  addBox(context, root, counter, { material: materials.paleConcrete, width: 43, height: 8.8, depth: 0.48, z: -63.8 });
  addBox(context, root, counter, { material: materials.paleGlass, width: 25.5, height: 6.25, depth: 0.26, z: -64.1, y: 0.4 });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 31, height: 0.55, depth: 5.4, z: -66.35, y: 6.45 });
  addBox(context, root, counter, { material: materials.green, width: 39, height: 2.4, depth: 0.24, z: -64.2, y: 7.0 });
  addSign(context, root, counter, {
    text: 'HEALTHY PLANET ARENA',
    background: '#377c4c',
    border: '#e4f1e5',
    color: '#ffffff',
    width: 27,
    height: 2.5,
    y: 8.2,
    z: -64.36,
    yaw: Math.PI,
  });
  addBox(context, root, counter, { material: materials.charcoalMetal, width: 1.1, height: 1.0, depth: 121.5, y: 11.65 });
  return root;
}

function centennialFountain(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // Peterborough's 1967 landmark rises roughly 76 m from Little Lake. A tall,
  // tapered translucent plume and ring of secondary jets keep that defining
  // skyline cue readable without a costly particle simulation.
  addCylinder(context, root, counter, { material: materials.darkConcrete, radiusTop: 3.8, radiusBottom: 4.4, height: 0.7, y: -0.28, segments: 16 });
  addCylinder(context, root, counter, { material: materials.fountainWater, radiusTop: 0.2, radiusBottom: 2.1, height: 76, y: 0.2, segments: 12 });
  addCylinder(context, root, counter, { material: materials.fountainWater, radiusTop: 4.8, radiusBottom: 0.55, height: 8.5, y: 69.5, segments: 12 });
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    addCylinder(context, root, counter, {
      material: materials.fountainWater,
      radiusTop: 0.12,
      radiusBottom: 0.3,
      height: 8 + (index % 2) * 2.5,
      x: Math.cos(angle) * 3.1,
      z: Math.sin(angle) * 3.1,
      y: 0.1,
      segments: 6,
    });
  }
  root.userData.animatedWater = true;
  return root;
}

function pagodaBridge(context, landmark, materials, counter) {
  const root = makeRoot(context, landmark, counter);
  // The exact surveyed footway supplies the deck. Timber rails, close-set
  // posts and the small covered gable create Jackson Park's familiar crossing.
  [-1.62, 1.62].forEach((x) => {
    addBox(context, root, counter, { material: materials.timber, width: 0.16, height: 0.82, depth: 8.9, x, y: 0.18 });
    [-3.9, -1.3, 1.3, 3.9].forEach((z) => addBox(context, root, counter, { material: materials.timber, width: 0.24, height: 2.75, depth: 0.24, x, z, y: 0.12 }));
  });
  addGableRoof(context, root, counter, { material: materials.roof, width: 4.7, depth: 9.5, height: 1.55, y: 2.75 });
  addBox(context, root, counter, { material: materials.gold, width: 0.18, height: 0.18, depth: 10.1, y: 4.28 });
  return root;
}

const MODEL_BUILDERS = {
  liftLock,
  ashburnhamBridge,
  quakerOats,
  memorialCentre,
  lansdownePlace,
  prhc,
  trentBata,
  fleming,
  cityHall,
  marketHall,
  library,
  peterboroughSquare,
  canoeMuseum,
  showplace,
  peterboroughMuseum,
  artGallery,
  cathedral,
  healthyPlanetArena,
  centennialFountain,
  pagodaBridge,
};

export function createPeterboroughLandmarks({ THREE, group, project, terrainHeightAtWorld, landmarkBuildingPlacements = null }) {
  if (!THREE || !group || typeof project !== 'function' || typeof terrainHeightAtWorld !== 'function') return { objects: 0, roots: 0 };
  const context = { THREE, group, project, terrainHeightAtWorld, landmarkBuildingPlacements };
  const materials = createMaterials(THREE);
  const counter = { objects: 0, roots: 0 };
  LANDMARKS.forEach((landmark) => {
    if (!landmark.model || !MODEL_BUILDERS[landmark.model]) return;
    MODEL_BUILDERS[landmark.model](context, landmark, materials, counter);
  });
  return counter;
}
