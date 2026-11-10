import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Documentation integrity, not a claim to infer every state from JavaScript.
const root = fileURLToPath(new URL('../', import.meta.url));
const inventory = JSON.parse(readFileSync(new URL('../docs/architecture/state-machines.json', import.meta.url), 'utf8'));
const ids = new Set(), counts = { implicit: 0, mixed: 0, explicit: 0 }, errors = [];
const sourceCache = new Map();
const validPath = path => {
  if (typeof path !== 'string' || !path || isAbsolute(path)) return false;
  const local = relative(root, resolve(root, path));
  return local !== '..' && !local.startsWith('../') && !isAbsolute(local);
};
const exists = path => validPath(path) && (() => { try { return statSync(resolve(root, path)).isFile(); } catch { return false; } })();
if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.machines)) throw new Error('Unsupported state inventory schema');
if (!/^[a-f0-9]{40}$/.test(inventory.baselineCommit)) errors.push('Missing baseline commit');
if (!inventory.machines.length) errors.push('Inventory is empty');
for (const machine of inventory.machines) {
  const id = machine.id;
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) errors.push(`Invalid or duplicate ID: ${id}`);
  ids.add(id);
  for (const key of ['name', 'domain']) if (typeof machine[key] !== 'string' || !machine[key].trim()) errors.push(`${id}: missing ${key}`);
  if (!Object.hasOwn(counts, machine.representation)) errors.push(`${id}: unknown representation`);
  else counts[machine.representation]++;
  for (const key of ['states', 'events', 'authority', 'invariants']) {
    if (!Array.isArray(machine[key]) || !machine[key].length || machine[key].some(value => typeof value !== 'string' || !value.trim())) errors.push(`${id}: invalid ${key}`);
  }
  if (!Array.isArray(machine.inspect) || machine.inspect.some(value => typeof value !== 'string' || !value.trim())) errors.push(`${id}: invalid inspect API list`);
  if (!Array.isArray(machine.sources) || !machine.sources.length) errors.push(`${id}: no source anchors`);
  for (const source of machine.sources || []) {
    if (!exists(source.path)) { errors.push(`${id}: missing source ${source.path}`); continue; }
    if (!sourceCache.has(source.path)) sourceCache.set(source.path, readFileSync(resolve(root, source.path), 'utf8'));
    if (typeof source.anchor !== 'string' || !source.anchor.trim() || !sourceCache.get(source.path).includes(source.anchor)) errors.push(`${id}: stale anchor in ${source.path}: ${source.anchor}`);
  }
  if (!Array.isArray(machine.tests)) errors.push(`${id}: missing related-test list (use [] for no established coverage)`);
  for (const path of machine.tests || []) if (!exists(path)) errors.push(`${id}: missing related test ${path}`);
  if (machine.followUp !== null && typeof machine.followUp !== 'string') errors.push(`${id}: followUp must be text or null`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`State inventory valid: ${ids.size} workflows (${counts.implicit} implicit, ${counts.mixed} mixed, ${counts.explicit} explicit); ${sourceCache.size} source files. Anchors and test paths exist; semantic coverage requires review.`);
}
