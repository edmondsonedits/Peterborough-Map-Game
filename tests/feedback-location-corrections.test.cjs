'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'cities/peterborough/locations.json'), 'utf8'));
const locations = catalog.locations;
const byId = new Map(locations.map(row => [row.id, row]));
// Approved public geographic values only; no private feedback/account metadata.
const circles = [
  [
    "ptbo-location-e9b5c1759b3e50",
    44.2824014528922,
    -78.34677814238762,
    65
  ],
  [
    "ptbo-location-ac5bdbdeeb0516",
    44.28682164170232,
    -78.3295583485264,
    24
  ],
  [
    "ptbo-location-7d7426b218ffff",
    44.32954295935968,
    -78.33893534644824,
    143
  ],
  [
    "ptbo-location-76f794f5c89fad",
    44.30283664719648,
    -78.32237005233765,
    52
  ],
  [
    "ptbo-location-44b0d4956a5571",
    44.27180093429314,
    -78.33986878155372,
    98
  ],
  [
    "ptbo-location-b53711e5e3c867",
    44.28656434204066,
    -78.37785999035896,
    80
  ],
  [
    "ptbo-location-1299391522eb1a",
    44.303677409425326,
    -78.31966638684924,
    35
  ],
  [
    "ptbo-location-6727facfb31979",
    44.28396833482003,
    -78.34344149115287,
    89
  ],
  [
    "ptbo-location-28e577488958e2",
    44.29396759342578,
    -78.30848699600733,
    210
  ],
  [
    "ptbo-location-fcb0f7dc19933c",
    44.28290843889817,
    -78.33136085530941,
    245
  ],
  [
    "ptbo-location-c69c2c9145c1c0",
    44.27359855790262,
    -78.37366459596444,
    70
  ],
  [
    "ptbo-location-834713d4dd402b",
    44.29533459772756,
    -78.31773521913112,
    106
  ],
  [
    "ptbo-location-43baa97ede192d",
    44.29516564984372,
    -78.3300518366313,
    206
  ]
];

test('approved landmark recognition targets use the corrected physical centres and scoring circles', () => {
  for (const [id, lat, lng, radius] of circles) {
    const target = byId.get(id);
    assert.ok(target, id);
    assert.deepEqual([target.lat, target.lng, target.radiusMeters], [lat, lng, radius], target.name);
  }
  const school = byId.get('ptbo-location-8d5de3e709a34b');
  assert.deepEqual([school.lat, school.lng, school.radiusMeters], [44.3309442, -78.3099086, 96], 'radius-only correction retains school centre');
});

test('replaced exercises keep their identities and point to distinct verified real addresses', () => {
  const quality = byId.get('ptbo-location-e9b5c1759b3e50');
  assert.equal(quality.name, 'Quality Inn Peterborough');
  assert.equal(quality.address, '1074 Lansdowne St W');
  assert.deepEqual(quality.cityAddressObjectIds, [8211]);
  assert.equal(locations.filter(row => /Quality Inn/i.test(row.name || '')).length, 1);
  const gallery = byId.get('ptbo-location-2d19279bc7af07');
  assert.equal(gallery.name, 'Art Gallery of Peterborough');
  assert.equal(gallery.address, '250 Crescent St');
  assert.deepEqual([gallery.lat, gallery.lng], [44.29463433497778, -78.31778322195797]);
  assert.deepEqual(gallery.cityAddressObjectIds, [25258]);
  assert.deepEqual(gallery.crossStreets, ['Lake Street', 'Perry Street']);
  const retirement = byId.get('ptbo-location-4ab2e83a0adbe9');
  assert.equal(retirement.name, 'Peterborough Retirement Residence');
  assert.equal(retirement.address, '1039 Water St');
  assert.deepEqual([retirement.lat, retirement.lng], [44.32918481812732, -78.31616960122571]);
  assert.deepEqual(retirement.cityAddressObjectIds, [17579]);
  assert.deepEqual(retirement.crossStreets, ['Mill Street', 'Langton Street']);
  const ravenwood = byId.get('ptbo-location-cb32b00a0b6464');
  assert.equal(ravenwood.address, '1735 Ravenwood Dr');
  assert.deepEqual([ravenwood.lat, ravenwood.lng, ravenwood.radiusMeters], [44.3042528468656, -78.36497815958737, 60]);
  assert.deepEqual(ravenwood.cityAddressObjectIds, [25669]);
  assert.deepEqual(ravenwood.crossStreets, ['Parkhill Road West', 'Fair Avenue']);
  for (const address of ['1140 Lansdowne St W', '1030 Water St', '1757 Ravenwood Dr']) {
    assert.ok(!locations.some(row => row.address === address), address + ' is retired');
  }
  assert.equal(byId.get('ptbo-location-10d86588ce28ef').name, 'Summit Plaza', 'existing 1200 address remains one exercise');
});

test('gas station and mall labels identify the correct destination type', () => {
  const gas = byId.get('ptbo-location-0a91934bcce034');
  assert.match(gas.name, /gas station/i);
  assert.equal(gas.address, '1050 Lansdowne St W');
  assert.match(byId.get('ptbo-location-fcb0f7dc19933c').name, /mall/i);
});

test('corrected targets preserve one 200-address pool and the 100/50/50 recognition split', () => {
  assert.equal(locations.length, 200);
  assert.equal(new Set(locations.map(row => row.id)).size, 200);
  assert.equal(new Set(locations.map(row => row.address.trim().toLowerCase())).size, 200);
  assert.deepEqual(Object.fromEntries(['easy', 'medium', 'hard'].map(tier => [tier, locations.filter(row => row.difficulty === tier).length])), {easy:100, medium:50, hard:50});
});

test('large recognition circles and small storefront circles retain reachable road approaches and 60 m driving arrival', () => {
  const roads = JSON.parse(fs.readFileSync(path.join(root, 'city-explorer/data/osm-roads.geojson'), 'utf8')).features;
  const changed = [...circles.map(row => row[0]), 'ptbo-location-8d5de3e709a34b', 'ptbo-location-4ab2e83a0adbe9', 'ptbo-location-cb32b00a0b6464', 'ptbo-location-2d19279bc7af07', 'ptbo-location-0a91934bcce034'];
  for (const id of changed) {
    const row = byId.get(id), access = row.routeAccess;
    assert.ok(access, row.name || row.address);
    assert.equal(row.arrivalRadiusMeters, 60);
    assert.equal(access.verifiedEntrance, false);
    const road = roads.find(feature => feature.id === access.sourceWayId);
    assert.ok(road, id + ' approach uses an actual mapped way');
    assert.equal(access.road, road.properties.name);
    assert.ok(!['no', 'private'].includes(road.properties.access), id + ' approach road permits public access');
    const sx = 111320 * Math.cos(access.lat * Math.PI / 180), sy = 111320;
    const distances = road.geometry.coordinates.slice(1).map((b, i) => {
      const a = road.geometry.coordinates[i], ax = (a[0] - access.lng) * sx, ay = (a[1] - access.lat) * sy;
      const dx = (b[0] - a[0]) * sx, dy = (b[1] - a[1]) * sy;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
      return Math.hypot(ax + t * dx, ay + t * dy);
    });
    assert.ok(Math.min(...distances) < 1, id + ' road approach lies on its source geometry');
  }
});

test('corrected recognition radii are used as actual Geo practice scoring boundaries', () => {
  const context = vm.createContext({setTimeout, clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(root, 'geo-guesser/station-practice.js'), 'utf8'), context);
  for (const [id, , , approvedRadius] of circles) {
    const row = byId.get(id);
    const session = context.PTBO_STATION_PRACTICE.createSession({locations:[{...row, radius:row.radiusMeters}]});
    assert.equal(session.guess(approvedRadius + 0.1, row.radiusMeters).correct, false, row.name + ' outside');
    assert.equal(session.guess(approvedRadius - 0.1, row.radiusMeters).correct, true, row.name + ' inside');
  }
});

test('replacement address clues are actual connected intersections bracketing each target road', () => {
  const roads = JSON.parse(fs.readFileSync(path.join(root, 'city-explorer/data/osm-roads.geojson'), 'utf8')).features;
  for (const [id, targetRoad] of [
    ['ptbo-location-4ab2e83a0adbe9', 'Water Street'],
    ['ptbo-location-cb32b00a0b6464', 'Ravenwood Drive'],
    ['ptbo-location-2d19279bc7af07', 'Crescent Street'],
  ]) {
    const row = byId.get(id);
    for (let i = 0; i < row.crossStreets.length; i++) {
      const [lat, lng] = row.crossStreetCoordinates[i];
      const atIntersection = feature => feature.geometry.coordinates.some(point => point[0] === lng && point[1] === lat);
      assert.ok(roads.some(feature => feature.properties.name === targetRoad && atIntersection(feature)), id + ' clue lies on destination road');
      assert.ok(roads.some(feature => feature.properties.name === row.crossStreets[i] && atIntersection(feature)), id + ' clue lies on actual cross street');
    }
  }
});

test('all corrected approaches resolve through the actual public driving network and arrival code', async () => {
  const publicRoads = JSON.parse(fs.readFileSync(path.join(root, 'city-explorer/data/osm-public-roads.geojson'), 'utf8'));
  const context = vm.createContext({
    console, setTimeout:() => 0, clearTimeout() {}, requestAnimationFrame() {},
    performance:{now:() => 0}, CustomEvent:class {}, dispatchEvent() {}, addEventListener() {},
    simLat:44.3091, simLng:-78.3197, velocity:0, currentHeading:0, vehicleMarker:null, mapInstance:null,
    simulationStep() {}, evaluateDistanceToTarget() {},
    document:{querySelector:() => null, getElementById:() => null},
    fetch:async () => ({ok:true, json:async () => publicRoads}),
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'response-simulator/road-collision-core.js'), 'utf8'), context);
  await context.PTBO_ROAD_COLLISION.ready;
  const simulator = fs.readFileSync(path.join(root, 'response-simulator/index.html'), 'utf8');
  vm.runInContext(simulator.slice(simulator.indexOf('function resolveIncidentArrival('), simulator.indexOf('function escapeDispatchText(')), context);
  const corrected = locations.filter(row => row.routeAccess);
  assert.equal(corrected.length, 18);
  for (const row of corrected) {
    const access = row.routeAccess;
    const nearest = context.PTBO_ROAD_COLLISION.nearestRoad(access.lat, access.lng, 500);
    assert.ok(nearest && nearest.distance <= 20, (row.name || row.address) + ' approach must satisfy the real 20 m driving-network gate');
    assert.equal(context.PTBO_ROAD_COLLISION.isPointDrivable(access.lat, access.lng), true, (row.name || row.address) + ' approach is itself drivable');
    const sourceWay = publicRoads.features.find(feature => 'way/' + feature.properties.osm_id === access.sourceWayId);
    assert.ok(sourceWay, (row.name || row.address) + ' source way is included in the shipped public driving geometry');
    assert.equal(sourceWay.properties.name, access.road);
    const runtimeCall = {...row, addr:row.address, radius:row.radiusMeters};
    const before = JSON.stringify(runtimeCall);
    const arrival = context.resolveIncidentArrival(runtimeCall);
    assert.ok(arrival, (row.name || row.address) + ' actual arrival resolver accepts corrected canonical data');
    assert.deepEqual([arrival.lat, arrival.lng, arrival.radius], [access.lat, access.lng, 60]);
    assert.equal(JSON.stringify(runtimeCall), before, 'arrival resolution preserves recognition target');
  }
});
