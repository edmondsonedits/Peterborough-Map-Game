import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../city-explorer/vendor/three-r180/build/three.module.min.js';
import {clipTerrainToShorelines, reviewedWaterHoles} from '../../city-explorer/water-shorelines.js';

const geometry = new THREE.PlaneGeometry(20, 20, 2, 2).rotateX(-Math.PI / 2);
geometry.translate(10, 4, 10);
const rectangle = (x0, z0, x1, z1) => [[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]];
const polygons = [
  [rectangle(2, 2, 18, 18), rectangle(8, 8, 12, 12)],
  [rectangle(17, 4, 22, 6)],
  [rectangle(0.3, 13, 1.1, 17)],
];
const result = clipTerrainToShorelines(THREE, geometry.clone(), 2, polygons, (x,z) => (x >= 2 && x <= 18 && z >= 2 && z <= 18 && !(x > 8 && x < 12 && z > 8 && z < 12)) ? 2 : NaN);
const p = result.attributes.position;
const indices = result.index.array;
let area = 0;
const vector = new THREE.Vector3();
for (let i = 0; i < indices.length; i += 3) {
  const [a,b,c] = [0,1,2].map(offset => new THREE.Vector3().fromBufferAttribute(p,indices[i+offset]));
  const normal = vector.subVectors(b,a).cross(c.sub(a));
  assert.ok(normal.y > 0, 'all dry faces point upward');
  area += normal.y / 2;
}
assert.ok(Math.abs(area - (400 - (256 - 16) - 4 - 3.2)) < 0.001, 'the island and dry banks survive, including a subcell pond and overlap');
assert.equal(geometry.attributes.position.count, 9, 'the original terrain grid remains intact');
assert.equal(result.attributes.uv.count, p.count);
assert.equal(result.attributes.normal.count, p.count);
assert.equal(clipTerrainToShorelines(THREE, geometry, 2, [], () => NaN), geometry);
console.log('Shoreline clipping preserves dry land, islands, winding, and the terrain grid.');

const hydro = JSON.parse(readFileSync(new URL('../../city-explorer/data/peterborough-hydrography.geojson', import.meta.url)));
const river = hydro.features.find(feature => feature.id === 'lidar/61');
assert.equal(reviewedWaterHoles(river.id, river.geometry.coordinates).length, 3);
assert.deepEqual(reviewedWaterHoles('lidar/62', river.geometry.coordinates), []);
assert.deepEqual(reviewedWaterHoles(river.id, [rectangle(0, 0, 1, 1)]), []);
