import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { OfficialDrivableSurfaceIndex, RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { RoadSurfaceIndex } from '../city-explorer/road-network.js';
import { finishRoadSurfaces } from '../city-explorer/road-surface-finish.js';
import { sampleTriangulatedTerrainHeight } from '../city-explorer/terrain-surface.js';
import { createPavementField } from '../city-explorer/pavement-continuity.js';
import { terrainEnvelopeNodes } from '../city-explorer/road-terrain-envelope.js';

function road(name, a, b, { width = 8, aY = 0, bY = 0, bridge = false, tunnel = false, layer = '0' } = {}) {
  return { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, aY, bY, width, bridge,
    lineId: name, name, tags: { highway: 'residential', name, layer, ...(tunnel ? { tunnel: 'yes' } : {}) },
    profile: { bridge, tunnel } };
}

function triangleSoup(rectangles, y = 0) {
  const positions = [];
  for (const [minX, maxX, minZ, maxZ] of rectangles) positions.push(
    minX,y,minZ, maxX,y,minZ, maxX,y,maxZ,
    minX,y,minZ, maxX,y,maxZ, minX,y,maxZ,
  );
  return new Float32Array(positions);
}

function addOfficial(index, minX, maxX, minZ, maxZ, holes = []) {
  const ring = (x0, x1, z0, z1) => [
    { x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 },
  ];
  index.add([ring(minX, maxX, minZ, maxZ), ...holes], { layer: 'road_surfaces' });
}

function makeMesh(group, type, positions, sourceRanges = []) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData = { type };
  group.add(mesh);
  return { mesh, geometry };
}

function finish({ roadGroup, roadIndex = new RoadSurfaceIndex(), officialIndex = new OfficialDrivableSurfaceIndex(),
  terrainHeight = () => 0, hunterBridgeSurface = null, sourceRangesByMesh = new Map(),
  renderedOfficialIndex = null, terrainGrid = null } = {}) {
  return finishRoadSurfaces({ THREE, roadGroup, roadIndex, officialIndex, terrainHeight,
    Index: RenderedPavementIndex, clearance: 0.14, hunterBridgeSurface, sourceRangesByMesh, renderedOfficialIndex, terrainGrid });
}

function indexMeshTriangles(index, mesh, layer) {
  const p = mesh.geometry.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) index.addTriangle(...p.subarray(i, i + 9), { layer });
}

function sampleTriangleHeight(positions, x, z) {
  for (let i = 0; i < positions.length; i += 9) {
    const ax=positions[i], ay=positions[i+1], az=positions[i+2];
    const bx=positions[i+3], by=positions[i+4], bz=positions[i+5];
    const cx=positions[i+6], cy=positions[i+7], cz=positions[i+8];
    const ux=bx-ax, uz=bz-az, vx=cx-ax, vz=cz-az, det=ux*vz-vx*uz;
    if (Math.abs(det)<1e-10) continue;
    const dx=x-ax,dz=z-az,b=(dx*vz-dz*vx)/det,c=(ux*dz-uz*dx)/det;
    if(b>=-1e-7&&c>=-1e-7&&b+c<=1+1e-7)return ay+b*(by-ay)+c*(cy-ay);
  }
  return null;
}

test('adjacent official surfaces share the same citywide lattice height across their seam', () => {
  const group = new THREE.Group();
  const left = makeMesh(group, 'road-official-road_surfaces-batch', triangleSoup([[0,8,0,8]], 0)).mesh;
  const right = makeMesh(group, 'road-official-road_surfaces-batch', triangleSoup([[8,16,0,8]], 6)).mesh;
  const official = new OfficialDrivableSurfaceIndex();
  addOfficial(official, 0, 16, 0, 8);
  const roads = new RoadSurfaceIndex();
  roads.addAll([road('way/1', [-10,4], [26,4], { width: 8, aY: 0, bY: 0 })]);
  const result = finish({ roadGroup: group, roadIndex: roads, officialIndex: official });
  const atSeam = result.officialIndex.sample(8, 4);
  const leftNear = result.officialIndex.sample(7.99, 4);
  const rightNear = result.officialIndex.sample(8.01, 4);
  assert.ok(atSeam && leftNear && rightNear);
  assert.ok(Math.abs(leftNear.height - rightNear.height) < 0.01, 'the source polygons no longer carry separate heights');
  assert.ok(Math.abs(atSeam.height - 0.148) < 1e-5, 'terrain clearance and the surface lift set the minimum');
  assert.equal(left.geometry.attributes.position.array.constructor, Float32Array);
  assert.equal(right.geometry.attributes.position.array.constructor, Float32Array);
  assert.equal(result.stats.latticeSpacing, 8);
});

test('shared-lattice height remains exact beyond the helper feather distance', () => {
  const group = new THREE.Group();
  const left = makeMesh(group, 'road-official-road_surfaces-batch', triangleSoup([[3000,3008,0,8]], 0)).mesh;
  const right = makeMesh(group, 'road-official-road_surfaces-batch', triangleSoup([[3008,3016,0,8]], 6)).mesh;
  const official = new OfficialDrivableSurfaceIndex();
  addOfficial(official, 3000, 3016, 0, 8);
  const roads = new RoadSurfaceIndex();
  roads.addAll([road('way/translated', [2990,4], [3026,4], { width: 8 })]);
  const result = finish({ roadGroup: group, roadIndex: roads, officialIndex: official });
  const leftNear = result.officialIndex.sample(3007.99, 4);
  const rightNear = result.officialIndex.sample(3008.01, 4);
  assert.ok(leftNear && rightNear);
  assert.ok(Math.abs(leftNear.height - rightNear.height) < 1e-5,
    'input height differences must not leak through the citywide field at translated seams');
  assert.equal(left.geometry.attributes.position.array.constructor, Float32Array);
  assert.equal(right.geometry.attributes.position.array.constructor, Float32Array);
});

test('municipal cross-section masks excess and small medians while leaving rural and broad-hole fallback', () => {
  const group = new THREE.Group();
  const positions = triangleSoup([[-4,4,-10,10], [995,1005,-10,10], [25,35,-10,10], [50,60,-10,10]]);
  const ranges = [
    { sourceId: 'way/municipal', key: 'batch:0', startVertex: 0, vertexCount: 6 },
    { sourceId: 'way/rural', key: 'batch:0', startVertex: 6, vertexCount: 6 },
    { sourceId: 'way/island', key: 'batch:0', startVertex: 12, vertexCount: 6 },
    { sourceId: 'way/broad-hole', key: 'batch:0', startVertex: 18, vertexCount: 6 },
  ];
  const { mesh } = makeMesh(group, 'road-surface-batch', positions);
  const official = new OfficialDrivableSurfaceIndex();
  addOfficial(official, -3, 3, -20, 20);
  addOfficial(official, 25, 35, -10, 10, [[{x:29,y:-1},{x:31,y:-1},{x:31,y:1},{x:29,y:1}]]);
  addOfficial(official, 50, 60, -10, 10, [[{x:51,y:-8},{x:59,y:-8},{x:59,y:8},{x:51,y:8}]]);
  const roads = new RoadSurfaceIndex();
  roads.addAll([
    road('way/municipal:0', [0,-20], [0,20], { width: 10 }),
    road('way/rural:0', [1000,-20], [1000,20], { width: 10 }),
    road('way/island:0', [30,-20], [30,20], { width: 10 }),
    road('way/broad-hole:0', [55,-20], [55,20], { width: 10 }),
  ]);
  const result = finish({ roadGroup: group, roadIndex: roads, officialIndex: official,
    sourceRangesByMesh: new Map([[mesh, ranges]]) });
  assert.equal(result.officialIndex.sample(0,0), null, 'municipal polygons are authoritative in XY');
  assert.equal(result.fallbackIndex.sample(0,0), null, 'source asphalt inside an owned cross-section is removed');
  assert.ok(result.fallbackIndex.sample(1000,0), 'rural fallback with no municipal owner remains');
  assert.equal(result.fallbackIndex.sample(30,0), null, 'ordinary pavement at bounded cross-section probes masks generated asphalt through the small median hole');
  assert.ok(result.fallbackIndex.sample(55,0), 'fallback remains where the centerline and bounded probes have no official ownership');
  assert.equal(official.contains(30,0), false, 'the original municipal hole is unchanged');
  assert.equal(official.contains(55,0), false, 'the broad official hole is unchanged');
  assert.equal(official.contains(3.5,0), false, 'the six-metre municipal silhouette is not expanded');
  assert.equal(result.fallbackIndex.sample(3.5,0), null, 'the eight-metre source shoulder does not survive outside municipal pavement');
  const updated = result.sourceRangesByMesh.get(mesh);
  assert.ok(updated.every((range) => range.startVertex >= 0 && range.startVertex + range.vertexCount <= mesh.geometry.attributes.position.count));
  assert.ok(updated.some((range) => range.sourceId === 'way/rural' && range.key === 'batch:0'));
  assert.ok(!updated.some((range) => range.sourceId === 'way/municipal'));
  assert.ok(result.stats.maskedFallbackTriangles > 0);
});

test('bridge and Hunter custom triangles retain their exact Float32 profiles', () => {
  const group = new THREE.Group();
  const bridgePositions = triangleSoup([[-4,4,-8,8]], 12);
  const customPositions = triangleSoup([[20,28,-8,8]], 18);
  const bridge = makeMesh(group, 'road-surface-batch', bridgePositions).mesh;
  const custom = makeMesh(group, 'road-surface-batch', customPositions).mesh;
  const roads = new RoadSurfaceIndex();
  roads.addAll([
    road('way/bridge:0', [0,-10], [0,10], { width: 8, aY: 12, bY: 12, bridge: true, layer: '1' }),
    road('way/custom:0', [24,-10], [24,10], { width: 8, aY: 18, bY: 18 }),
  ]);
  const result = finish({ roadGroup: group, roadIndex: roads,
    hunterBridgeSurface: { heightAt: (x) => x > 15 ? 18 : NaN } });
  assert.deepEqual([...bridge.geometry.attributes.position.array], [...bridgePositions]);
  assert.deepEqual([...custom.geometry.attributes.position.array], [...customPositions]);
  assert.ok(result.fallbackIndex.sample(0,0,12));
  assert.ok(result.fallbackIndex.sample(24,0,18));
  assert.ok(result.stats.preservedSpecialTriangles >= 4);
});

test('source ranges follow split triangles and rendered contact exactly matches finished Float32 mesh', () => {
  const group = new THREE.Group();
  const positions = new Float32Array([-8,0,-8, 16,0,-8, 0,0,16]);
  const { mesh } = makeMesh(group, 'road-official-road_surfaces-batch', positions);
  mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 1,0, 0,1], 2));
  const range = { sourceId: 'way/42', key: 'official:7', startVertex: 0, vertexCount: 3 };
  const official = new OfficialDrivableSurfaceIndex();
  addOfficial(official, -20, 20, -20, 20);
  const result = finish({ roadGroup: group, officialIndex: official,
    sourceRangesByMesh: new Map([[mesh, [range]]]) });
  const output = mesh.geometry.attributes.position.array;
  assert.ok(output.length > positions.length, 'lattice conformance subdivides the broad source face');
  assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count);
  assert.ok([...mesh.geometry.attributes.uv.array].every(Number.isFinite));
  const updated = result.sourceRangesByMesh.get(mesh);
  assert.deepEqual(updated, [{ ...range, startVertex: 0, vertexCount: output.length / 3 }]);
  const x = 0, z = 0;
  const meshHeight = sampleTriangleHeight(output, x, z);
  const indexed = result.officialIndex.sample(x, z);
  assert.ok(Number.isFinite(meshHeight) && indexed);
  assert.equal(indexed.height, Math.fround(meshHeight), 'contact is sampled from the same Float32 mesh vertices');
  assert.equal(indexed.sourceId, 'way/42');
});

test('indexed road meshes keep their rendered contact triangles even when conformance is skipped', () => {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 10, 10, 2, 0, 99, 99, 99], 3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.userData = { type: 'road-official-road_surfaces-batch' };
  group.add(mesh);
  const range = { sourceId: 'way/indexed', key: 'indexed:0', startVertex: 0, vertexCount: 3 };
  const result = finish({ roadGroup: group, sourceRangesByMesh: new Map([[mesh, [range]]]) });
  const hit = result.officialIndex.sample(2, 2);
  assert.equal(hit.height, 2);
  assert.equal(hit.sourceId, 'way/indexed');
  assert.equal(result.stats.skippedIndexedMeshes, 1);
  assert.equal(mesh.geometry.index.count, 3, 'indexed source geometry is retained exactly');
});


test('bridge footprint alone never claims ordinary fallback ownership', () => {
  const group = new THREE.Group();
  makeMesh(group, 'road-surface-batch', triangleSoup([[40,48,-10,10]], 0));
  const ownership = new OfficialDrivableSurfaceIndex();
  const ring = [{x:40,y:-10},{x:48,y:-10},{x:48,y:10},{x:40,y:10}];
  ownership.add([ring], { layer: 'bridges', properties: { BR_USE: 'vehicular' } });
  const roads = new RoadSurfaceIndex();
  roads.addAll([road('way/underpass-road:0', [44,-20], [44,20], { width: 8 })]);
  const result = finish({ roadGroup: group, officialIndex: ownership, roadIndex: roads });
  assert.ok(result.fallbackIndex.sample(44,0), 'bridge-only XY coverage does not erase an ordinary source road');
});

test('underpass fallback survives bridge XY ownership when rendered municipal faces are over one metre above', () => {
  const group = new THREE.Group();
  const lower = makeMesh(group, 'road-surface-batch', triangleSoup([[-4,4,-8,8]], 0)).mesh;
  const bridge = makeMesh(group, 'road-official-bridges-batch', triangleSoup([[-4,4,-8,8]], 10)).mesh;
  const ranges = new Map([[lower, [{ sourceId: 'way/lower', key: 'lower', startVertex: 0, vertexCount: 6 }]]]);
  const roads = new RoadSurfaceIndex();
  roads.addAll([
    road('way/lower:0', [0,-10], [0,10], { width: 8, aY: 0, bY: 0 }),
    road('way/bridge:0', [0,-10], [0,10], { width: 8, aY: 10, bY: 10, bridge: true, layer: '1' }),
  ]);
  const official = new OfficialDrivableSurfaceIndex();
  addOfficial(official, -4, 4, -8, 8);
  addOfficial(official, -4, 4, -8, 8);
  const rendered = new RenderedPavementIndex();
  indexMeshTriangles(rendered, bridge, 'bridges');
  // The ordinary road_surf mesh is also rendered on the upper bridge deck.
  const upperRoad = makeMesh(group, 'road-official-road_surfaces-batch', triangleSoup([[-4,4,-8,8]], 10)).mesh;
  indexMeshTriangles(rendered, upperRoad, 'road_surfaces');
  const result = finish({ roadGroup: group, roadIndex: roads, officialIndex: official,
    sourceRangesByMesh: ranges, renderedOfficialIndex: rendered });
  assert.ok(result.fallbackIndex.sample(0, 0, 0), 'lower source contact remains available under the bridge');
  assert.ok(result.officialIndex.sample(0, 0, 0, { includeBridges: false })?.height > 9,
    'municipal contact remains on the upper deck, not the lower source elevation');
  assert.equal(bridge.geometry.attributes.position.array[1], 10, 'bridge profile remains exact');
});

test('same-grade rendered municipal road masks duplicate fallback while stacked bridge remains', () => {
  const group = new THREE.Group();
  const lower = makeMesh(group, 'road-surface-batch', triangleSoup([[-4,4,-8,8]], 0)).mesh;
  const ordinary = makeMesh(group, 'road-official-road_surfaces-batch', triangleSoup([[-4,4,-8,8]], 0)).mesh;
  const bridge = makeMesh(group, 'road-official-bridges-batch', triangleSoup([[-4,4,-8,8]], 10)).mesh;
  const ranges = new Map([[lower, [{ sourceId: 'way/lower', key: 'lower', startVertex: 0, vertexCount: 6 }]]]);
  const roads = new RoadSurfaceIndex();
  roads.addAll([
    road('way/lower:0', [0,-10], [0,10], { width: 8, aY: 0, bY: 0 }),
    road('way/bridge:0', [0,-10], [0,10], { width: 8, aY: 10, bY: 10, bridge: true, layer: '1' }),
  ]);
  const official = new OfficialDrivableSurfaceIndex();
  addOfficial(official, -4, 4, -8, 8);
  addOfficial(official, -4, 4, -8, 8);
  const rendered = new RenderedPavementIndex();
  indexMeshTriangles(rendered, ordinary, 'road_surfaces');
  indexMeshTriangles(rendered, bridge, 'bridges');
  const result = finish({ roadGroup: group, roadIndex: roads, officialIndex: official,
    sourceRangesByMesh: ranges, renderedOfficialIndex: rendered });
  assert.equal(result.fallbackIndex.sample(0, 0), null, 'same-grade municipal pavement owns the duplicate footprint');
  assert.equal(result.officialIndex.sample(0, 0, 10, { includeBridges: true })?.height, 10,
    'upper bridge contact remains available');
  assert.equal(bridge.geometry.attributes.position.array[1], 10, 'bridge render profile remains exact');
});

test('foundations are conformed for rendering but excluded from both contact indexes', () => {
  const group = new THREE.Group();
  makeMesh(group, 'road-foundation-batch', triangleSoup([[90,98,-10,10]], 0));
  const roads = new RoadSurfaceIndex();
  roads.addAll([road('way/foundation:0', [94,-20], [94,20], { width: 8 })]);
  const result = finish({ roadGroup: group, roadIndex: roads });
  assert.equal(result.officialIndex.sample(94,0), null);
  assert.equal(result.fallbackIndex.sample(94,0), null);
  assert.ok(result.stats.conformedTriangles > 0);
});


test('finished pavement clears terrain crests between the eight-metre road nodes',()=>{
 const terrainGrid={minX:-3,minZ:-10,size:20,segments:2,heights:new Float32Array([0,5,0,0,5,0,0,5,0])};
 const terrainHeight=(x,z)=>sampleTriangulatedTerrainHeight(terrainGrid,x,z);
 const roadGroup=new THREE.Group();
 makeMesh(roadGroup,'road-official-road_surfaces-batch',triangleSoup([[0,16,-4,4]]));
 const result=finish({roadGroup,terrainGrid,terrainHeight});
 for(let x=.25;x<15.9;x+=.25)for(let z=-3.75;z<3.9;z+=.5){
  const hit=result.officialIndex.sample(x,z);
  assert.ok(hit,`missing pavement ${x},${z}`);
  assert.ok(hit.height>=terrainHeight(x,z)+.14,`terrain shows through road at ${x},${z}: ${hit.height} < ${terrainHeight(x,z)+.14}`);
 }
});


test('terrain envelope clears both grid diagonals and boundaries deterministically',()=>{
 const grid={minX:-3.7,minZ:-5.2,size:42,segments:4,heights:Float32Array.from({length:25},(_,i)=>2.5+2.4*Math.sin(i*1.71))};
 const terrainHeight=(x,z)=>sampleTriangulatedTerrainHeight(grid,x,z);
 const build=()=>{
  const base=createPavementField({center:{x:0,z:0},radius:40000,spacing:8,heightAt:(x,z)=>Math.max(terrainHeight(x,z)+.148,3+x*.02)});
  const envelope=terrainEnvelopeNodes({field:base,terrainHeight,grid,clearance:.148});
  return{base,envelope,field:createPavementField({center:{x:0,z:0},radius:40000,spacing:8,heightAt:envelope.heightAt})};
 };
 const a=build(),b=build(),points=[];
 for(let x=-4.75;x<40;x+=.5)for(let z=-6.25;z<39;z+=.5)points.push([x,z]);
 const forward=points.map(([x,z])=>a.field.sample(x,z));
 const reverse=[...points].reverse().map(([x,z])=>b.field.sample(x,z)).reverse();
 forward.forEach((height,i)=>{
  const [x,z]=points[i];assert.ok(height>=terrainHeight(x,z)+.148-1e-8,`uncovered terrain at ${x},${z}`);
  assert.ok(height>=a.base.sample(x,z)-1e-8,'existing source grades must never be lowered');
  assert.equal(height,reverse[i],'query order must not change shared node heights');
 });
 assert.ok(a.envelope.stats.liftedCells>0);
});

test('terrain envelope leaves an already-safe planar road unchanged',()=>{
 const grid={minX:-20,minZ:-20,size:40,segments:2};
 const terrainHeight=(x,z)=>2+x*.03+z*.05;
 const base=createPavementField({center:{x:0,z:0},radius:40000,spacing:8,heightAt:(x,z)=>terrainHeight(x,z)+.148});
 const envelope=terrainEnvelopeNodes({field:base,terrainHeight,grid,clearance:.148});
 for(let x=-16;x<=16;x+=8)for(let z=-16;z<=16;z+=8)assert.equal(envelope.heightAt(x,z),base.sample(x,z));
 assert.equal(envelope.stats.maximumLift,0);
});
