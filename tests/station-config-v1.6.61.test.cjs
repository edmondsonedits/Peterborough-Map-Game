'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../response-simulator/service-config.js');

test('Peterborough Stations 2 and 3 use the approved base and spawn geometry', () => {
  const bases = config.profiles.fire.bases;
  const station2 = bases.find(base => base.number === 2);
  const station3 = bases.find(base => base.number === 3);

  assert.deepEqual(station2, {
    id:'station-2', number:2, name:'Station 2', shortName:'Station 2', address:'100 Marina Blvd',
    lat:44.335711, lng:-78.316298, yardSize:137, yardWidth:137, yardLength:41,
    yardRotation:68, spawnLat:44.335686, spawnLng:-78.316271, spawnHeading:202,
  });
  assert.deepEqual(station3, {
    id:'station-3', number:3, name:'Station 3', shortName:'Station 3', address:'839 Clonsilla Ave',
    lat:44.284779, lng:-78.351068, yardSize:92, yardWidth:92, yardLength:85,
    yardRotation:53, spawnLat:44.284959, spawnLng:-78.350694, spawnHeading:127,
  });
});
