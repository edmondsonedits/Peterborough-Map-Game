'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'response-simulator/incident-formatting-1.6.44.js'), 'utf8');

function formatter() {
  const c = vm.createContext({
    console,
    URL,
    location: { href: 'https://example.test/response-simulator/index.html' },
    document: {
      body: null,
      currentScript: { src: 'https://example.test/response-simulator/incident-formatting-1.6.44.js' },
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; },
      createTextNode(value) { return { nodeType: 3, nodeValue: String(value) }; },
    },
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval() { return 1; },
    clearInterval() {},
    addEventListener() {},
  });
  c.window = c;
  vm.runInContext(source, c, { filename: 'incident-formatting-1.6.44.js' });
  return c.PTBO_INCIDENT_FORMAT;
}

test('sensitive named businesses remain geographic landmarks without implying an inside-business incident', () => {
  const api = formatter();
  const result = api.formatIncident({
    main: 'Medical',
    sub: 'Rectal Bleed / Gastrointestinal Emergency',
    name: 'Boston Pizza Dining Facility',
    addr: '1164 Chemong Rd',
  });
  assert.equal(result.displayName, 'Outside / near Boston Pizza');
  assert.equal(result.address, '1164 Chemong Rd');
  assert.equal(result.landmarkReference, true);
  assert.equal(result.simulated, true);
});

test('sensitive residential descriptors are neutralized while the training address remains available', () => {
  const api = formatter();
  const result = api.formatIncident({
    main: 'Medical',
    sub: 'Lift Assist / Public Service',
    name: 'Parkhill West Single-Family Residence',
    addr: '1180 Parkhill Rd W',
  });
  assert.equal(result.displayName, 'Residential address');
  assert.equal(result.address, '1180 Parkhill Rd W');
  assert.equal(result.residential, true);
});

test('non-sensitive fire calls keep their real location wording unchanged', () => {
  const api = formatter();
  const result = api.formatIncident({
    main: 'Fire',
    sub: 'Structure Fire',
    name: 'Lansdowne Place Mall',
    addr: '645 Lansdowne St W',
  });
  assert.equal(result.displayName, 'Lansdowne Place Mall');
  assert.equal(result.sensitive, false);
});

test('spoken dispatch uses the same safe location wording as the HUD', () => {
  const api = formatter();
  const incident = {
    sub: 'Unconscious Patient / Substance Overdose',
    name: 'Hunter Street Cafe Restroom',
    addr: '130 Hunter St W',
  };
  const phrase = 'Ambulance crew, respond to Hunter Street Cafe Restroom, 130 Hunter St W, for Unconscious Patient / Substance Overdose.';
  const spoken = api.formatSpeech(phrase, incident);
  assert.match(spoken, /respond to outside or near Hunter Street Cafe, 130 Hunter St W/i);
  assert.doesNotMatch(spoken, /Cafe Restroom/);
});

test('future history presentation uses the centralized display policy without copying source-name internals', () => {
  const api = formatter();
  const history = api.formatForHistory({
    main: 'Medical',
    sub: 'Request for Access / Wellness Check',
    name: 'Central City Residential Structure',
    addr: '612 Stewart St',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(history)), {
    displayName: 'Residential address',
    address: '612 Stewart St',
    category: 'Medical',
    subtype: 'Request for Access / Wellness Check',
    simulated: true,
    landmarkReference: false,
  });
  assert.equal(Object.hasOwn(history, 'sourceName'), false);
});
