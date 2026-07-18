import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../shared/game-utils.js", import.meta.url), "utf8");
const context = { window: {}, performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };
vm.runInNewContext(source, context);
const { chooseUniqueCalls } = context.window.PeterboroughGameUtils;
const pool = Array.from({ length: 12 }, (_, index) => ({ id: String(index), district: index % 3 + 1 }));

for (const requestedCount of [0, 1, 10, 20]) {
  const selected = chooseUniqueCalls(pool, requestedCount, 1, () => 0.4);
  assert.equal(new Set(selected.map((location) => location.id)).size, selected.length);
  assert.equal(selected.length, Math.min(requestedCount, pool.length));
}
assert.equal(chooseUniqueCalls([], 10, 1).length, 0);
