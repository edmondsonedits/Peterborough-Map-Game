import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyReviewedRouteSurfaceCorrections } from '../city-explorer/reviewed-route-surfaces.js';
import { RECORDED_CANOPIES, buildRecordedCanopy } from '../city-explorer/recorded-canopies.js';
import { validateReviewedRouteSurfaceProof, validateReviewedCanopyGroundSource,
  createReviewedCanopyGroundProof, verifyReviewedCanopyGroundProof } from '../city-explorer/reviewed-canopy-ground.js';

import { encodeRoadTile, decodeRoadTile, PackedRoadSurfaceIndex } from '../city-explorer/road-tile-pack.js';

const center = { lat: 44.3091, lon: -78.3197 }, projection = { center };
const project = (lat, lon) => ({ x: (lon - center.lon) * 111320 * Math.cos(center.lat * Math.PI / 180), y: -(lat - center.lat) * 110540 });
const definition = RECORDED_CANOPIES['way/446339023'];
const height = (x, z) => 13 + .018 * (x + 911) - .025 * (z + 1091);
const sourceCanopy = buildRecordedCanopy({ ring: definition.sourceRingLonLat.map(([lon, lat]) => project(lat, lon)), project, groundHeightAt: height });
const data = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson', import.meta.url)));
const surfaceProof = applyReviewedRouteSurfaceCorrections(data).diagnostics;
const sourceProof = { schemaVersion: 1, valid: true, sourceId: definition.sourceId, parkingFeatureId: '10/99',
  correctionId: surfaceProof.correctionId, heightSource: 'rendered-pavement-triangle', samples: sourceCanopy.groundSamples };
const manifest = { buildId: 'a'.repeat(20), projection, reviewedRouteSurfaces: surfaceProof,
  tiles: [{ id: '-2:-3', sha256: 'b'.repeat(64), transportSha256: 'c'.repeat(64) }] };
const samplePacked = (x, z) => ({ sourceId:'10/99', height: height(x, z), id: '-2:-3', contact: 'official', layer: 'parking_surfaces', heightSource: 'rendered-pavement-triangle' });
const create = options => createReviewedCanopyGroundProof({ surfaceProof, sourceProof, manifest, samplePacked, ...options });

test('final ground proof binds all25 actual canopy probes to pack identity and exact tile hashes', () => {
  const result = create();
  assert.equal(result.valid, true);
  assert.equal(result.samples.length, 25);
  assert.equal(result.roadPackBuildId, manifest.buildId);
  assert.equal(result.maximumSourcePackedDifferenceMetres, 0);
  assert.deepEqual(result.tiles, manifest.tiles);
  assert.equal(result.sourceSamples.length, 25);
  assert.equal(verifyReviewedCanopyGroundProof({ manifest: { ...manifest, reviewedCanopyGround: result }, samplePacked }), true);
});

test('source report requires the exact correction, source identity and finite complete coordinate set', () => {
  assert.equal(validateReviewedRouteSurfaceProof(surfaceProof), true);
  assert.equal(validateReviewedCanopyGroundSource(sourceProof, projection).valid, true);
  assert.throws(() => validateReviewedRouteSurfaceProof({ ...surfaceProof, correctedGeometrySha256: '0'.repeat(64) }), /correction proof/i);
  for (const change of [
    proof => { proof.valid = false; }, proof => { proof.sourceId = 'way/other'; },
    proof => { proof.samples.pop(); }, proof => { proof.samples[0].height = NaN; },
    proof => { proof.samples[0].x += .01; }, proof => { proof.samples[0] = { ...proof.samples[1] }; },
    proof => { proof.heightSource = 'terrain'; },
  ]) {
    const proof = structuredClone(sourceProof); change(proof);
    assert.throws(() => validateReviewedCanopyGroundSource(proof, projection), /canopy ground/i);
  }
});

test('a missing or old pack never acquires an apparent valid canopy proof', () => {
  assert.throws(() => create({ surfaceProof: undefined }), /correction proof/i);
  assert.throws(() => verifyReviewedCanopyGroundProof({ manifest, samplePacked }), /canopy ground/i);
  const receipt = create();
  assert.throws(() => verifyReviewedCanopyGroundProof({ manifest: { ...manifest, buildId: 'd'.repeat(20), reviewedCanopyGround: receipt }, samplePacked }), /build identity/i);
});

test('terrain, road, another lot, unowned tile, and missing/nonfinite contact are rejected', () => {
  for (const bad of [null, { ...samplePacked(0, 0), height: NaN }, { ...samplePacked(0, 0), heightSource: 'terrain' },
    { ...samplePacked(0, 0), layer: 'road_surfaces' }, { ...samplePacked(0, 0), contact: 'fallback' },
    { ...samplePacked(0, 0), id: 'elsewhere' }, { ...samplePacked(0, 0), sourceId: '10/100' }, { ...samplePacked(0, 0), sourceId: '' }, { ...samplePacked(0, 0), sourceId: undefined }]) {
    assert.throws(() => create({ samplePacked: () => bad }), /packed canopy ground/i);
  }
});

test('optimized height differences are bounded and rechecked from final packet samples', () => {
  const near = (x, z) => ({ ...samplePacked(x, z), height: height(x, z) + .002 });
  const result = create({ samplePacked: near });
  assert.ok(Math.abs(result.maximumSourcePackedDifferenceMetres - .002) < 1e-12);
  assert.throws(() => create({ samplePacked: (x, z) => ({ ...samplePacked(x, z), height: height(x, z) + .004 }) }), /source.*packed|grade/i);
  assert.throws(() => verifyReviewedCanopyGroundProof({ manifest: { ...manifest, reviewedCanopyGround: result }, samplePacked }), /pinned canopy ground/i);
});

test('edited receipt heights, coordinates and tile hashes cannot survive independent verification', () => {
  for (const edit of [
    proof => { proof.samples[0].height += .001; }, proof => { proof.samples[0].x += 1; },
    proof => { proof.tiles[0].sha256 = 'd'.repeat(64); }, proof => { proof.samples[0].tileId = 'other'; },
    proof => { proof.maximumSourcePackedDifferenceMetres = .001; },
  ]) {
    const proof = create(); edit(proof);
    assert.throws(() => verifyReviewedCanopyGroundProof({ manifest: { ...manifest, reviewedCanopyGround: proof }, samplePacked }), /canopy ground/i);
  }
});

// Ownership must survive the actual codec, not only a mocked callback.
test('decoded final packets cannot certify unowned or differently owned parking triangles', () => {
  const points=[[-930,-1110],[-930,-1070],[-890,-1110],[-890,-1110],[-930,-1070],[-890,-1070]];
  for (const sourceRanges of [[],[{sourceId:'10/100',startVertex:0,vertexCount:6}], [{sourceId:'10/99',startVertex:0,vertexCount:6}]]) {
    const encoded=encodeRoadTile({id:'-2:-3',groups:[{materialKey:'parking',kind:'official-parking_surfaces',layer:'parking_surfaces',contact:'official',
      positions:new Float32Array(points.flatMap(([x,z])=>[x,height(x,z),z])),sourceRanges}]});
    const index=new PackedRoadSurfaceIndex();index.addTile('-2:-3',decodeRoadTile(encoded).groups);
    const make=()=>create({samplePacked:(x,z)=>index.sample(x,z)});
    if(sourceRanges[0]?.sourceId==='10/99') assert.equal(make().valid,true);
    else assert.throws(make,/verified packed canopy ground/);
  }
});
