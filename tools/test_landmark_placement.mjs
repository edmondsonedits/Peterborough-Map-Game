import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LANDMARKS,
  createBuildingFootprintPlacement,
  resolveLandmarkRootPlacement,
} from '../city-explorer/landmark-models.js';

function ring(points) {
  return points.map(([x, z]) => ({ x, y: z }));
}

const square = ring([[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]);
const placement = createBuildingFootprintPlacement('way/test', [square], 14.75);
assert.ok(placement, 'a valid footprint should produce placement metadata');
assert.equal(placement.area, 200);
assert.deepEqual(placement.centroid, { x: 10, z: 5 });

const placements = new Map([['way/test', [placement]]]);
const inside = resolveLandmarkRootPlacement(
  { osmRefs: ['way/test'] },
  { x: 3, y: 4 },
  placements,
);
assert.deepEqual(
  inside,
  { x: 3, z: 4, y: 14.75, featureId: 'way/test', sourceAligned: true, snapped: false },
  'an authored point inside its refreshed footprint should retain its surveyed horizontal placement',
);

const outside = resolveLandmarkRootPlacement(
  { osmRefs: ['way/test'] },
  { x: 80, y: 70 },
  placements,
);
assert.deepEqual(
  outside,
  { x: 10, z: 5, y: 14.75, featureId: 'way/test', sourceAligned: true, snapped: true },
  'a stale point outside its source footprint should snap to the footprint centroid and foundation',
);

assert.equal(
  createBuildingFootprintPlacement('way/invalid', [ring([[0, 0], [1, 0], [2, 0]])], 3),
  null,
  'degenerate building rings must not create landmark placement metadata',
);

// Regression for the floating slab visible above downtown in v1.5.5. The
// source-aligned Peterborough Square overlay must never recreate the old broad
// rectangular roof; the authoritative building renderer owns that footprint.
const osm = JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const squareWay = osm.elements.find((element) => element.type === 'way' && element.id === 77774650);
assert.ok(squareWay?.geometry?.length >= 4, 'the prepared OSM snapshot must contain Peterborough Square geometry');

const cityCenter = { lat: 44.3091, lon: -78.3197 };
const latScale = 110540;
const lonScale = 111320 * Math.cos(cityCenter.lat * Math.PI / 180);
const project = ({ lat, lon }) => ({
  x: (lon - cityCenter.lon) * lonScale,
  y: -(lat - cityCenter.lat) * latScale,
});
const sourceRing = squareWay.geometry.map(project);
const sourcePlacement = createBuildingFootprintPlacement('way/77774650', [sourceRing], 12.6);
const squareLandmark = LANDMARKS.find((landmark) => landmark.id === 'peterborough-square');
const authoredPoint = project(squareLandmark);
const resolvedSquare = resolveLandmarkRootPlacement(
  squareLandmark,
  authoredPoint,
  new Map([['way/77774650', [sourcePlacement]]]),
);

assert.equal(resolvedSquare.sourceAligned, true);
assert.equal(resolvedSquare.snapped, false, 'the audited Peterborough Square anchor must be inside its OSM footprint');
assert.equal(squareLandmark.headingDeg, 90, 'the George Street entrance detail must follow the source footprint');
assert.ok(
  Math.hypot(authoredPoint.x - sourcePlacement.centroid.x, authoredPoint.y - sourcePlacement.centroid.z) < 0.1,
  'the landmark anchor should match the source-footprint centroid to decimetre precision',
);
const landmarkModelSource = fs.readFileSync(new URL('../city-explorer/landmark-models.js', import.meta.url), 'utf8');
const squareModelBody = landmarkModelSource.slice(
  landmarkModelSource.indexOf('function peterboroughSquare'),
  landmarkModelSource.indexOf('function canoeMuseum'),
);
assert.doesNotMatch(squareModelBody, /roofPale|width:\s*106/, 'Peterborough Square recreated the false rectangular roof slab');

const marketHallModelBody = landmarkModelSource.slice(
  landmarkModelSource.indexOf('function marketHall'),
  landmarkModelSource.indexOf('function library'),
);
assert.doesNotMatch(marketHallModelBody, /roofPale,\s*width:\s*38/, 'Market Hall recreated the duplicate pale roof slab');

console.log(JSON.stringify({
  status: 'pass',
  sourceAlignedPlacement: true,
  staleAnchorCorrection: true,
  peterboroughSquareCentroidErrorMetres: Number(
    Math.hypot(authoredPoint.x - sourcePlacement.centroid.x, authoredPoint.y - sourcePlacement.centroid.z).toFixed(3),
  ),
  peterboroughSquareHeadingDegrees: squareLandmark.headingDeg,
  falseRoofSlabRemoved: true,
}, null, 2));
