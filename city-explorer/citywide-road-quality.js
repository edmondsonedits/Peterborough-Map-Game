/** City-wide, source-aware road display policy.
 *
 * Municipal road surface footprints are always planimetric authority.
 * Mesh tessellation only improves their height interpolation; it never changes
 * a surveyed vertex, OSM lane count or bridge elevation datum.
 */
export function officialRoadMeshEdgeLength(layer, { lowPower = false, nearStation = false, legacy = false } = {}) {
  if (nearStation) return 8;
  if (legacy) return lowPower ? 48 : layer === 'parking_surfaces' ? 42 : 36;
  if (lowPower) {
    if (layer === 'bridges') return 30;
    if (layer === 'parking_surfaces') return 40;
    return 34;
  }
  if (layer === 'bridges') return 20;
  if (layer === 'parking_surfaces') return 30;
  return 24;
}

/** Curb type comes from the City of Peterborough CURBTYPE field.
 * A mapped 'edge of pavement' is not evidence of an elevated concrete curb.
 * Missing classification is unknown; do not silently construct a raised wall.
 * The actual curb Z/reveal is not surveyed by this source.
 */
export function officialCurbDisplayMode(raisedClassification) {
  if (raisedClassification === true) return 'raised';
  if (raisedClassification === false) return 'edge-of-pavement';
  return 'unclassified';
}

/** Sample a nearby existing rendered municipal pavement face, never an
 * independent road model. Avoid radius averaging across bridge decks, which
 * could silently create invented heights at separated crossings.
 *
 * The caller may supply a street/ground height hint to keep the correct deck.
 * Uses a bounded nearest-first search and returns null if no surveyed pavement
 * face is close enough. This is deliberately NOT a geometric width inference.
 */
export function nearbyMunicipalRoadHeight(index, x, z, referenceHeight = null, searchRadius = 2.2) {
  if (!index?.sample || ![x, z, searchRadius].every(Number.isFinite)
    || searchRadius < 0) return null;
  const options = { includeParking: false };
  const sampleAt = (px, pz) => {
    const sample = index.sample(px, pz, referenceHeight, options);
    return sample && sample.layer === 'road_surfaces' && Number.isFinite(sample.height)
      ? sample.height : null;
  };
  const direct = sampleAt(x, z);
  if (direct !== null) return direct;
  const radii = [0.35, 0.8, 1.4, 2.2];
  for (const radius of radii) {
    if (radius > searchRadius + 1e-6) break;
    // Return the closest surface position first, not an arbitrary mean over
    // different streets with independent road profile heights.
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const height = sampleAt(x + radius * Math.cos(angle), z + radius * Math.sin(angle));
      if (height !== null) return height;
    }
  }
  return null;
}

export function municipalCurbTop(pavementHeight, fallbackTop, { raised = true, reveal = 0.15 } = {}) {
  if (!Number.isFinite(fallbackTop)) throw new TypeError('Expected a finite fallback height');
  if (!Number.isFinite(pavementHeight) || !raised) return fallbackTop;
  if (!Number.isFinite(reveal) || reveal < 0 || reveal > 0.25) throw new RangeError('Invalid curb reveal');
  return pavementHeight + reveal;
}
