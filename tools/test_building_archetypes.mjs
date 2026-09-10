import assert from 'node:assert/strict';
import { buildingFacadePlan, classifyBuildingArchetype } from '../city-explorer/building-archetypes.js';

const kinds = { house: 'residential', apartments: 'apartment', retail: 'storefront', warehouse: 'industrial', school: 'civic', shed: 'ancillary' };
const base = { featureId: 'way/123', edgeLength: 24, wallHeight: 12, footprintArea: 350, front: true };
for (const [building, expected] of Object.entries(kinds)) {
  assert.equal(classifyBuildingArchetype({ building }, 12, 350), expected);
  for (const lite of [false, true]) {
    for (const edgeLength of [0, 2.3, 3, 9, 24, 160]) {
      for (const wallHeight of [0, 2.4, 3.2, 6, 12, 110]) {
        const input = { ...base, tags: { building }, edgeLength, wallHeight, lite };
        const plan = buildingFacadePlan(input);
        assert.deepEqual(plan, buildingFacadePlan(input), 'generation is repeatable');
        assert.ok(plan.panels.length <= (lite ? 24 : 80));
        if (expected === 'ancillary') assert.equal(plan.panels.length, 0);
        for (const panel of plan.panels) {
          for (const name of ['t', 'width', 'lowerY', 'upperY', 'offset']) assert.ok(Number.isFinite(panel[name]));
          assert.ok(panel.t * edgeLength - panel.width / 2 >= 0);
          assert.ok(panel.t * edgeLength + panel.width / 2 <= edgeLength);
          assert.ok(panel.lowerY >= 0 && panel.upperY <= wallHeight && panel.upperY > panel.lowerY);
        }
      }
    }
  }
}
assert.equal(classifyBuildingArchetype({ building: 'house' }, 40, 900), 'residential', 'explicit house tag wins over size inference');
assert.equal(classifyBuildingArchetype({ building: 'yes', amenity: 'fire_station' }), 'civic');
assert.equal(classifyBuildingArchetype({ building: 'yes', shop: 'bakery' }), 'storefront');
assert.equal(buildingFacadePlan({ ...base, front: false }).panels.some((p) => p.kind === 'door'), false);
assert.equal(buildingFacadePlan(base).panels.filter((p) => p.kind === 'door').length, 1);
assert.ok(buildingFacadePlan(base).panels.some((p) => p.kind === 'cornice' && p.upperY - p.lowerY < 0.35));
const plans = Object.keys(kinds).filter((kind) => kind !== 'shed').map((building) => buildingFacadePlan({ ...base, tags: { building } }));
assert.equal(new Set(plans.map((plan) => JSON.stringify(plan.panels))).size, 5, 'archetypes have distinct layouts');
const oneFloor = buildingFacadePlan({ ...base, tags: { building: 'apartments', 'building:levels': '1' } });
assert.ok(oneFloor.panels.filter((p) => p.kind === 'window').every((p) => p.lowerY < 3), 'mapped floor count wins');
assert.deepEqual(buildingFacadePlan({ ...base, edgeLength: NaN }).panels, []);
assert.deepEqual(buildingFacadePlan({ ...base, wallHeight: Infinity }).panels, []);
console.log(JSON.stringify({ status: 'pass', archetypes: 6, deterministic: true, boundedPanels: true, liteCap: 24, fullCap: 80 }));
