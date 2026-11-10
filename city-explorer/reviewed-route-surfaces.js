// R041/R043/R049 show an open fuel canopy, not a building closing this patch of
// forecourt. Keep the municipal boundary and garage exclusion authoritative.
// Geometry hashes use JSON.stringify({type, coordinates}) in that key order;
// the ring hash uses JSON.stringify(ring). They describe audited coordinates,
// not a claim that a road pack has been rebuilt or rendered.
export const ULTRAMAR_PAVEMENT_CORRECTION = Object.freeze({
  id: 'ultramar-10-99-open-canopy-hole-2-v1',
  featureId: '10/99',
  canopySourceId: 'way/446339023',
  layer: 'parking_surfaces',
  removedHoleIndex: 2,
  geometryHashFormat: 'sha256-json-type-coordinates-v1',
  sourceGeometrySha256: 'd9124fbc8f59337f2ef23e245b405bda0be70fd289499a802091c5722db82ec8',
  correctedGeometrySha256: 'cb9c68fcc3780816f850868f25c1d8cb97e9ab0ffdb25fd87789675ab15a1825',
  removedRingSha256: 'f0c0263300e04bd20844f6bb2092a91a1e75b2d93193ca22d6cf7087d9605546',
});

// Full source geometry is intentionally pinned. A revised survey, reordered
// rings, extra exclusion, or even a rounded coordinate requires review again.
const AUDITED_RINGS = [
  [
    [-78.33144337955756, 44.319067132518356],
    [-78.33141279869473, 44.31906765276582],
    [-78.33138461785538, 44.319076192958384],
    [-78.33100902074743, 44.31927276254443],
    [-78.33073822804707, 44.31898536338936],
    [-78.33070403528023, 44.31893749736318],
    [-78.33075969695918, 44.31890411674158],
    [-78.33095125210468, 44.31880972671615],
    [-78.33095433103591, 44.31879976693098],
    [-78.33095078011584, 44.31878989069609],
    [-78.33093533897905, 44.31877321303429],
    [-78.33091123409865, 44.318754793314596],
    [-78.33099838057129, 44.31871038216647],
    [-78.33102741600597, 44.318702875762014],
    [-78.33104034424089, 44.31875620612149],
    [-78.33105124497325, 44.31878363133759],
    [-78.33106464808479, 44.31878917622974],
    [-78.33107939765235, 44.31878704353669],
    [-78.33113246884784, 44.318748065463524],
    [-78.33120188720085, 44.318819161031456],
    [-78.33118845280349, 44.31882630301751],
    [-78.33118008703383, 44.31883720422665],
    [-78.33117869916367, 44.318849609994366],
    [-78.33118453153952, 44.31886132931299],
    [-78.33131412261308, 44.318992335218205],
    [-78.33131945624812, 44.318995477641195],
    [-78.33136676732062, 44.318995769883706],
    [-78.3313717146248, 44.31899299836036],
    [-78.33144337955756, 44.319067132518356],
  ],
  [
    [-78.33092467414718, 44.31893761788748],
    [-78.33085142564826, 44.319004326102885],
    [-78.33096580263187, 44.31907037822128],
    [-78.33093653659222, 44.31909634208226],
    [-78.33099128392543, 44.31912786969091],
    [-78.33109379835618, 44.31903519839045],
    [-78.33092467414718, 44.31893761788748],
  ],
  [
    [-78.33118216174825, 44.318922749270556],
    [-78.33106097576224, 44.31898473660138],
    [-78.3311137430816, 44.31903782448556],
    [-78.33123492908591, 44.318975837999865],
    [-78.33118216174825, 44.318922749270556],
  ],
];

function matchesAuditedRings(rings) {
  return Array.isArray(rings) && rings.length === AUDITED_RINGS.length
    && AUDITED_RINGS.every((expected, index) => Array.isArray(rings[index]) && rings[index].length === expected.length
      && expected.every((point, vertex) => Array.isArray(rings[index][vertex]) && rings[index][vertex].length === 2
        && rings[index][vertex][0] === point[0] && rings[index][vertex][1] === point[1]));
}

/** Return a corrected GeoJSON collection plus an auditable application result.
 * No input is modified. Unrelated features, properties and retained rings are
 * shared unchanged. On any identity/geometry mismatch the original collection
 * is returned by reference, with no successful geometry proof in diagnostics.
 * The caller must use the returned collection before both normal tessellation
 * and semantic indexing; this helper emits no mesh and chooses no height.
 */
export function applyReviewedRouteSurfaceCorrections(collection) {
  const correction = ULTRAMAR_PAVEMENT_CORRECTION;
  const diagnostics = { schemaVersion: 1, correctionId: correction.id, featureId: correction.featureId,
    canopySourceId: correction.canopySourceId, applied: false, reason: 'invalid-collection' };
  const unchanged = reason => ({ collection, diagnostics: { ...diagnostics, reason } });
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return unchanged('invalid-collection');
  const matches = collection.features.filter(feature => feature?.id === correction.featureId);
  if (!matches.length) return unchanged('feature-not-found');
  if (matches.length !== 1) return unchanged('ambiguous-feature-identity');
  const feature = matches[0];
  if (feature.type !== 'Feature' || feature.properties?.ptbo_layer !== correction.layer
    || feature.geometry?.type !== 'Polygon') return unchanged('feature-identity-mismatch');
  if (!matchesAuditedRings(feature.geometry.coordinates)) return unchanged('source-geometry-mismatch');
  const corrected = { ...feature, geometry: { ...feature.geometry,
    coordinates: feature.geometry.coordinates.filter((_, index) => index !== correction.removedHoleIndex) } };
  return {
    collection: { ...collection, features: collection.features.map(candidate => candidate === feature ? corrected : candidate) },
    diagnostics: { ...diagnostics, applied: true, reason: 'audited-open-canopy-hole-removed',
      removedHoleIndex: correction.removedHoleIndex, ringsBefore: 3, ringsAfter: 2,
      geometryHashFormat: correction.geometryHashFormat,
      sourceGeometrySha256: correction.sourceGeometrySha256,
      correctedGeometrySha256: correction.correctedGeometrySha256,
      removedRingSha256: correction.removedRingSha256 },
  };
}
