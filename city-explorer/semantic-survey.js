/*
  Semantic survey layer for accuracy-first city reconstruction.

  Survey features are stored in geographic coordinates before any Three.js
  object exists. Points are appropriate for individual trees and street
  furniture; lines describe markings/curbs; polygons describe footprints and
  surface areas. The renderer is intentionally replaceable: geographic records
  remain stable even when the low-poly art is improved.
*/

export const SEMANTIC_SURVEY_SCHEMA_VERSION = 1;

export const SEMANTIC_POINT_TYPES = Object.freeze([
  'tree',
  'parked_vehicle',
  'streetlight',
  'sign',
  'hydrant',
  'landmark_anchor',
  'flagpole',
]);

const GEOMETRY_FOR_TYPE = Object.freeze({
  tree: 'Point',
  parked_vehicle: 'Point',
  streetlight: 'Point',
  sign: 'Point',
  hydrant: 'Point',
  landmark_anchor: 'Point',
  flagpole: 'Point',
  curb: 'LineString',
  fence: 'LineString',
  building_facade: 'LineString',
  lane_marking: 'LineString',
  parking_marking: 'LineString',
  building: 'Polygon',
  paved_area: 'Polygon',
  planting_area: 'Polygon',
});

function finiteCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function validCoordinates(geometry) {
  if (!geometry || typeof geometry.type !== 'string') return false;
  if (geometry.type === 'Point') return finiteCoordinate(geometry.coordinates);
  if (geometry.type === 'LineString') {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length >= 2
      && geometry.coordinates.every(finiteCoordinate);
  }
  if (geometry.type === 'Polygon') {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(finiteCoordinate));
  }
  return false;
}

function coordinatePairs(coordinates, output = []) {
  if (!Array.isArray(coordinates)) return output;
  if (finiteCoordinate(coordinates) && typeof coordinates[0] !== 'object') {
    output.push(coordinates);
    return output;
  }
  coordinates.forEach((entry) => coordinatePairs(entry, output));
  return output;
}

export function validateSemanticSurvey(collection) {
  const errors = [];
  if (collection?.type !== 'FeatureCollection') errors.push('Survey must be a GeoJSON FeatureCollection.');
  if (Number(collection?.metadata?.schema_version) !== SEMANTIC_SURVEY_SCHEMA_VERSION) {
    errors.push(`Survey schema_version must be ${SEMANTIC_SURVEY_SCHEMA_VERSION}.`);
  }
  if (!collection?.metadata?.source?.name || !collection?.metadata?.source?.licence) {
    errors.push('Survey metadata must record source name and licence.');
  }
  const overlay = collection?.metadata?.reference_overlay;
  if (overlay && overlay.developer_only !== true) errors.push('Reference imagery must be marked developer_only.');
  const bounds = overlay?.bounds;
  if (bounds && !(Number(bounds.west) < Number(bounds.east) && Number(bounds.south) < Number(bounds.north))) {
    errors.push('Reference imagery bounds are invalid.');
  }
  const ids = new Set();
  (collection?.features || []).forEach((feature, index) => {
    const id = String(feature?.id || feature?.properties?.id || '');
    const semanticType = String(feature?.properties?.semantic_type || '');
    if (!id) errors.push(`Feature ${index} is missing a stable id.`);
    else if (ids.has(id)) errors.push(`Duplicate feature id: ${id}.`);
    ids.add(id);
    if (!GEOMETRY_FOR_TYPE[semanticType]) errors.push(`Feature ${id || index} has unsupported semantic_type ${semanticType || '(empty)'}.`);
    if (GEOMETRY_FOR_TYPE[semanticType] && feature?.geometry?.type !== GEOMETRY_FOR_TYPE[semanticType]) {
      errors.push(`Feature ${id || index} must use ${GEOMETRY_FOR_TYPE[semanticType]} geometry.`);
    }
    if (!validCoordinates(feature?.geometry)) errors.push(`Feature ${id || index} has invalid coordinates.`);
    coordinatePairs(feature?.geometry?.coordinates).forEach((coordinate) => {
      const [lon, lat] = coordinate.map(Number);
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) errors.push(`Feature ${id || index} is outside valid WGS84 coordinates.`);
      if (bounds && (lon < Number(bounds.west) || lon > Number(bounds.east) || lat < Number(bounds.south) || lat > Number(bounds.north))) {
        errors.push(`Feature ${id || index} falls outside its calibrated reference bounds.`);
      }
    });
    if (!feature?.properties?.source_id) errors.push(`Feature ${id || index} is missing source_id.`);
    const confidence = Number(feature?.properties?.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      errors.push(`Feature ${id || index} confidence must be between 0 and 1.`);
    }
    if (!['verified', 'source-aligned', 'draft'].includes(feature?.properties?.review_status)) {
      errors.push(`Feature ${id || index} has an invalid review_status.`);
    }
  });
  return { valid: errors.length === 0, errors };
}

export function semanticSurveySummary(collection) {
  const byType = {};
  (collection?.features || []).forEach((feature) => {
    const type = String(feature?.properties?.semantic_type || 'unknown');
    byType[type] = (byType[type] || 0) + 1;
  });
  return {
    total: (collection?.features || []).length,
    byType,
    reviewed: (collection?.features || []).filter((feature) => feature?.properties?.review_status === 'verified').length,
    sourceAligned: (collection?.features || []).filter((feature) => feature?.properties?.review_status === 'source-aligned').length,
  };
}

export function createDraftPointFeature({ id, semanticType, lon, lat, sourceId = 'developer-draft' }) {
  if (!SEMANTIC_POINT_TYPES.includes(semanticType)) throw new Error(`Unsupported point type: ${semanticType}`);
  if (![lon, lat].every(Number.isFinite)) throw new Error('Draft point requires finite longitude and latitude.');
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id,
      semantic_type: semanticType,
      source_id: sourceId,
      confidence: 0.5,
      review_status: 'draft',
    },
  };
}

function standardMaterial(THREE, color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, ...options });
}

function addMesh(THREE, parent, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function buildTree(THREE, feature, x, y, z, materials, shared) {
  const root = new THREE.Group();
  const scale = Number(feature.properties?.scale) || 1;
  root.position.set(x, y, z);
  root.scale.setScalar(scale);
  root.userData = { type: 'semantic-tree', surveyFeatureId: feature.id };
  addMesh(THREE, root, shared.trunk, materials.trunk, 0, 2.5, 0);
  const crownMaterial = feature.properties?.palette === 'crimson' ? materials.crimson : materials.green;
  for (const [cx, cy, cz, crownScale] of [[0, 6.7, 0, 1], [-1.8, 6.25, 0.2, 0.72], [1.8, 6.35, -0.2, 0.76], [0.15, 8.15, 0, 0.68]]) {
    const crown = addMesh(THREE, root, shared.crown, crownMaterial, cx, cy, cz);
    crown.scale.setScalar(crownScale);
  }
  return root;
}

function buildParkedVehicle(THREE, feature, x, y, z, materials, shared) {
  const root = new THREE.Group();
  root.position.set(x, y + 0.1, z);
  root.rotation.y = -THREE.MathUtils.degToRad(Number(feature.properties?.heading_degrees) || 0);
  root.userData = { type: 'semantic-parked-vehicle', surveyFeatureId: feature.id };
  const colour = Number(feature.properties?.colour) || 0x59646a;
  const body = standardMaterial(THREE, colour, { roughness: 0.58, metalness: 0.12 });
  addMesh(THREE, root, shared.carBody, body, 0, 0.43, 0);
  addMesh(THREE, root, shared.carCabin, materials.glass, 0, 0.86, -0.12);
  return root;
}

function buildFlagpole(THREE, feature, x, y, z, materials) {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.userData = { type: 'semantic-flagpole', surveyFeatureId: feature.id };
  const height = Math.max(5, Number(feature.properties?.height_m) || 12.5);
  addMesh(THREE, root, new THREE.CylinderGeometry(0.07, 0.12, height, 8), materials.metal, 0, height / 2, 0);
  const flag = addMesh(
    THREE,
    root,
    new THREE.PlaneGeometry(2.35, 1.2),
    materials.flag,
    1.18,
    height - 0.9,
    0,
  );
  flag.userData = { type: 'semantic-canadian-flag' };
  return root;
}

function lineWorldPoints(feature, project, terrainHeightAtWorld, clearance = 0.08) {
  return feature.geometry.coordinates.map(([lon, lat]) => {
    const point = project(Number(lat), Number(lon));
    return { x: point.x, z: point.y, y: terrainHeightAtWorld(point.x, point.y) + clearance };
  });
}

function buildFence(THREE, feature, project, terrainHeightAtWorld, materials) {
  const root = new THREE.Group();
  root.userData = { type: 'semantic-fence', surveyFeatureId: feature.id };
  const points = lineWorldPoints(feature, project, terrainHeightAtWorld, 0.03);
  const height = Math.max(0.7, Number(feature.properties?.height_m) || 1.45);
  const postSpacing = 2.35;
  points.slice(1).forEach((end, index) => {
    const start = points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) return;
    const yaw = Math.atan2(dx, dz);
    const segment = addMesh(
      THREE,
      root,
      new THREE.BoxGeometry(0.075, 0.075, length),
      materials.fence,
      (start.x + end.x) / 2,
      (start.y + end.y) / 2 + height * 0.72,
      (start.z + end.z) / 2,
    );
    segment.rotation.y = yaw;
    const posts = Math.max(1, Math.ceil(length / postSpacing));
    for (let postIndex = 0; postIndex <= posts; postIndex += 1) {
      const t = postIndex / posts;
      const px = THREE.MathUtils.lerp(start.x, end.x, t);
      const pz = THREE.MathUtils.lerp(start.z, end.z, t);
      const py = terrainHeightAtWorld(px, pz);
      addMesh(THREE, root, new THREE.BoxGeometry(0.11, height, 0.11), materials.fence, px, py + height / 2, pz);
    }
  });
  return root;
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (((a.z > z) !== (b.z > z)) && (x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || Number.EPSILON) + a.x)) inside = !inside;
  }
  return inside;
}

function buildPlantingArea(THREE, feature, project, terrainHeightAtWorld, materials, lowPower) {
  const root = new THREE.Group();
  root.userData = { type: 'semantic-planting-area', surveyFeatureId: feature.id };
  const ring = feature.geometry.coordinates[0].map(([lon, lat]) => {
    const point = project(Number(lat), Number(lon));
    return { x: point.x, z: point.y };
  });
  if (ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z) ring.pop();
  if (ring.length < 3) return root;
  const shapePoints = ring.map(({ x, z }) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);
  const positions = [];
  triangles.forEach((triangle) => triangle.forEach((index) => {
    const point = ring[index];
    positions.push(point.x, terrainHeightAtWorld(point.x, point.z) + 0.065, point.z);
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const soil = new THREE.Mesh(geometry, materials.soil);
  soil.receiveShadow = true;
  root.add(soil);

  ring.forEach((end, index) => {
    const start = ring[(index + ring.length - 1) % ring.length];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    const edge = addMesh(
      THREE,
      root,
      new THREE.BoxGeometry(0.22, 0.28, length),
      materials.timber,
      (start.x + end.x) / 2,
      (terrainHeightAtWorld(start.x, start.z) + terrainHeightAtWorld(end.x, end.z)) / 2 + 0.15,
      (start.z + end.z) / 2,
    );
    edge.rotation.y = Math.atan2(dx, dz);
  });

  const minX = Math.min(...ring.map((point) => point.x));
  const maxX = Math.max(...ring.map((point) => point.x));
  const minZ = Math.min(...ring.map((point) => point.z));
  const maxZ = Math.max(...ring.map((point) => point.z));
  const spacing = lowPower ? 1.35 : 0.85;
  for (let x = minX + 0.45; x < maxX - 0.3; x += spacing) {
    for (let z = minZ + 0.4; z < maxZ - 0.3; z += spacing) {
      if (!pointInRing(x, z, ring)) continue;
      const flower = addMesh(THREE, root, new THREE.SphereGeometry(0.19, 6, 4), materials.flower, x, terrainHeightAtWorld(x, z) + 0.42, z);
      flower.scale.y = 0.75;
    }
  }
  return root;
}

export function createSemanticSurveyLayer({ THREE, group, collection, project, terrainHeightAtWorld, lowPower = false }) {
  const validation = validateSemanticSurvey(collection);
  if (!validation.valid) throw new Error(`Invalid semantic survey: ${validation.errors.join(' ')}`);
  const materials = {
    trunk: standardMaterial(THREE, 0x70543a, { roughness: 0.96 }),
    green: standardMaterial(THREE, 0x385d35, { roughness: 0.96 }),
    crimson: standardMaterial(THREE, 0x594039, { roughness: 0.96 }),
    glass: standardMaterial(THREE, 0x243f4b, { roughness: 0.2, metalness: 0.12 }),
    metal: standardMaterial(THREE, 0x929894, { roughness: 0.42, metalness: 0.62 }),
    fence: standardMaterial(THREE, 0x5d5b54, { roughness: 0.83, metalness: 0.18 }),
    soil: standardMaterial(THREE, 0x4b392e, { roughness: 1 }),
    timber: standardMaterial(THREE, 0x75604a, { roughness: 0.96 }),
    flower: standardMaterial(THREE, 0xc84545, { roughness: 0.85 }),
    flag: new THREE.MeshBasicMaterial({ color: 0xd92832, side: THREE.DoubleSide }),
  };
  const shared = {
    trunk: new THREE.CylinderGeometry(0.4, 0.64, 5, 7),
    crown: new THREE.IcosahedronGeometry(3.35, lowPower ? 0 : 1),
    carBody: new THREE.BoxGeometry(1.72, 0.48, 4.25),
    carCabin: new THREE.BoxGeometry(1.52, 0.55, 2.05),
  };
  let rendered = 0;
  collection.features.forEach((feature) => {
    if (feature.properties?.render_in_semantic_layer === false) return;
    let object = null;
    if (feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates.map(Number);
      const point = project(lat, lon);
      const ground = terrainHeightAtWorld(point.x, point.y);
      if (feature.properties.semantic_type === 'tree') object = buildTree(THREE, feature, point.x, ground, point.y, materials, shared);
      if (feature.properties.semantic_type === 'parked_vehicle') object = buildParkedVehicle(THREE, feature, point.x, ground, point.y, materials, shared);
      if (feature.properties.semantic_type === 'flagpole') object = buildFlagpole(THREE, feature, point.x, ground, point.y, materials);
    }
    if (feature.properties.semantic_type === 'fence') object = buildFence(THREE, feature, project, terrainHeightAtWorld, materials);
    if (feature.properties.semantic_type === 'planting_area') object = buildPlantingArea(THREE, feature, project, terrainHeightAtWorld, materials, lowPower);
    if (!object) return;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = !lowPower;
      child.receiveShadow = !lowPower;
    });
    group.add(object);
    rendered += 1;
  });
  group.userData = { type: 'semantic-survey-layer', surveyId: collection.metadata.id, rendered };
  return { ...semanticSurveySummary(collection), rendered };
}

export function createOrthophotoOverlay({ THREE, definition, project, terrainHeightAtWorld }) {
  if (!definition?.file || !definition?.bounds) return null;
  const southwest = project(definition.bounds.south, definition.bounds.west);
  const northeast = project(definition.bounds.north, definition.bounds.east);
  const width = Math.abs(northeast.x - southwest.x);
  const depth = Math.abs(northeast.y - southwest.y);
  const centerX = (southwest.x + northeast.x) / 2;
  const centerZ = (southwest.y + northeast.y) / 2;
  const texture = new THREE.TextureLoader().load(definition.file);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.58,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.PlaneGeometry(width, depth, 64, 64);
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const worldX = centerX + position.getX(index);
    const worldZ = centerZ - position.getY(index);
    position.setZ(index, terrainHeightAtWorld(worldX, worldZ) + 1.2);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const overlay = new THREE.Mesh(geometry, material);
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.set(centerX, 0, centerZ);
  overlay.renderOrder = 10000;
  overlay.visible = false;
  overlay.name = 'Developer orthophoto alignment overlay';
  overlay.userData = { type: 'survey-reference-overlay', definition, texture };
  return overlay;
}
