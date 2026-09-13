'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../response-simulator/service-config.js');

test('Peterborough fire stations use the approved base and spawn geometry', () => {
  const bases = config.profiles.fire.bases;
  const station1 = bases.find(base => base.number === 1);
  const station2 = bases.find(base => base.number === 2);
  const station3 = bases.find(base => base.number === 3);

  assert.deepEqual(station1, {
    id:'station-1', number:1, name:'Station 1', shortName:'Station 1', address:'210 Sherbrooke St',
    lat:44.30102, lng:-78.32202, yardSize:69, yardWidth:69, yardLength:69,
    yardRotation:2, spawnLat:44.300942, spawnLng:-78.322201, spawnHeading:177,
  });
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

test('Peterborough EMS bases and hospital use the approved geometry', () => {
  const [armour,clonsilla] = config.profiles.ems.bases;
  assert.deepEqual(armour, {
    id:'ems-armour', number:1, name:'Armour Road Headquarters', shortName:'Armour', address:'310 Armour Rd',
    lat:44.304776, lng:-78.303384, yardSize:136, yardWidth:136, yardLength:96,
    yardRotation:19, spawnLat:44.304839, spawnLng:-78.303270, spawnHeading:45,
  });
  assert.deepEqual(clonsilla, {
    id:'ems-clonsilla', number:2, name:'Clonsilla Avenue Base', shortName:'Clonsilla', address:'1003 Clonsilla Ave',
    lat:44.289523, lng:-78.345850, yardSize:90, yardWidth:63, yardLength:90,
    yardRotation:44, spawnLat:44.289665, spawnLng:-78.346016, spawnHeading:135,
  });
  assert.deepEqual(config.hospital, {
    id:'prhc', main:'Medical', sub:'Hospital Transport', name:'Peterborough Regional Health Centre', addr:'1 Hospital Drive',
    lat:44.300744, lng:-78.347467, radius:40,
    checkpointLat:44.300744, checkpointLng:-78.347467, checkpointRadius:40,
    areaLat:44.300944, areaLng:-78.347561, areaWidth:58, areaLength:75, areaRotation:88,
  });
});
