'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'response-simulator/route-reveal.js'), 'utf8');
const packagedRoads = JSON.parse(fs.readFileSync(path.join(root, 'city-explorer/data/osm-public-roads.geojson'), 'utf8'));
const metersLng = 111320 * Math.cos(44.3091 * Math.PI / 180);
const point = (x, y = 0) => ({ lat: 44.3091 + y / 110540, lng: -78.3197 + x / metersLng });
const coordinate = (x, y = 0) => { const p = point(x, y); return [p.lng, p.lat]; };
const line = (points, properties = {}) => ({ type: 'Feature', properties: { highway: 'residential', name: 'Test road', ...properties }, geometry: { type: 'LineString', coordinates: points.map(p => coordinate(...p)) } });
async function router(features = packagedRoads.features) {
  const context = vm.createContext({
    console, setInterval() {}, document: { getElementById() { return null; }, querySelector() { return null; }, createElement() { return {}; }, head: { appendChild() {} } },
    fetch: async () => ({ ok: true, json: async () => ({ features }) }),
    CustomEvent: class {}, dispatchEvent() {},
  });
  context.window = context;
  vm.runInContext(source, context);
  await context.PTBO_ROUTE_REVEAL.ready;
  const api = context.PTBO_ROUTE_REVEAL;
  return { ...api, route(a, b) { return api.calculateRoute(a.lat, a.lng, b.lat, b.lng); } };
}

test('same-segment endpoints route along exact fractions in each legal direction', async () => {
  const api = await router([line([[0, 0], [1000, 0]])]);
  for (const [from, to] of [[200, 800], [800, 200]]) {
    const route = api.route(point(from), point(to));
    assert.ok(route, 'a long segment must not require a nearby stored vertex');
    assert.ok(Math.abs(route.distance - 600) < .01);
    assert.equal(route.edges.length, 1);
    assert.equal(route.mainRoads[0], 'Test road');
  }
});

test('one-way and reverse-only segment interiors reject contraflow without a legal return path', async () => {
  for (const oneway of ['yes', '-1']) {
    const api = await router([line([[0, 0], [100, 0]], { oneway })]);
    const legal = oneway === 'yes' ? [20, 80] : [80, 20];
    assert.ok(api.route(point(legal[0]), point(legal[1])));
    assert.equal(api.route(point(legal[1]), point(legal[0])), null);
  }
});

test('opposite one-way direction uses the connected return loop rather than a nearby vertex shortcut', async () => {
  const api = await router([
    line([[0, 0], [100, 0]], { oneway: 'yes' }),
    line([[100, 0], [100, 100], [0, 100], [0, 0]], { oneway: 'yes', name: 'Return loop' }),
  ]);
  const route = api.route(point(80), point(20));
  assert.ok(route);
  assert.ok(Math.abs(route.distance - 340) < .01);
  assert.ok(route.coordinates.some(([lat]) => lat > point(0, 90).lat));
});

test('nearby disconnected roads and divided carriageways are never joined by endpoint candidates', async () => {
  const api = await router([
    line([[0, 0], [100, 0]], { oneway: 'yes', name: 'Eastbound' }),
    line([[0, 15], [100, 15]], { oneway: '-1', name: 'Westbound' }),
  ]);
  assert.equal(api.route(point(20), point(80, 15)), null);
  assert.equal(api.route(point(80), point(20)), null);
});

test('shared junction endpoints can turn onto connected roads despite the selected segment direction', async () => {
  const api = await router([line([[0, 0], [100, 0]], { oneway: 'yes' }), line([[100, 0], [100, 100]], { name: 'Cross street' })]);
  assert.ok(api.route(point(100), point(100, 80)));
  assert.ok(api.route(point(100, 80), point(100)));
});

test('off-road access projects to the nearest segment and cannot jump to a better connected road', async () => {
  const api = await router([line([[0, 0], [1000, 0]]), line([[0, 30], [1000, 30]], { name: 'Disconnected parallel road' })]);
  const legal = api.route(point(200, -8), point(800, -12));
  assert.ok(legal);
  assert.ok(Math.abs(legal.distance - 620) < .01);
  assert.equal(api.route(point(200, -8), point(800, 28)), null);
  assert.equal(api.route(point(200, -181), point(800)), null);
  assert.equal(api.route({ lat: NaN, lng: 0 }, point(800)), null);
});

test('implicit roundabouts are directed while explicit two-way and reverse-only overrides survive', async () => {
  for (const [oneway, expected] of [[undefined, 1], ['no', 2], ['false', 2], ['0', 2], ['-1', 1]]) {
    const api = await router([line([[0, 0], [100, 0]], { junction: 'roundabout', oneway })]);
    assert.equal(api.state.graph.directedEdges, expected, String(oneway));
    if (oneway === '-1') assert.equal(api.route(point(20), point(80)), null);
    else if (expected === 1) assert.equal(api.route(point(80), point(20)), null);
  }
});

test('packaged North Monaghan contraflow uses graph edges and packaged untagged roundabouts have no reverse edges', async () => {
  const api = await router();
  const route = api.route({ lat: 44.2637228, lng: -78.3668088 }, { lat: 44.263838, lng: -78.3664218 });
  assert.ok(!route || route.edges.length > 0, 'never return the previous zero-edge contraflow connector');
  assert.ok(!route || route.distance > 100, 'legal return requires leaving this short one-way section');
  const feature = packagedRoads.features.find(f => f.properties.osm_id === 472414643);
  const roundabout = await router([feature]);
  const [a, b] = feature.geometry.coordinates;
  const from = roundabout.state.graph.nodes.find(n => n.lng === a[0] && n.lat === a[1]);
  const to = roundabout.state.graph.nodes.find(n => n.lng === b[0] && n.lat === b[1]);
  assert.equal(from.edges.some(e => e.to === to.id), true);
  assert.equal(to.edges.some(e => e.to === from.id), false);
});
