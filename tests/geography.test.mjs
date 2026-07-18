import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../shared/geography.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const { stations, locations, validateGeography } = context.window.PeterboroughGeography;

assert.equal(stations.length, 3);
assert.equal(new Set(stations.map((station) => station.id)).size, stations.length);
assert.equal(new Set(locations.map((location) => location.id)).size, locations.length);
assert.equal(locations.filter((location) => location.cityTen).length, 10);
assert.ok(locations.every((location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude)));
assert.ok(locations.every((location) => location.targetRadiusMeters > 0));
assert.doesNotThrow(validateGeography);
