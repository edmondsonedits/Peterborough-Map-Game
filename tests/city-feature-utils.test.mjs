import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('city-explorer/feature-utils.js', 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {
  createFootprintCentroidIndex,
  deterministicNumber,
  featureTags,
  geometryLines,
  geometryPoints,
  geometryPolygons,
  parseMeters,
  pointInPolygon,
  polygonArea,
  simplifyRing,
  stableHash,
} = await import(moduleUrl);

test('feature tags preserve tags-first fallback behavior', () => {
  assert.deepEqual(featureTags({ properties:{ tags:{ building:'yes' }, name:'ignored' } }), { building:'yes' });
  assert.deepEqual(featureTags({ properties:{ name:'Park' } }), { name:'Park' });
  assert.deepEqual(featureTags(null), {});
});

test('deterministic helpers remain stable and parse metric/imperial heights', () => {
  assert.equal(stableHash('station-1'), stableHash('station-1'));
  assert.notEqual(stableHash('station-1'), stableHash('station-2'));
  assert.equal(deterministicNumber('seed', 5, 9), deterministicNumber('seed', 5, 9));
  assert.ok(deterministicNumber('seed', 5, 9) >= 5 && deterministicNumber('seed', 5, 9) <= 9);
  assert.equal(parseMeters('2,5 m'), 2.5);
  assert.ok(Math.abs(parseMeters('10 ft') - 3.048) < 1e-12);
  assert.ok(Number.isNaN(parseMeters(null)));
});

test('ring simplification preserves endpoints and distance semantics', () => {
  const make = (x, y) => ({ x, y, distanceTo(other){ return Math.hypot(x - other.x, y - other.y); } });
  const points = [make(0,0), make(.1,0), make(1,0), make(2,0), make(3,0)];
  const result = simplifyRing(points, .75, 100);
  assert.equal(result[0], points[0]);
  assert.equal(result.at(-1), points.at(-1));
  assert.deepEqual(result.map(point => point.x), [0,1,2,3]);
});

test('polygon helpers preserve area, holes and GeoJSON normalization', () => {
  const outer = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}];
  const hole = [{x:4,y:4},{x:6,y:4},{x:6,y:6},{x:4,y:6},{x:4,y:4}];
  assert.equal(polygonArea(outer), 100);
  assert.equal(pointInPolygon({x:2,y:2}, [outer,hole]), true);
  assert.equal(pointInPolygon({x:5,y:5}, [outer,hole]), false);
  assert.deepEqual(geometryPolygons({geometry:{type:'Polygon',coordinates:[[[1,2]]]}}), [[[[1,2]]]]);
  assert.deepEqual(geometryLines({geometry:{type:'LineString',coordinates:[[1,2],[3,4]]}}), [[[1,2],[3,4]]]);
  assert.deepEqual(geometryPoints({geometry:{type:'Point',coordinates:[1,2]}}), [[1,2]]);
  assert.deepEqual(geometryPoints({geometry:{type:'Polygon',coordinates:[]}}), []);
});

test('footprint index preserves inside and edge-tolerance checks', () => {
  const ring = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}];
  const index = createFootprintCentroidIndex(8);
  index.add([ring]);
  assert.equal(index.contains(5,5), true);
  assert.equal(index.contains(11.5,5,2), true);
  assert.equal(index.contains(13,5,2), false);
});

test('app.js consumes feature utilities instead of redefining them', () => {
  const app = fs.readFileSync('city-explorer/app.js', 'utf8');
  assert.match(app, /from '\.\/feature-utils\.js'/);
  for (const name of [
    'featureTags','stableHash','deterministicNumber','parseMeters','simplifyRing',
    'polygonArea','pointInRing','pointInPolygon','geometryPolygons','geometryLines',
    'geometryPoints','createFootprintCentroidIndex',
  ]) {
    assert.doesNotMatch(app, new RegExp(`function\\s+${name}\\s*\\(`));
  }
});
