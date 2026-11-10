import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {createBusinessSignLayer} from '../city-explorer/business-signs.js';

const id = 'way/1006594168', profile = addRouteLandmarkAppearances({})[id];
const source = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const way = source.elements.find(value => value.type === 'way' && `way/${value.id}` === id);
const project = (lat, lon) => ({x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), z: -(lat - 44.3091) * 110540});
const ring = way.geometry.slice(0, -1).map(p => project(p.lat, p.lon));
const frame = frontageFrame({profile, ring, project});
function render({lite = false, unavailable, failText} = {}) {
  const original = globalThis.document, drawn = [], fills = [], loads = [];
  const document = {createElement() {
    const canvas = {width: 0, height: 0, texts: []};
    const context = {font: '10px sans-serif',
      fillRect(...args) { fills.push(args); },
      fillText(text) { if (text === failText) throw new Error('text drawing unavailable'); canvas.texts.push(text); drawn.push(text); },
      measureText(text) {
        const pixels = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 46), width = text.length * pixels * .6;
        return {width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width, actualBoundingBoxAscent: pixels * .73, actualBoundingBoxDescent: 0};
      },
    };
    canvas.getContext = () => unavailable === 'context' ? null : context;
    return canvas;
  }};
  class Loader { load(...args) { loads.push(args); } }
  let group;
  globalThis.document = unavailable === 'document' ? undefined : document;
  try { group = createFootageFacade({THREE: {...THREE, TextureLoader: Loader}, profile, ring, base: 0, top: 4.2, project, lite}); }
  finally { if (original === undefined) delete globalThis.document; else globalThis.document = original; }
  const planes = []; group.traverse(node => { if (node.isMesh && node.material?.map) planes.push(node); });
  return {group, planes, drawn, fills, loads};
}
function layerFor(signs) {
  const rows = ['Thrive Health', "PJ's Diner"].map((name, index) => ({id: `test-photo-tenant-${index}`, name,
    buildingSourceId: id, placementStatus: 'approved', placementMode: 'street-facing-wall',
    frontage: profile.frontLatLon, frontageIndex: 0, fraction: .5, openingTopMetres: 3.9}));
  return createBusinessSignLayer({THREE, parent: new THREE.Group(), project,
    generatedRegistry: {attachEditableGroup() {}}, profiles: {[id]: profile},
    features: [{sourceId: id, generatedId: id, properties: way.tags,
      sourceGeometry: [[way.geometry.map(p => [p.lon, p.lat])]], partHeights: [{base: 0, wallTop: 4.2}], minY: 0, maxY: 4.3}],
    directory: {businesses: rows}, renderedSignsBySourceId: new Map([[id, signs]]),
    canvasFactory: () => ({width: 0, height: 0, getContext: () => ({fillRect() {}, strokeRect() {}, fillText() {}, measureText: text => ({width: text.length * 12})})}),
  });
}

test('Thrive source lettering is split across the two real glazing fields without a board or catalogue alias', () => {
  assert.deepEqual(profile.appliedLettering.fields.map(field => field.text), ['THRIVE', 'HEALTH', 'PTBO']);
  assert.equal(profile.appliedLettering.businessName, 'Thrive Health');
  assert.equal(profile.signText, null);
  assert.equal(profile.additionalFrontages, undefined, 'separate lettering fields do not invent frontage edges');
  for (const [index, field] of profile.appliedLettering.fields.entries()) {
    const left = field.fraction - field.widthMetres / (2 * frame.length), right = field.fraction + field.widthMetres / (2 * frame.length);
    assert.ok(index === 0 ? left > .05 && right < .47 : left > .53 && right < .95, 'maximum field bounds avoid the central pier');
    assert.ok(field.heightMetres - field.panelHeightMetres / 2 > 1.46, 'letters stay above the lower green screening');
    assert.ok(field.heightMetres + field.panelHeightMetres / 2 < 3.95, 'letters stay below the top frame');
  }
});

test('all three Thrive fields actually attach within their glass bounds in Balanced and Lite', () => {
  for (const lite of [false, true]) {
    const {group, planes, drawn, fills, loads} = render({lite});
    assert.deepEqual(drawn, ['THRIVE', 'HEALTH', 'PTBO']);
    assert.equal(planes.length, 3);
    assert.deepEqual(fills, [], 'transparent canvases do not draw opaque panels');
    assert.deepEqual(loads, [], 'the lettering adds no photo downloads');
    const signs = group.userData.renderedSigns;
    assert.equal(signs.length, 1, 'one complete photographed identity is advertised');
    assert.equal(signs[0].sourceId, id); assert.equal(signs[0].frontageIndex, 0);
    assert.equal(signs[0].name, 'Thrive Health'); assert.equal(signs[0].text, 'THRIVE HEALTH PTBO');
    assert.equal(signs[0].kind, 'applied-lettering-group');
    assert.deepEqual(signs[0].frontage, profile.frontLatLon);
    assert.deepEqual(signs[0].fragments.map(fragment => fragment.text), drawn);
    for (const plane of planes) {
      const text = plane.material.map.image.texts[0], index = drawn.indexOf(text), field = profile.appliedLettering.fields[index];
      assert.equal(plane.material.transparent, true);
      const along = (plane.position.x - frame.start.x) * frame.tangent.x + (plane.position.z - frame.start.z) * frame.tangent.z;
      const out = (plane.position.x - frame.start.x) * frame.outward.x + (plane.position.z - frame.start.z) * frame.outward.z;
      const {width, height} = plane.geometry.parameters, left = (along - width / 2) / frame.length, right = (along + width / 2) / frame.length;
      assert.ok(index === 0 ? left > .05 && right < .47 : left > .53 && right < .95, `${text}: actual plane remains in its glazed half`);
      assert.ok(width <= field.widthMetres && height <= field.panelHeightMetres);
      assert.ok(plane.position.y - height / 2 > 1.46 && plane.position.y + height / 2 < 3.95);
      assert.ok(out > .24 && out < .30, `${text}: ahead of glass, behind the structural mullions`);
      assert.ok(Math.abs(out - .255) < 1e-6);
    }
    const layer = layerFor(signs);
    assert.equal(layer.stats().existingProfileSigns, 1);
    assert.deepEqual(layer.samples().filter(row => row.existingProfileSign).map(row => row.name), ['Thrive Health']);
    assert.ok(layer.rejected().some(row => row.id === 'test-photo-tenant-1'), "the unrelated PJ's Diner identity is not an alias of the photographed lettering");
    layer.dispose();
  }
});

test('missing canvas or one failed Thrive fragment cannot suppress a directory identity as a complete replacement', () => {
  for (const options of [{unavailable: 'document'}, {unavailable: 'context'}, {failText: 'HEALTH'}]) {
    const {group} = render(options);
    assert.deepEqual(group.userData.renderedSigns, []);
    const layer = layerFor(group.userData.renderedSigns);
    assert.equal(layer.stats().existingProfileSigns, 0);
    assert.equal(layer.samples().some(row => row.existingProfileSign), false);
    assert.equal(layer.rejected().length, 2, 'fallbacks fail only their real glazing/height clearance, never a fictitious rendered replacement');
    layer.dispose();
  }
});
