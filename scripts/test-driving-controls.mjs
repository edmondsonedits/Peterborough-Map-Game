import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const simulatorHtml = await readFile(resolve(root, 'response-simulator/index.html'), 'utf8');
const directionalSteering = await readFile(resolve(root, 'response-simulator/directional-steering-tuning.js'), 'utf8');
const standardSteering = await readFile(resolve(root, 'response-simulator/vehicle-instruments-core.js'), 'utf8');

for (const id of [
  'sld-acceleration',
  'sld-low-speed-steering',
  'sld-high-speed-steering',
  'sld-steering-response',
  'sld-steering-curve',
]) {
  assert.match(simulatorHtml, new RegExp(`id="${id}"`), `missing ${id}`);
}

const lowSpeedTurnDegreesPerSecond = 300;
const highSpeedTurnMultiplier = 0.18;
assert.ok(
  lowSpeedTurnDegreesPerSecond * highSpeedTurnMultiplier < lowSpeedTurnDegreesPerSecond,
  'high-speed steering must be softer than low-speed steering',
);

assert.match(simulatorHtml, /turnDegreesPerSecond = drivingControls\.lowSpeedTurnDegreesPerSecond/);
assert.match(directionalSteering, /controls\.highSpeedTurnMultiplier/);
assert.match(standardSteering, /drivingControls\.lowSpeedTurnDegreesPerSecond/);
assert.match(simulatorHtml, /initializeSettingsAccordions/);

console.log('Driving control defaults and collapsible settings verified.');
