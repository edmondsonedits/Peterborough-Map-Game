import assert from 'node:assert/strict';
import {
  decodeTerrariumRgb,
  officialTerrainPixelCoordinates,
  sampleOfficialTerrainElevation,
  sampleTerrariumPixelGrid,
  toWebMercator,
  validOfficialTerrainMetadata,
} from '../city-explorer/terrain-heightmap.js';

const encode = (height) => {
  const code = Math.round((height + 32768) * 256);
  return [(code >> 16) & 255, (code >> 8) & 255, code & 255, 255];
};

assert.equal(decodeTerrariumRgb(...encode(204.125)), 204.125);
assert.deepEqual(toWebMercator(0, 0), { x: 0, y: -7.081154551613622e-10 });

const metadata = {
  asset: 'synthetic.png',
  encoding: { name: 'Mapzen Terrarium RGB' },
  dimensions: { width: 2, height: 2 },
  bounds: { webMercatorEpsg3857: { xmin: -100, ymin: -100, xmax: 100, ymax: 100 } },
};
assert.equal(validOfficialTerrainMetadata(metadata), true);
assert.equal(validOfficialTerrainMetadata({ ...metadata, dimensions: { width: 0, height: 2 } }), false);

const pixels = new Uint8ClampedArray([
  ...encode(100), ...encode(200),
  ...encode(300), ...encode(400),
]);
assert.equal(sampleTerrariumPixelGrid(pixels, 2, 2, 0, 0), 100);
assert.equal(sampleTerrariumPixelGrid(pixels, 2, 2, 1, 1), 400);
assert.equal(sampleTerrariumPixelGrid(pixels, 2, 2, 0.5, 0.5), 250);

const centerPixels = officialTerrainPixelCoordinates(metadata, 0, 0);
assert.ok(Math.abs(centerPixels.x - 0.5) < 1e-9);
assert.ok(Math.abs(centerPixels.y - 0.5) < 1e-8);
assert.ok(Math.abs(sampleOfficialTerrainElevation(metadata, pixels, 0, 0) - 250) < 1e-7);

console.log(JSON.stringify({
  status: 'pass',
  exactTerrariumDecode: true,
  webMercatorPixelCenters: true,
  bilinearSampling: true,
  syntheticCenterMetres: 250,
}, null, 2));
