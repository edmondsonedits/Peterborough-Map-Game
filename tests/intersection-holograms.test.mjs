import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createIntersectionHologramLayer, INTERSECTION_HOLOGRAM_STYLE } from '../city-explorer/intersection-holograms.js';

function segment(name, a, b) {
  return { name, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] },
    width: 8, aY: 0, bY: 0, aSourceVertex: true, bSourceVertex: true,
    tags: { name, highway: 'residential', layer: '0' }, profile: { highway: 'residential', width: 8 } };
}

function junctionAt(x = 0, z = -30) {
  return [segment('Main Street', [x - 8, z], [x, z]),
    segment('Main Street', [x, z], [x + 8, z]),
    segment('Cross Road', [x, z], [x, z - 8])];
}

function canvasFactory(canvases = []) {
  return () => {
    const calls = [];
    const context = {
      setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, stroke() {}, measureText: text => ({ width: String(text).length * 12 }),
      fillText: text => calls.push(String(text)),
    };
    const canvas = { width: 0, height: 0, getContext: () => context, calls };
    canvases.push(canvas);
    return canvas;
  };
}

function makeCamera({ x = 0, y = INTERSECTION_HOLOGRAM_STYLE.hoverMetres, z = 0,
  lookX = 0, lookY = y, lookZ = -30, aspect = 1 } = {}) {
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  camera.position.set(x, y, z);
  camera.lookAt(lookX, lookY, lookZ);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

test('uses a fixed pool of camera-facing sprites and keeps travel heading through camera lookaround', () => {
  const canvases = [];
  const layer = createIntersectionHologramLayer({ THREE, segments: junctionAt(), canvasFactory: canvasFactory(canvases) });
  const camera = makeCamera();
  assert.equal(layer.group.children.length, 3);
  assert.ok(layer.group.children.every(sprite => sprite instanceof THREE.Sprite));
  assert.ok(layer.group.children.every(sprite => sprite.userData.decorative && sprite.userData.collision === false));
  assert.equal(layer.stats().poolSize, 3);

  const driveHeading = { x: 1, z: 0 };
  for (const lookX of [-4, 0, 4]) {
    camera.lookAt(lookX, INTERSECTION_HOLOGRAM_STYLE.hoverMetres, -30);
    camera.updateMatrixWorld(true);
    layer.update(camera, { heading: driveHeading, position: { x: 0, y: 0, z: 0 } });
    assert.equal(layer.stats().visible[0]?.currentStreet, 'Main Street');
    assert.equal(layer.stats().visible[0]?.text, 'Cross Road');
  }
  assert.deepEqual(canvases[0].calls, ['Cross Road']);
  assert.equal(layer.group.children.length, 3, 'updates reuse the same sprite pool');
  layer.dispose();
});

test('switches the displayed street after a turn reaches its heading midpoint', () => {
  const layer = createIntersectionHologramLayer({ THREE, segments: junctionAt(), canvasFactory: canvasFactory() });
  const camera = makeCamera();
  const position = { x: 0, y: 0, z: 0 };
  layer.update(camera, { heading: { x: 1, z: 0 }, position });
  assert.equal(layer.stats().visible[0].text, 'Cross Road');
  layer.update(camera, { heading: { x: 0.65, z: 0.76 }, position });
  assert.equal(layer.stats().visible[0].currentStreet, 'Cross Road');
  assert.equal(layer.stats().visible[0].text, 'Main Street');
  layer.dispose();
});

test('hides labels in map mode and above the low-altitude display limit', () => {
  const layer = createIntersectionHologramLayer({ THREE, segments: junctionAt(), canvasFactory: canvasFactory() });
  const camera = makeCamera();
  layer.update(camera, { mode: 'map', position: { x: 0, y: 0, z: 0 }, heading: { x: 1, z: 0 } });
  assert.equal(layer.group.visible, false);
  assert.deepEqual(layer.stats().visible, []);
  layer.update(camera, { mode: 'fly', altitude: 90, position: { x: 0, y: 0, z: 0 }, heading: { x: 1, z: 0 } });
  assert.equal(layer.group.visible, false);
  assert.deepEqual(layer.stats().visible, []);
  layer.update(camera, { mode: 'fly', altitude: 89.9, position: { x: 0, y: 0, z: 0 }, heading: { x: 1, z: 0 } });
  assert.equal(layer.group.visible, true);
  assert.equal(layer.stats().visible.length, 1);
  layer.dispose();
});

test('clamps billboard width to the visible viewport at close range', () => {
  const layer = createIntersectionHologramLayer({ THREE, segments: junctionAt(0, -5), canvasFactory: canvasFactory() });
  const camera = makeCamera({ lookZ: -5, aspect: 0.35 });
  layer.update(camera, { heading: { x: 1, z: 0 }, position: { x: 0, y: 0, z: 0 } });
  const visible = layer.stats().visible[0];
  assert.ok(visible);
  assert.ok(visible.width < INTERSECTION_HOLOGRAM_STYLE.widthMetres);
  assert.equal(layer.group.children[0].scale.x, visible.width);
  layer.dispose();
});

test('keeps the label pool bounded, rejects overlapping distant names, and has no physical collision', () => {
  const roads = [];
  for (let index = 2; index <= 10; index += 1) roads.push(...junctionAt(0, -index * 10));
  const layer = createIntersectionHologramLayer({ THREE, segments: roads, canvasFactory: canvasFactory() });
  layer.update(makeCamera({ lookZ: -50 }), { heading: { x: 1, z: 0 }, position: { x: 0, y: 0, z: 0 } });
  assert.equal(layer.stats().intersections, 9);
  assert.equal(layer.stats().poolSize, 3);
  assert.ok(layer.stats().visible.length <= 3);
  assert.equal(layer.stats().visible.length, 1, 'screen-overlapping labels collapse to the nearest junction');
  assert.equal(layer.group.userData.collision, false);
  assert.equal(layer.stats().collision, false);
  assert.ok(layer.group.children.every(sprite => sprite.userData.collision === false));
  layer.dispose();
});
