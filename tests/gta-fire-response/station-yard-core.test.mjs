import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStationYardZone, stationYardContainsXY } from '../../gta-fire-response/src/station-yard-safe-zone.js';

test('station yard permits turning room and a wide driveway but not general off-road travel', () => {
  const zone = {
    stationYard:true, ax:0, ay:0, bx:70, by:0, dx:70, dy:0, lengthSq:4900,
    yardRadius:42, corridorHalfWidth:14, corridorStartPadding:.12, corridorEndPadding:.22,
    roadConnected:true
  };
  assert.equal(stationYardContainsXY(zone, 24, 26), true, 'apparatus apron should be free-driving');
  assert.equal(stationYardContainsXY(zone, 60, 12), true, 'driveway connector should remain drivable');
  assert.equal(stationYardContainsXY(zone, 60, 19), false, 'grass outside the driveway should remain blocked');
  assert.equal(stationYardContainsXY(zone, -55, 0), false, 'the exemption must not extend behind the hall indefinitely');
});

test('station yard remains usable when road data has no nearby connector', () => {
  const roads = {
    xy: () => ({ x:100, y:200 }),
    pointInfoXY: () => ({ nearest:null, drivable:false })
  };
  const zone = buildStationYardZone(roads, { lat:44, lng:-78 }, 'station-3');
  assert.equal(zone.stationId, 'station-3');
  assert.equal(zone.roadConnected, false);
  assert.equal(stationYardContainsXY(zone, 128, 220), true);
  assert.equal(stationYardContainsXY(zone, 150, 200), false);
});

test('station yard connects to the nearest mapped road and records measurable dimensions', () => {
  const roads = {
    xy: () => ({ x:10, y:20 }),
    pointInfoXY: () => ({ nearest:{ x:82, y:20, distance:72 }, drivable:false })
  };
  const zone = buildStationYardZone(roads, { lat:44, lng:-78 }, 'station-1');
  assert.equal(zone.roadConnected, true);
  assert.equal(zone.yardRadius, 42);
  assert.equal(zone.corridorHalfWidth, 14);
  assert.equal(zone.length, 72);
  assert.equal(stationYardContainsXY(zone, 75, 32), true);
});
