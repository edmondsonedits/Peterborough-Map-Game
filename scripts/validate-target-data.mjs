import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const dispatchSource = await readFile(resolve(root, 'shared/dispatch-data-1.4.4.js'), 'utf8');
const targetSource = await readFile(resolve(root, 'shared/simulator-targets.js'), 'utf8');
const payload = dispatchSource.match(/const PAYLOAD = '([^']+)'/)?.[1];
if (!payload) throw new Error('Dispatch data payload was not found.');
const calls = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
const context = { window: {} };
vm.runInNewContext(targetSource, context, { filename: 'simulator-targets.js' });
const targets = context.window.PTBO_SIMULATOR_TARGETS;
if (!targets || typeof targets !== 'object') throw new Error('Simulator target map did not load.');

const normalizeText = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyText = value => normalizeText(value).toLowerCase().replace(/[â€™']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = text => keyText(text).replace(/\s+/g, '-').slice(0, 48) || 'location';
function hash(text) { let value = 2166136261; for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 16777619); } return (value >>> 0).toString(36); }
function id(location) { return `call-${slug(location.name)}-${hash([location.main, location.sub, location.name, location.addr].map(keyText).join('|'))}`; }

for (const call of calls) {
  const target = targets[id(call)];
  if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng) || !Number.isFinite(target.radius) || target.radius < 10) {
    throw new Error(`Invalid simulator target for ${call.name}.`);
  }
}
if (Object.keys(targets).length !== calls.length) throw new Error('Simulator target count does not match dispatch calls.');
console.log(`Validated ${calls.length} dual target records.`);
