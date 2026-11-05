import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStationHeightRecord } from '../city-explorer/multiplayer/station-height-record.mjs';

const record=()=>({schemaVersion:1,worldVersion:'a'.repeat(24),roadPackBuildId:'b'.repeat(20),stations:[{number:1,datum:10.1,groundMin:8.2},{number:2,datum:20.1,groundMin:19.8}]});
test('accepts exactly the two finite versioned station height records',()=>{const result=validateStationHeightRecord(record(),{worldVersion:'a'.repeat(24),roadPackBuildId:'b'.repeat(20)});assert.equal(result.stations[1].datum,10.1);assert.equal(result.stations[2].groundMin,19.8);});
test('rejects stale world and road pack identities',()=>{assert.throws(()=>validateStationHeightRecord(record(),{worldVersion:'c'.repeat(24),roadPackBuildId:'b'.repeat(20)}),/world version/);assert.throws(()=>validateStationHeightRecord(record(),{worldVersion:'a'.repeat(24),roadPackBuildId:'d'.repeat(20)}),/road pack/);});
test('rejects missing, duplicate, or nonfinite station heights',()=>{const missing=record();missing.stations.pop();assert.throws(()=>validateStationHeightRecord(missing),/stations/);const duplicate=record();duplicate.stations[1].number=1;assert.throws(()=>validateStationHeightRecord(duplicate),/station numbers/);const invalid=record();invalid.stations[0].datum=NaN;assert.throws(()=>validateStationHeightRecord(invalid),/finite/);});