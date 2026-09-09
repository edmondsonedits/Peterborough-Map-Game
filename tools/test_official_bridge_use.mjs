import assert from 'node:assert/strict';
import fs from 'node:fs';
import { officialBridgeIsVehicular, OfficialDrivableSurfaceIndex } from '../city-explorer/official-road-surfaces.js';

const collection = JSON.parse(fs.readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson', import.meta.url), 'utf8'));
const bridges = collection.features.filter(f => f.properties.ptbo_layer === 'bridges');
const uses = {};
const ring = [[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]];
for (const feature of bridges) {
  const use = feature.properties.BR_USE || 'Unspecified';
  uses[use] = (uses[use] || 0) + 1;
  const index = new OfficialDrivableSurfaceIndex();
  index.add(ring, {layer:'bridges', id:feature.id, properties:feature.properties});
  assert.equal(index.contains(5,5), use === 'Vehicular', `${feature.id}: ${use}`);
}
assert.equal(officialBridgeIsVehicular({br_use:' Vehicular '}), true);
assert.equal(officialBridgeIsVehicular(), false);
assert.equal(bridges.filter(f => officialBridgeIsVehicular(f.properties)).length,44);
const parkway = bridges.find(f => f.id === '12/101');
assert.equal(parkway.properties.BR_USE, 'Pedestrian');
assert.equal(officialBridgeIsVehicular(parkway.properties), false);
// Overlying road pavement is independent of the structural bridge inventory.
const roads = new OfficialDrivableSurfaceIndex();
assert.equal(roads.add(ring, {layer:'road_surfaces'}),true);
assert.equal(roads.contains(5,5),true);
console.log(JSON.stringify({status:'pass', sourceBridgeRecords:bridges.length, uses, vehicularDecks:44, unsupportedRoadDecksExcluded:63, parkwayPedestrianCrossing:parkway.id}));
