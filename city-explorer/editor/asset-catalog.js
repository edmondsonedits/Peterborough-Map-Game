import * as THREE from '../vendor/three-r180/build/three.module.min.js';

const vector = (x = 0, y = 0, z = 0) => ({ x, y, z });
const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });

function addMesh(group, geometry, meshMaterial, position = vector()) {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cylinder(group, radiusTop, radiusBottom, height, color, position = vector(), radialSegments = 10) {
  return addMesh(group, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), material(color), position);
}

function box(group, width, height, depth, color, position = vector()) {
  return addMesh(group, new THREE.BoxGeometry(width, height, depth), material(color), position);
}

function sphere(group, radius, color, position = vector(), widthSegments = 10, heightSegments = 8) {
  return addMesh(group, new THREE.SphereGeometry(radius, widthSegments, heightSegments), material(color), position);
}

function tree() {
  const group = new THREE.Group();
  cylinder(group, 0.16, 0.22, 2.4, 0x765239, vector(0, 1.2, 0));
  const leaves = material(0x47724b);
  for (const [x, y, z, radius] of [[0, 3, 0, 1.25], [-0.62, 3.65, 0.12, 0.86], [0.62, 3.62, -0.08, 0.9]]) {
    addMesh(group, new THREE.SphereGeometry(radius, 9, 7), leaves, vector(x, y, z));
  }
  return group;
}

function hydrant() {
  const group = new THREE.Group();
  cylinder(group, 0.19, 0.25, 0.68, 0xc83e32, vector(0, 0.44, 0), 12);
  cylinder(group, 0.22, 0.2, 0.18, 0xd54b39, vector(0, 0.87, 0), 12);
  sphere(group, 0.2, 0xd54b39, vector(0, 1.02, 0), 10, 6);
  for (const side of [-1, 1]) cylinder(group, 0.105, 0.12, 0.24, 0xb5322b, vector(side * 0.25, 0.57, 0), 10).rotation.z = Math.PI / 2;
  cylinder(group, 0.26, 0.26, 0.1, 0x333b3d, vector(0, 0.09, 0), 12);
  return group;
}

function streetlight() {
  const group = new THREE.Group();
  cylinder(group, 0.045, 0.075, 5, 0x454e50, vector(0, 2.5, 0));
  const arm = cylinder(group, 0.035, 0.035, 1.15, 0x454e50, vector(0.48, 4.82, 0));
  arm.rotation.z = Math.PI / 2;
  sphere(group, 0.18, 0xffe4a3, vector(1.02, 4.68, 0), 8, 6);
  return group;
}

function bench() {
  const group = new THREE.Group();
  box(group, 1.5, 0.12, 0.48, 0x855638, vector(0, 0.58, 0));
  box(group, 1.5, 0.58, 0.1, 0x855638, vector(0, 0.94, -0.2));
  for (const x of [-0.58, 0.58]) {
    box(group, 0.09, 0.56, 0.1, 0x414a4b, vector(x, 0.3, 0));
    box(group, 0.09, 0.56, 0.1, 0x414a4b, vector(x, 0.72, -0.2));
  }
  return group;
}

function trafficCone() {
  const group = new THREE.Group();
  box(group, 0.62, 0.1, 0.62, 0x353b3c, vector(0, 0.05, 0));
  cylinder(group, 0.035, 0.24, 0.67, 0xf27826, vector(0, 0.43, 0));
  cylinder(group, 0.105, 0.15, 0.1, 0xf4eee1, vector(0, 0.45, 0));
  return group;
}

function roadSign() {
  const group = new THREE.Group();
  cylinder(group, 0.045, 0.055, 2.3, 0x737d7c, vector(0, 1.15, 0));
  box(group, 0.9, 0.65, 0.08, 0x287558, vector(0, 1.95, 0));
  box(group, 0.62, 0.055, 0.09, 0xf5f0d9, vector(0, 2.05, 0.05));
  box(group, 0.42, 0.045, 0.09, 0xf5f0d9, vector(-0.08, 1.87, 0.05));
  return group;
}

function barrier() {
  const group = new THREE.Group();
  box(group, 2.2, 0.42, 0.28, 0xe7e1ce, vector(0, 0.67, 0));
  box(group, 2.2, 0.13, 0.3, 0xd84739, vector(0, 0.72, 0.01));
  for (const x of [-0.82, 0.82]) {
    box(group, 0.2, 0.48, 0.4, 0x5c6666, vector(x, 0.25, 0));
    box(group, 0.48, 0.08, 0.48, 0x5c6666, vector(x, 0.06, 0));
  }
  return group;
}

function utilityBox() {
  const group = new THREE.Group();
  box(group, 0.8, 1.05, 0.55, 0x68776f, vector(0, 0.54, 0));
  box(group, 0.64, 0.82, 0.035, 0x77857d, vector(0, 0.56, 0.29));
  box(group, 0.08, 0.12, 0.05, 0xd2c99d, vector(0.23, 0.57, 0.33));
  return group;
}

function landmarkMarker() {
  const group = new THREE.Group();
  cylinder(group, 0.08, 0.08, 2.1, 0x3b5260, vector(0, 1.05, 0), 8);
  const marker = addMesh(group, new THREE.OctahedronGeometry(0.52, 0), material(0xf0b84d, { metalness: 0.18 }), vector(0, 2.45, 0));
  marker.rotation.y = Math.PI / 4;
  cylinder(group, 0.34, 0.42, 0.18, 0x3b5260, vector(0, 0.12, 0), 8);
  return group;
}

function entry(key, label, category, create, defaultScale = vector(1, 1, 1), placementOffset = vector(), supportedProperties = []) {
  return { key, label, category, defaultScale, placementOffset, supportedProperties, factory: create };
}

export const ASSET_CATALOG = Object.freeze({
  tree: entry('tree', 'Tree', 'vegetation', tree, vector(1, 1, 1), vector(), ['species', 'height']),
  hydrant: entry('hydrant', 'Fire hydrant', 'safety', hydrant, vector(1, 1, 1), vector(), ['color']),
  streetlight: entry('streetlight', 'Streetlight', 'street furniture', streetlight, vector(1, 1, 1), vector(), ['height', 'lit']),
  bench: entry('bench', 'Bench', 'street furniture', bench, vector(1, 1, 1), vector(), ['material']),
  'traffic-cone': entry('traffic-cone', 'Traffic cone', 'safety', trafficCone, vector(1, 1, 1), vector(), ['color']),
  'road-sign': entry('road-sign', 'Road sign', 'signage', roadSign, vector(1, 1, 1), vector(), ['text', 'color']),
  barrier: entry('barrier', 'Road barrier', 'safety', barrier, vector(1, 1, 1), vector(), ['color']),
  'utility-box': entry('utility-box', 'Utility box', 'infrastructure', utilityBox, vector(1, 1, 1), vector(), ['material']),
  'landmark-marker': entry('landmark-marker', 'Landmark marker', 'landmark', landmarkMarker, vector(1, 1, 1), vector(), ['color']),
});

export function createCatalogObject(assetKey) {
  const asset = ASSET_CATALOG[assetKey];
  if (!asset) throw new RangeError(`Unknown authored asset: ${assetKey}`);
  return asset.factory();
}
