import { RECORDED_CANOPIES, buildRecordedCanopy } from './recorded-canopies.js?v=1.6.208';
import { ULTRAMAR_PAVEMENT_CORRECTION as CORRECTION } from './reviewed-route-surfaces.js?v=1.6.208';

const SOURCE_ID = CORRECTION.canopySourceId;
const SAMPLE_COUNT = 25;
const COORDINATE_TOLERANCE = 1e-6;
// The pack optimizer accepts 2 mm height error; allow 1 mm for Float32
// boundary/interpolation arithmetic, then record the actual measured maximum.
const MAX_SOURCE_PACKED_DIFFERENCE = .003;
const finite = Number.isFinite;
const samePoint = (a, b) => Math.abs(a.x - b.x) <= COORDINATE_TOLERANCE && Math.abs(a.z - b.z) <= COORDINATE_TOLERANCE;
const reject = message => { throw new Error(message); };

/** Bounded source-build evidence for compiler failures. This describes a
 * rejected report; it never supplies missing ownership or ground samples. */
export function summarizeReviewedCanopyGroundSource(record) {
  const diagnostics=record?.diagnostics, contacts=Array.isArray(diagnostics?.contacts)?diagnostics.contacts:[];
  const scalar=value=>typeof value==='string'?value.slice(0,160):typeof value==='boolean'||finite(value)?value:null;
  return {sourceId:scalar(record?.sourceId),valid:record?.valid===true,reason:scalar(record?.reason),
    sampleCount:Array.isArray(record?.samples)?record.samples.length:0,
    sourceRingVertices:scalar(diagnostics?.sourceRingVertices),sourceHoleCount:scalar(diagnostics?.sourceHoleCount),
    finishedRoadSurfaces:diagnostics?.finishedRoadSurfaces===true,contactCount:contacts.length,
    contacts:contacts.slice(0,SAMPLE_COUNT).map(contact=>Object.fromEntries(
      ['x','z','reason','semanticId','renderedSourceId','layer','contact','heightSource','height']
        .map(key=>[key,scalar(contact?.[key])])))};
}

export function validateReviewedRouteSurfaceProof(proof) {
  const expected = { schemaVersion: 1, correctionId: CORRECTION.id, featureId: CORRECTION.featureId,
    canopySourceId: SOURCE_ID, applied: true, removedHoleIndex: 2, ringsBefore: 3, ringsAfter: 2,
    geometryHashFormat: CORRECTION.geometryHashFormat, sourceGeometrySha256: CORRECTION.sourceGeometrySha256,
    correctedGeometrySha256: CORRECTION.correctedGeometrySha256, removedRingSha256: CORRECTION.removedRingSha256 };
  if (!proof || Object.entries(expected).some(([key, value]) => proof[key] !== value)) reject('Invalid reviewed route correction proof');
  return true;
}

function projectFor(projection) {
  const center = projection?.center;
  if (!finite(center?.lat) || !finite(center?.lon) || Math.abs(center.lat) >= 90 || Math.abs(center.lon) > 180) reject('Invalid canopy ground projection');
  const scale = 111320 * Math.cos(center.lat * Math.PI / 180);
  return (lat, lon) => ({ x: (lon - center.lon) * scale, y: -(lat - center.lat) * 110540 });
}

/** Validate the complete coordinate set and grade through the same bounded
 * canopy builder. This does not replace the caller's live pavement sampling.
 */
export function validateReviewedCanopyGroundSource(record, projection) {
  if (!record || record.schemaVersion !== 1 || record.valid !== true || record.sourceId !== SOURCE_ID
    || record.parkingFeatureId !== CORRECTION.featureId || record.correctionId !== CORRECTION.id
    || record.heightSource !== 'rendered-pavement-triangle' || !Array.isArray(record.samples)
    || record.samples.length !== SAMPLE_COUNT || record.samples.some(p => ![p?.x, p?.z, p?.height].every(finite))) {
    reject('Invalid source canopy ground report: '+JSON.stringify(summarizeReviewedCanopyGroundSource(record)));
  }
  const project = projectFor(projection), definition = RECORDED_CANOPIES[SOURCE_ID], used = new Set();
  const result = buildRecordedCanopy({ sourceId: SOURCE_ID, project,
    ring: definition.sourceRingLonLat.map(([lon, lat]) => project(lat, lon)),
    groundHeightAt(x, z) {
      const index = record.samples.findIndex(sample => samePoint(sample, { x, z }));
      if (index < 0) return NaN;
      used.add(index); return record.samples[index].height;
    },
  });
  if (!result.valid || used.size !== SAMPLE_COUNT) reject(`Invalid canopy ground coordinates or grade: ${result.reason || 'duplicate samples'}`);
  return result;
}

function boundTiles(manifest, samples) {
  const ids = [...new Set(samples.map(sample => sample.tileId))].sort();
  return ids.map(id => {
    const matches = manifest.tiles?.filter(tile => tile.id === id) || [];
    if (matches.length !== 1 || !/^[a-f0-9]{64}$/.test(matches[0].sha256 || '')
      || !/^[a-f0-9]{64}$/.test(matches[0].transportSha256 || '')) reject('Invalid packed canopy ground tile identity');
    const { sha256, transportSha256 } = matches[0];
    return { id, sha256, transportSha256 };
  });
}

/** Run only after the final optimized/finished packets exist. The callback
 * must query an index built from those decoded packets, including all contact
 * layers so an overlapping public road or bridge cannot be called parking.
 */
export function createReviewedCanopyGroundProof({ surfaceProof, sourceProof, manifest, samplePacked }) {
  validateReviewedRouteSurfaceProof(surfaceProof);
  validateReviewedCanopyGroundSource(sourceProof, manifest?.projection);
  if (!/^[a-f0-9]{20}$/.test(manifest?.buildId || '') || typeof samplePacked !== 'function') reject('Invalid packed canopy ground inputs');
  let maximumSourcePackedDifferenceMetres = 0;
  const samples = sourceProof.samples.map(({ x, z, height: sourceHeight }) => {
    const hit = samplePacked(x, z);
    if (!finite(hit?.height) || hit.heightSource !== 'rendered-pavement-triangle' || hit.layer !== 'parking_surfaces'
      || hit.contact !== 'official' || typeof hit.id !== 'string'
      || hit.sourceId !== CORRECTION.featureId) reject(`Missing verified packed canopy ground at ${x},${z}`);
    const difference = Math.abs(hit.height - sourceHeight);
    if (difference > MAX_SOURCE_PACKED_DIFFERENCE) reject(`Source/packed canopy ground grade differs by ${difference} m`);
    maximumSourcePackedDifferenceMetres = Math.max(maximumSourcePackedDifferenceMetres, difference);
    return { x, z, height: hit.height, tileId: hit.id };
  });
  const proof = { schemaVersion: 1, valid: true, stage: 'final-packed-triangles', sourceId: SOURCE_ID,
    parkingFeatureId: CORRECTION.featureId, correctionId: CORRECTION.id,
    heightSource: 'rendered-pavement-triangle', roadPackBuildId: manifest.buildId,
    samples, sourceSamples: sourceProof.samples.map(({ x, z, height }) => ({ x, z, height })),
    maximumSourcePackedDifferenceMetres, tiles: boundTiles(manifest, samples) };
  validateReviewedCanopyGroundSource(proof, manifest.projection);
  return proof;
}

/** Safe for a future browser consumer before distant tiles are resident.
 * This validates the build-bound receipt, not current streaming readiness.
 * Vehicle contact must continue to use the live resident-tile index.
 */
export function validateReviewedCanopyGroundRecord(manifest) {
  validateReviewedRouteSurfaceProof(manifest?.reviewedRouteSurfaces);
  const proof = manifest?.reviewedCanopyGround;
  const result = validateReviewedCanopyGroundSource(proof, manifest?.projection);
  if (proof.stage !== 'final-packed-triangles' || proof.roadPackBuildId !== manifest.buildId) reject('Canopy ground build identity mismatch');
  validateReviewedCanopyGroundSource({ ...proof, samples: proof.sourceSamples }, manifest.projection);
  if (JSON.stringify(proof.tiles) !== JSON.stringify(boundTiles(manifest, proof.samples))) reject('Pinned canopy ground tile hashes differ');
  let maximum = 0;
  for (const sample of proof.samples) {
    const source = proof.sourceSamples.find(point => samePoint(point, sample));
    if (!source) reject('Pinned canopy ground source coordinate mismatch');
    maximum = Math.max(maximum, Math.abs(sample.height - source.height));
  }
  if (maximum > MAX_SOURCE_PACKED_DIFFERENCE || !finite(proof.maximumSourcePackedDifferenceMetres)
    || Math.abs(maximum - proof.maximumSourcePackedDifferenceMetres) > 1e-9) reject('Pinned canopy ground source/packed difference mismatch');
  return result;
}

/** Independent release verification against the final decoded packets. */
export function verifyReviewedCanopyGroundProof({ manifest, samplePacked }) {
  validateReviewedCanopyGroundRecord(manifest);
  const proof = manifest.reviewedCanopyGround;
  const actual = createReviewedCanopyGroundProof({ surfaceProof: manifest.reviewedRouteSurfaces,
    sourceProof: { ...proof, samples: proof.sourceSamples }, manifest, samplePacked });
  for (const expected of proof.samples) {
    const sampled = actual.samples.find(point => samePoint(point, expected));
    if (!sampled || sampled.tileId !== expected.tileId || Math.abs(sampled.height - expected.height) > 1e-7) reject('Pinned canopy ground differs from final packed triangles');
  }
  return true;
}
