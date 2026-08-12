import assert from 'node:assert/strict';
import { OfficialDrivableSurfaceIndex, officialSurfaceStatusActive } from '../city-explorer/official-road-surfaces.js';

const index = new OfficialDrivableSurfaceIndex(10);
index.add([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], { id: 'road', layer: 'road_surfaces' });
index.add([[{ x: 12, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }, { x: 12, y: 8 }]], { id: 'lot', layer: 'parking_surfaces' });
assert.equal(index.query(4, 4)?.drivable, true);
assert.equal(index.query(15, 4)?.parking, true);
assert.equal(index.query(15, 4, { includeParking: false }), null);
assert.equal(index.query(30, 30), null);
assert.equal(officialSurfaceStatusActive('ACTV'), true);
assert.equal(officialSurfaceStatusActive('RMVD'), false);
assert.equal(officialSurfaceStatusActive('PROP'), false);
console.log(JSON.stringify({ status: 'pass', authoritativePavementQueries: true, proposedAndRemovedExcluded: true }));
