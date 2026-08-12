import assert from 'node:assert/strict';
import {
  estimatedBuildingFloors,
  facadeDetailClass,
  mappedCycleLaneSides,
  roadLaneMarkingBoundaries,
  mappedTurnLaneGroups,
  selectStreetSignIntersections,
  shouldRenderUrbanCurb,
} from '../city-explorer/city-detail-rules.js';

assert.equal(shouldRenderUrbanCurb({ highway: 'residential' }, {}), true);
assert.equal(shouldRenderUrbanCurb({ highway: 'secondary', maxspeed: '80' }, {}), false);
assert.equal(shouldRenderUrbanCurb({ highway: 'secondary', lit: 'yes' }, {}), true);
assert.equal(shouldRenderUrbanCurb({ highway: 'motorway' }, {}), false);
assert.deepEqual(mappedCycleLaneSides({ cycleway: 'lane' }), ['left', 'right']);
assert.deepEqual(mappedCycleLaneSides({ 'cycleway:right': 'track' }), ['right']);
assert.deepEqual(mappedCycleLaneSides({ cycleway: 'shared_lane' }), []);
assert.deepEqual(
  roadLaneMarkingBoundaries(
    { highway: 'secondary', lanes: '2', oneway: 'yes' },
    { highway: 'secondary', lanes: 2, oneWay: true },
  ),
  [{ boundary: 1, materialKey: 'roadPaintWhite', pattern: 'dash' }],
);
assert.deepEqual(
  roadLaneMarkingBoundaries(
    { highway: 'secondary', lanes: '2', maxspeed: '50' },
    { highway: 'secondary', lanes: 2, oneWay: false },
  ),
  [{ boundary: 1, materialKey: 'roadPaintYellow', pattern: 'solid' }],
);
assert.deepEqual(
  roadLaneMarkingBoundaries(
    { highway: 'secondary', lanes: '4' },
    { highway: 'secondary', lanes: 4, oneWay: false },
  ),
  [
    { boundary: 1, materialKey: 'roadPaintWhite', pattern: 'dash' },
    { boundary: 2, materialKey: 'roadPaintYellow', pattern: 'solid' },
    { boundary: 3, materialKey: 'roadPaintWhite', pattern: 'dash' },
  ],
);
assert.deepEqual(
  roadLaneMarkingBoundaries(
    { highway: 'secondary', lanes: '2', overtaking: 'yes' },
    { highway: 'secondary', lanes: 2, oneWay: false },
  ),
  [{ boundary: 1, materialKey: 'roadPaintYellow', pattern: 'dash' }],
);
assert.deepEqual(
  roadLaneMarkingBoundaries(
    { highway: 'service', service: 'parking_aisle', lanes: '2' },
    { highway: 'service', lanes: 2, oneWay: false, parkingAisle: true },
  ),
  [],
);
assert.deepEqual(
  mappedTurnLaneGroups(
    { oneway: 'yes', 'turn:lanes': 'left|none|through;right' },
    { oneWay: true },
  ),
  [{ direction: 'forward', symbols: ['left', null, 'through'], oneWay: true }],
);
assert.deepEqual(
  mappedTurnLaneGroups(
    { 'turn:lanes:forward': 'left|through', 'turn:lanes:backward': 'through|right' },
    { oneWay: false },
  ),
  [
    { direction: 'forward', symbols: ['left', 'through'], oneWay: false },
    { direction: 'backward', symbols: ['through', 'right'], oneWay: false },
  ],
);
assert.equal(estimatedBuildingFloors({ 'building:levels': '3' }, 6), 3);
assert.equal(estimatedBuildingFloors({ building: 'house' }, 6.4), 2);
assert.equal(facadeDetailClass({ building: 'retail' }), 'storefront');
assert.equal(facadeDetailClass({ building: 'shed' }), 'none');

const segment = (name, highway, ax, az, bx, bz) => ({
  a: { x: ax, y: az }, b: { x: bx, y: bz }, aY: 1, bY: 1,
  aSourceVertex: true, bSourceVertex: true, name, tags: { name, highway }, width: 7,
});
const intersections = selectStreetSignIntersections([
  segment('George Street North', 'secondary', 0, -10, 0, 0),
  segment('George Street North', 'secondary', 0, 0, 0, 10),
  segment('Hunter Street West', 'tertiary', -10, 0, 0, 0),
  segment('Hunter Street West', 'tertiary', 0, 0, 10, 0),
], 10);
assert.equal(intersections.length, 1);
assert.deepEqual(intersections[0].names, ['George Street North', 'Hunter Street West']);
assert.equal(intersections[0].x, 0);
assert.equal(intersections[0].z, 0);
assert.equal(intersections[0].signs.length, 2);

console.log(JSON.stringify({ status: 'pass', urbanCurbs: true, cycleLaneSides: true, ontarioLanePaint: true, streetIntersections: intersections.length }));
