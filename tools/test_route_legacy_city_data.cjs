#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const contains = (bounds, point) => point.lat >= bounds[0][0] && point.lat <= bounds[1][0]
  && point.lng >= bounds[0][1] && point.lng <= bounds[1][1];

for (const [city, fireCount, emsCount, seedCount, bounds] of [
  ['belleville', 5, 2, 8, [[44.12, -77.50], [44.37, -77.23]]],
  ['scarborough', 17, 12, 12, [[43.66, -79.355], [43.87, -79.10]]],
]) {
  const pack = read(`cities/${city}/geo-data.json`);
  const manifest = read(`cities/${city}/city.json`);
  assert.equal(pack.schemaVersion, 1);
  assert.equal(pack.id, city);
  assert.deepEqual(pack.map.bounds, bounds);
  assert.deepEqual(manifest.map.bounds, bounds);
  assert.equal(manifest.data.bases, 'geo-data.json');
  assert.equal(manifest.features.geoGuesser, false, `${city}: route data must not enable Geo Guesser`);
  assert.equal(new Set(pack.bases.map(base => base.id)).size, pack.bases.length);
  const active = pack.bases.filter(base => base.status === 'active' && base.selectionEligible === true);
  assert.equal(active.filter(base => base.service === 'fire').length, fireCount);
  assert.equal(active.filter(base => base.service === 'ems').length, emsCount);
  for (const service of ['fire', 'ems']) {
    const numbers = active.filter(base => base.service === service).map(base => base.number);
    assert.equal(new Set(numbers).size, numbers.length, `${city}: selection numbers must be unique within a service`);
  }
  for (const base of pack.bases) {
    assert.ok(base.id.startsWith(`${city}-${base.service}-`), base.id);
    assert.ok(base.name && base.address && base.facilityRole && base.notes, base.id);
    assert.match(base.sourceUrl, /^https:\/\//, base.id);
    assert.equal(typeof base.officialNumber, 'string', base.id);
    if (base.status !== 'active') assert.equal(base.selectionEligible, false, base.id);
  }
  for (const base of active) {
    assert.ok(Number.isFinite(base.lat) && Number.isFinite(base.lng), base.id);
    assert.ok(contains(bounds, base), `${base.id}: coordinate outside city pack bounds`);
  }
  for (let number = 1; number <= seedCount; number++) {
    const call = pack.locations.find(location => location.id === `${city}-call-${number}`);
    assert.ok(call, `${city}: missing original shared civic seed ${number}`);
    assert.ok(call.name && /^\d/.test(call.addr), call.id);
    assert.equal(call.recognitionDifficulty, null, `${call.id}: recognition must await local review`);
    assert.equal(call.radius, 45, `${call.id}: target needs a concrete arrival area`);
    assert.equal(call.custom, false, call.id);
    assert.ok(contains(bounds, call), call.id);
    assert.ok(new Set(call.crossStreets).size >= 2, call.id);
    assert.ok(call.sources.length >= 2 && call.sources.every(source => /^https:\/\//.test(source)), call.id);
    assert.ok(!Object.hasOwn(call, 'service'), `${call.id}: civic targets are shared across services`);
    assert.match(call.difficultyReason, /[Uu]nranked/);
  }
}

const belleville = read('cities/belleville/geo-data.json');
const farley = belleville.bases.find(base => base.id === 'belleville-ems-01');
assert.equal(farley.address, '38 Farley Ave, Belleville, ON');
assert.equal(farley.lat, 44.16680243665393);
assert.equal(farley.lng, -77.3491454191396);
assert.ok(Math.abs(farley.lat - 44.174613) > 0.007, 'Farley must not revert to the old northern fallback');

let legacyConfig;
const packageSource = fs.readFileSync(path.join(root, 'cities/belleville/package.js'), 'utf8');
vm.runInNewContext(packageSource, {
  URL,
  document: { currentScript: { src: 'http://localhost/cities/belleville/package.js' } },
  location: { href: 'http://localhost/' },
  window: { PTBO_PREVIEW_CITY_FACTORY: { version: '1.6.13', create: config => { legacyConfig = config; } } },
});
assert.ok(legacyConfig);
assert.equal(legacyConfig.sources.fire.type, 'static');
assert.ok(!packageSource.includes('Fire_Stations_Proposed'), 'Hypothetical fire locations must not be a live base source');
for (const service of ['fire', 'ems']) {
  const entries = legacyConfig.sources[service].entries;
  for (const entry of entries) {
    const base = belleville.bases.find(candidate => candidate.service === service && candidate.number === entry.number);
    assert.ok(base, `Missing canonical ${service} ${entry.number}`);
    assert.equal(entry.lat, base.lat, `${base.id}: legacy latitude differs from canonical data`);
    assert.equal(entry.lng, base.lng, `${base.id}: legacy longitude differs from canonical data`);
  }
}

const scarborough = read('cities/scarborough/geo-data.json');
assert.deepEqual(scarborough.bases.filter(base => base.service === 'fire' && base.selectionEligible)
  .map(base => base.number).sort((a, b) => a - b),
[211, 212, 213, 214, 215, 221, 222, 223, 225, 231, 232, 234, 241, 242, 243, 244, 245]);
for (const excluded of [224, 226, 227, 233, 235]) {
  assert.ok(!scarborough.bases.some(base => base.service === 'fire' && base.number === excluded),
    `Command-district station ${excluded} is outside the Scarborough municipality subset`);
}
const service26 = scarborough.bases.filter(base => base.service === 'ems' && base.officialNumber === '26');
assert.equal(service26.length, 2, 'Station 26 and post 26 are separate operational facilities');
assert.equal(new Set(service26.map(base => base.address)).size, 2);
const planned = scarborough.bases.filter(base => base.status === 'planned');
assert.deepEqual(planned.map(base => base.id).sort(), ['scarborough-ems-mfs-02', 'scarborough-ems-post-04']);
assert.ok(planned.every(base => base.selectionEligible === false));
for (const base of planned) {
  const project = scarborough.constructionProjects.find(project => project.linkedBaseId === base.id);
  assert.ok(project, `${base.id}: preserve public future-project information`);
  assert.equal(project.status, 'planned');
}
console.log('Legacy route city data verified: Belleville 7 active + 8 shared seeds; Scarborough 29 active + 2 planned + 12 shared seeds.');
