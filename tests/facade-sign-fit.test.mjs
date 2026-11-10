import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createFootageFacade } from '../city-explorer/sherbrooke-footage.js';

const ring = [{ x: 0, z: 0 }, { x: 24, z: 0 }, { x: 24, z: 10 }, { x: 0, z: 10 }];
const profile = { id: 'fixture-sign', label: 'Sign fixture', confidence: 'observed', style: 'canopy',
  blankFacade: true, entryDoor: null, frontLatLon: [{ lat: 0, lon: 0 }, { lat: 0, lon: 24 }],
  signHeightMetres: 3, signBoardHeightMetres: .4, signWidthMetres: 2.8,
  signText: 'KFC', signFont: '700 46px Arial,sans-serif' };
const measuredAt = (text, font) => {
  const pixels = Number(font.match(/([\d.]+)px/)[1]);
  const advance = [...text].reduce((sum, char) => sum + (/\s/.test(char) ? .28 : /[MW]/.test(char) ? .86 : /[ILil]/.test(char) ? .31 : .59), 0) * pixels;
  return { width: advance + .04 * pixels, actualBoundingBoxLeft: .02 * pixels,
    actualBoundingBoxRight: advance - .02 * pixels, actualBoundingBoxAscent: .73 * pixels, actualBoundingBoxDescent: .02 * pixels };
};
function render(changes = {}, { metrics = 'complete' } = {}) {
  const canvases = [], original = globalThis.document;
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0 }, calls = [];
    const context = { font: '10px sans-serif', fillRect() {}, fillText(text, x, y, maxWidth) { calls.push({ text, x, y, maxWidth, font: this.font, align: this.textAlign, baseline: this.textBaseline }); } };
    if (metrics !== 'absent') context.measureText = function (text) { const value = measuredAt(text, this.font); return metrics === 'complete' ? value : { width: value.width }; };
    canvas.getContext = () => context; canvas.calls = calls; canvases.push(canvas); return canvas;
  } };
  let group;
  try { group = createFootageFacade({ THREE, profile: { ...profile, ...changes }, ring, base: 0, top: 8, project: (lat, lon) => ({ x: lon, y: lat }) }); }
  finally { globalThis.document = original; }
  const meshes = []; group.traverse(node => { if (node.isMesh && node.material.map) meshes.push(node); });
  return { group, plane: meshes[0], canvas: canvases[0] };
}
function actualGlyph(result) {
  const { plane, canvas } = result, call = canvas.calls[0], bounds = measuredAt(call.text, call.font);
  return { width: (bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight) / canvas.width * plane.geometry.parameters.width,
    height: (bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent) / canvas.height * plane.geometry.parameters.height,
    pixelRatio: (bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight) / (bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent) };
}

test('short and wide observed names use their existing physical sign area without flattening letters', () => {
  for (const changes of [
    { signText: 'KFC', signWidthMetres: 2.8, signBoardHeightMetres: .4 },
    { signText: 'LITTLE CAESARS', signWidthMetres: 6.4, signBoardHeightMetres: .4 },
    { signText: 'Walmart', signWidthMetres: 14, signBoardHeightMetres: 1.5 },
    { signText: 'PIZZA PIZZA', signWidthMetres: 4, signBoardHeightMetres: .4 },
  ]) {
    const result = render(changes), glyph = actualGlyph(result);
    assert.ok(glyph.height >= changes.signBoardHeightMetres * .7, `${changes.signText}: useful ink height, got ${glyph.height.toFixed(4)}m`);
    assert.ok(Math.abs(glyph.width / glyph.height / glyph.pixelRatio - 1) < .025, `${changes.signText}: no geometric letter distortion`);
    assert.ok(result.plane.geometry.parameters.width <= changes.signWidthMetres && result.plane.geometry.parameters.height <= changes.signBoardHeightMetres);
    assert.equal(result.canvas.calls[0].maxWidth, undefined, 'Canvas must not horizontally squeeze glyphs');
    assert.ok(result.canvas.width <= 1024 && result.canvas.height <= 256);
  }
});

test('long names and italic overhang stay inside their physical sign bounds with measured centering', () => {
  const result = render({ signText: 'STARBUCKS COFFEE', signWidthMetres: 5.5, signBoardHeightMetres: .5, signFont: 'italic 700 46px Arial,sans-serif' });
  const call = result.canvas.calls[0], bounds = measuredAt(call.text, call.font), glyph = actualGlyph(result);
  assert.equal(call.align, 'left'); assert.equal(call.baseline, 'alphabetic');
  assert.ok(call.x - bounds.actualBoundingBoxLeft >= 0);
  assert.ok(call.x + bounds.actualBoundingBoxRight <= result.canvas.width);
  assert.ok(call.y - bounds.actualBoundingBoxAscent >= 0);
  assert.ok(call.y + bounds.actualBoundingBoxDescent <= result.canvas.height);
  assert.ok(glyph.width <= 5.5 && glyph.height <= .5);
  assert.ok(Math.abs(glyph.width / glyph.height / glyph.pixelRatio - 1) < .025);
});

test('incomplete Canvas metrics keep finite bounded fallback lettering', () => {
  for (const metrics of ['width-only', 'absent']) {
    const { plane, canvas, group } = render({}, { metrics });
    assert.ok(plane); assert.equal(group.userData.renderedSigns.length, 1);
    assert.ok([plane.geometry.parameters.width, plane.geometry.parameters.height, canvas.width, canvas.height].every(n => Number.isFinite(n) && n > 0));
    assert.ok(plane.geometry.parameters.width <= profile.signWidthMetres && plane.geometry.parameters.height <= profile.signBoardHeightMetres);
    assert.equal(group.userData.renderedSigns[0].textFit.metrics, 'estimated');
  }
});

test('applied lettering accepts a small wall outset while boarded signs retain their existing clearance', () => {
  const applied = render({ signStyle: 'applied', signOutsetMetres: .025 }), boarded = render({ signOutsetMetres: .025 });
  assert.ok(Math.abs(Math.abs(applied.plane.position.z) - .025) < 1e-9);
  assert.ok(Math.abs(Math.abs(boarded.plane.position.z) - .3) < 1e-9);
  const boards = []; applied.group.traverse(node => { if (node.isInstancedMesh) boards.push(node); });
  assert.equal(boards.length, 0); assert.equal(applied.plane.material.transparent, true);
});
