import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const moduleSource = fs.readFileSync(new URL('city-explorer/road-network.js', root), 'utf8');
const roads = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const terrainModuleSource = fs.readFileSync(new URL('city-explorer/terrain-surface.js', root), 'utf8');
const terrainSurface = await import(`data:text/javascript;base64,${Buffer.from(terrainModuleSource).toString('base64')}`);
const osm = JSON.parse(fs.readFileSync(new URL('city-explorer/data/peterborough-osm.json', root), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('city-explorer/data/manifest.json', root), 'utf8'));

const project = (lat, lon) => ({
  x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180),
  y: -(lat - 44.3091) * 110540,
});

const failures = [];
const fail = (message) => failures.push(message);
const ways = osm.elements.filter((element) => element.type === 'way' && roads.isDrivableRoad(element.tags || {}));
if (ways.length !== manifest.osm.drivable_road_count) {
  fail(`classified ${ways.length} drivable ways; manifest expects ${manifest.osm.drivable_road_count}`);
}

let generatedSegments = 0;
let maxGap = 0;
let invalidProfiles = 0;
let missingSourceVertices = 0;
for (const way of ways) {
  const tags = way.tags || {};
  const profile = roads.roadProfile(tags);
  if (!profile || !Number.isFinite(profile.width) || profile.width < 2.5 || profile.width > 26) {
    invalidProfiles += 1;
    continue;
  }
  const points = (way.geometry || [])
    .filter((coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lon))
    .map((coordinate) => project(coordinate.lat, coordinate.lon));
  if (points.length < 2) continue;
  const samples = roads.resampleRoadLine(points, tags, () => 0, false);
  generatedSegments += Math.max(0, samples.length - 1);
  const spacing = roads.roadSampleSpacing(tags, false);
  for (let index = 1; index < samples.length; index += 1) {
    const gap = samples[index].distance - samples[index - 1].distance;
    maxGap = Math.max(maxGap, gap);
    if (gap > spacing + 0.001) fail(`way ${way.id} has ${gap.toFixed(3)} m gap above ${spacing} m spacing`);
    if (!Number.isFinite(samples[index].height)) fail(`way ${way.id} has non-finite road height`);
  }
  const sourceSamples = new Map(samples.filter((sample) => sample.sourceVertex).map((sample) => [sample.sourceIndex, sample]));
  points.forEach((point, sourceIndex) => {
    if (sourceIndex > 0 && Math.hypot(point.x - points[sourceIndex - 1].x, point.y - points[sourceIndex - 1].y) < 0.05) return;
    const sample = sourceSamples.get(sourceIndex)
      || samples.find((candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) <= 0.001);
    if (!sample || Math.hypot(point.x - sample.x, point.y - sample.y) > 0.001) missingSourceVertices += 1;
  });
}

if (invalidProfiles) fail(`${invalidProfiles} road profiles have invalid widths`);
if (missingSourceVertices) fail(`${missingSourceVertices} original OSM vertices were not preserved`);
if (generatedSegments > 130000) fail(`${generatedSegments} generated segments exceed the 130000 desktop budget`);

const proposed = osm.elements.filter((element) => element.type === 'way' && ['proposed', 'construction', 'corridor'].includes(element.tags?.highway) && roads.isDrivableRoad(element.tags));
if (proposed.length) fail(`${proposed.length} proposed/construction/corridor ways leaked into drivable roads`);

const dividedHighway = ways.find((way) => way.tags?.highway === 'motorway' && way.tags?.lanes === '2' && way.tags?.oneway === 'yes');
const dividedProfile = roads.roadProfile(dividedHighway?.tags || {});
if (!dividedProfile || dividedProfile.width < 7 || dividedProfile.width > 9.5) fail(`two-lane divided highway width is ${dividedProfile?.width}`);
const parkingAisleProfile = roads.roadProfile({ highway: 'service', service: 'parking_aisle' });
if (parkingAisleProfile.width < 5.5) fail('parking aisle is too narrow for two-way vehicle movement');
if (!parkingAisleProfile.parkingAisle
  || parkingAisleProfile.surfaceKey !== 'parking'
  || parkingAisleProfile.edgeKey !== 'parking'
  || parkingAisleProfile.edgeExtra !== 0) {
  fail('parking aisles do not blend into mapped parking surfaces');
}
const drivewayProfile = roads.roadProfile({ highway: 'service', service: 'driveway' });
if (drivewayProfile.parkingAisle || drivewayProfile.surfaceKey !== 'roadService') {
  fail('ordinary service driveways were incorrectly classified as parking surfaces');
}

const syntheticTerrainGrid = {
  heights: new Float64Array([0, 10, 20, 40]),
  minX: 0,
  minZ: 0,
  segments: 1,
  size: 10,
};
const firstTerrainTriangle = terrainSurface.sampleTriangulatedTerrainHeight(syntheticTerrainGrid, 2, 3);
const secondTerrainTriangle = terrainSurface.sampleTriangulatedTerrainHeight(syntheticTerrainGrid, 8, 7);
if (Math.abs(firstTerrainTriangle - 8) > 0.0001 || Math.abs(secondTerrainTriangle - 27) > 0.0001) {
  fail(`terrain sampler does not match PlaneGeometry triangles (${firstTerrainTriangle}, ${secondTerrainTriangle})`);
}
if (terrainSurface.sampleTriangulatedTerrainHeight(syntheticTerrainGrid, -100, -100) !== 0
  || terrainSurface.sampleTriangulatedTerrainHeight(syntheticTerrainGrid, 100, 100) !== 40) {
  fail('terrain sampler did not clamp safely to mesh boundaries');
}

const envelopeTags = { highway: 'residential', lanes: '2' };
const envelopeProfile = roads.roadProfile(envelopeTags);
const envelopeSamples = roads.resampleRoadLine(
  [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  envelopeTags,
  (_x, z) => z,
  false,
);
const expectedEnvelopeLift = (envelopeProfile.width + envelopeProfile.edgeExtra) / 2;
if (Math.abs(envelopeSamples[0].terrainEnvelopeLift - expectedEnvelopeLift) > 0.0001
  || envelopeSamples[0].groundHeight < expectedEnvelopeLift + roads.ROAD_SURFACE_CLEARANCE - 0.0001) {
  fail('road elevation did not clear the complete pavement/foundation cross-section');
}
const tunnelEnvelope = roads.sampleRoadTerrainEnvelope(
  [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  0,
  { highway: 'service', tunnel: 'yes' },
  (_x, z) => z,
);
if (tunnelEnvelope.sampleCount !== 1 || tunnelEnvelope.height !== tunnelEnvelope.centerHeight) {
  fail('tunnel elevation was incorrectly raised to the terrain cover');
}

const index = new roads.RoadSurfaceIndex();
const indexedSegment = {
  a: { x: 0, y: 0 }, b: { x: 0, y: 12 }, aY: 1, bY: 2,
  bridge: false, name: 'Test Road', tags: { highway: 'residential' }, width: 6,
};
index.add(indexedSegment);
const midpoint = index.sample(1, 6);
if (!midpoint || Math.abs(midpoint.height - 1.5) > 0.001 || !midpoint.onRoad) fail('road surface index failed midpoint interpolation');
index.add({
  ...indexedSegment,
  aY: 6,
  bY: 6,
  bridge: true,
  name: 'Test Overpass',
  tags: { highway: 'primary', bridge: 'yes' },
});
const lowerDeck = index.sample(0, 6, 0.75, 1.4);
const upperDeck = index.sample(0, 6, 0.75, 5.8);
const stackedDecks = index.sampleAll(0, 6, 0.75);
if (Math.abs(lowerDeck?.height - 1.5) > 0.001) fail('height-aware surface index missed the lower stacked road');
if (Math.abs(upperDeck?.height - 6) > 0.001) fail('height-aware surface index missed the upper stacked road');
if (stackedDecks.length !== 2) fail(`surface index returned ${stackedDecks.length} of 2 stacked road decks`);

const gradeSamples = roads.resampleRoadLine(
  [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 0, y: 30 }, { x: 0, y: 40 }],
  { highway: 'secondary', lanes: '2' },
  (_x, z) => z === 20 ? 8 : 0,
  false,
);
const maximumGrade = Math.max(...gradeSamples.slice(1).map((sample, sampleIndex) => {
  const previous = gradeSamples[sampleIndex];
  return Math.abs(sample.height - previous.height) / Math.max(0.001, sample.distance - previous.distance);
}));
const maximumTerrainConformingLift = Math.max(...gradeSamples.map((sample) => sample.height - sample.groundHeight));
const maximumPermittedSmoothingLift = roads.maximumRoadSmoothingLift({ highway: 'secondary' });
if (maximumTerrainConformingLift > maximumPermittedSmoothingLift + 0.0001) {
  fail(`ordinary-road smoothing exceeded its ${maximumPermittedSmoothingLift.toFixed(2)} m cut/fill limit`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  drivableWays: ways.length,
  generatedSegments,
  maxGap: Number(maxGap.toFixed(3)),
  dividedHighwayWidth: dividedProfile.width,
  parkingAislesBlendWithParking: true,
  maximumSyntheticTerrainGradePct: Number((maximumGrade * 100).toFixed(2)),
  maximumSyntheticSmoothingLiftMetres: Number(maximumTerrainConformingLift.toFixed(3)),
  boundedRoadCutAndFill: true,
  originalVerticesPreserved: true,
  pavementEnvelopeClearance: true,
  stackedSurfaceSelection: true,
  terrainTriangleSampling: true,
}, null, 2));
