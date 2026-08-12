import assert from 'node:assert/strict';
import {
  clearLandCoverRaster,
  paintLandCoverPolygon,
  textureBoundsForRings,
  worldRingToTexture,
  worldToTexturePoint,
} from '../city-explorer/land-cover-raster.js';

class MockCanvasContext {
  constructor(width, height) {
    this.canvas = { width, height };
    this.commands = [];
  }

  save() { this.commands.push(['save']); }
  restore() { this.commands.push(['restore']); }
  beginPath() { this.commands.push(['beginPath']); }
  moveTo(x, y) { this.commands.push(['moveTo', x, y]); }
  lineTo(x, y) { this.commands.push(['lineTo', x, y]); }
  closePath() { this.commands.push(['closePath']); }
  fill(rule) { this.commands.push(['fill', rule]); }
  clearRect(x, y, width, height) { this.commands.push(['clearRect', x, y, width, height]); }

  set fillStyle(value) { this.commands.push(['fillStyle', value]); }
  set globalAlpha(value) { this.commands.push(['globalAlpha', value]); }
  set globalCompositeOperation(value) { this.commands.push(['globalCompositeOperation', value]); }
}

const extent = { minX: -100, minZ: -200, size: 400 };
const dimensions = { width: 800, height: 400 };

assert.deepEqual(
  worldToTexturePoint({ x: -100, y: -200 }, extent, dimensions),
  { x: 0, y: 0 },
  'northwest/minimum world corner must map to the canvas top-left',
);
assert.deepEqual(
  worldToTexturePoint({ x: 300, y: 200 }, extent, dimensions),
  { x: 800, y: 400 },
  'southeast/maximum world corner must map to the canvas bottom-right',
);
assert.deepEqual(
  worldToTexturePoint({ x: 100, y: 0 }, extent, dimensions),
  { x: 400, y: 200 },
  'world and texture centres must coincide',
);
assert.deepEqual(
  worldToTexturePoint({ x: -300, z: 400 }, extent, dimensions, { clampToTexture: true }),
  { x: 0, y: 400 },
  'optional clamping must constrain both axes to texture bounds',
);
assert.equal(worldToTexturePoint({ x: NaN, y: 0 }, extent, dimensions), null, 'invalid points must be rejected');

const outer = [
  { x: -100, y: -200 },
  { x: 300, y: -200 },
  { x: 300, y: 200 },
  { x: -100, y: 200 },
  { x: -100, y: -200 },
];
const hole = [
  { x: 0, y: -100 },
  { x: 0, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: -100 },
  { x: 0, y: -100 },
];
assert.equal(worldRingToTexture(outer, extent, dimensions).length, 4, 'duplicate GeoJSON closure must be removed');

const bounds = textureBoundsForRings([outer, hole], extent, dimensions);
assert.deepEqual(
  {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    intersectsTexture: bounds.intersectsTexture,
  },
  { minX: 0, minY: 0, maxX: 800, maxY: 400, intersectsTexture: true },
  'pixel bounds must cover the complete outer ring without reversing north/south',
);

const context = new MockCanvasContext(dimensions.width, dimensions.height);
const result = paintLandCoverPolygon(context, [outer, hole], {
  extent,
  fillStyle: '#5b7f36',
  opacity: 0.72,
  compositeOperation: 'source-over',
});
assert.equal(result.painted, true);
assert.equal(result.rings, 2, 'outer boundary and hole must share one canvas path');
assert.equal(result.vertices, 8);
assert.deepEqual(context.commands.slice(0, 5), [
  ['save'],
  ['fillStyle', '#5b7f36'],
  ['globalAlpha', 0.72],
  ['globalCompositeOperation', 'source-over'],
  ['beginPath'],
], 'the requested land-cover color and blend state must be applied before path construction');
assert.deepEqual(context.commands.filter(([command]) => command === 'moveTo'), [
  ['moveTo', 0, 0],
  ['moveTo', 200, 100],
], 'each ring must start an independent subpath at the correctly oriented pixel');
assert.equal(context.commands.filter(([command]) => command === 'closePath').length, 2);
assert.deepEqual(context.commands.at(-2), ['fill', 'evenodd'], 'holes must use the orientation-independent even-odd fill rule');
assert.deepEqual(context.commands.at(-1), ['restore']);

const outsideContext = new MockCanvasContext(800, 400);
const outside = outer.map(({ x, y }) => ({ x: x + 2000, y }));
const outsideResult = paintLandCoverPolygon(outsideContext, [outside], { extent, fillStyle: '#ffffff' });
assert.equal(outsideResult.painted, false, 'fully off-texture polygons should be rejected before building a canvas path');
assert.equal(outsideContext.commands.length, 0);

const transparentContext = new MockCanvasContext(512, 256);
assert.deepEqual(clearLandCoverRaster(transparentContext), { width: 512, height: 256 });
assert.deepEqual(transparentContext.commands, [['clearRect', 0, 0, 512, 256]], 'the raster must clear back to transparency');

console.log(JSON.stringify({
  status: 'pass',
  orientation: 'minZ-to-top',
  bounds: result.bounds,
  ringsPainted: result.rings,
  verticesPainted: result.vertices,
  fillRule: 'evenodd',
  transparentClear: true,
}, null, 2));
