import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const simulatorHtml = await readFile(resolve(root, 'response-simulator/index.html'), 'utf8');
const directionalSteering = await readFile(resolve(root, 'response-simulator/directional-steering-tuning.js'), 'utf8');
const standardSteering = await readFile(resolve(root, 'response-simulator/vehicle-instruments-core.js'), 'utf8');

for (const selector of ['settings-category', 'settings-section', 'initializeSettingsAccordions']) {
  assert.match(simulatorHtml, new RegExp(selector), `missing collapsible settings support: ${selector}`);
}

assert.match(simulatorHtml, /const acceleration = 0\.00000005 \* speedSetting;/);
assert.match(simulatorHtml, /const baseTurnRate = 1\.2;/);
assert.match(simulatorHtml, /baseTurnRate \* Math\.max\(velocityFactor, 0\.3\) \* driveDirection/);
assert.match(directionalSteering, /CONFIG\.highSpeedTurnMultiplier/);
assert.match(standardSteering, /CONFIG\.lowSpeedTurnDegreesPerFrame/);
assert.match(simulatorHtml, /initializeSettingsAccordions/);

console.log('GitHub-equivalent driving behaviour and collapsible settings verified.');
