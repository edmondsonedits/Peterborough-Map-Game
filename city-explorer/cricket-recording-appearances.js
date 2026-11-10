const freezeDeep = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

const identityReview = {
  reviewedOn: '2026-11-10',
  method: 'Ordered source-photo continuity corroborated by current municipal parcels and building footprints',
  northSideOrderWestToEast: ['way/1015118647', 'way/1015118648', 'way/1015118649', 'way/1015118651', 'way/1015118652'],
  independentReviews: ['east-city-cricket-reference', 'cricket-independent-photo-parcel-review'],
  municipalEvidence: {
    service: 'https://citymaps.peterborough.ca/arcgis/rest/services/Basedata/MapServer',
    parcelObjectIds: [4380, 4381, 4384, 4385, 4387], buildingObjectIds: [8829, 6424, 10576, 16714, 9362],
    retrievedOn: '2026-11-10',
  },
  historicalUserIdentification: {
    address: '22 Cricket Place', photoIds: ['R283', 'R285'],
    recordedIn: ['city-explorer/data/outer-recording-review.json', 'docs/cricket-visual-verification-2026-10-25.md'],
    conflict: 'The earlier review records the user identifying the orange-toy house as 22. R275/R278/R281 establish the north-side order, and R283/R285 place that broad house at 24. This prior identification remains conflicting evidence; it is not silently replaced by a claim that a door number was read.',
  },
  resolution: 'Keep 22 → way/1015118649 and 24 → way/1015118651. Correct only the photographed-house association and supported facade cues. The R283/R285 right-hand neighbor is 28, not 24. No photographed civic numeral is asserted.',
};

// Appearance-only estimates from two independent route/parcel reviews.
// The mapped footprint and existing roof/profile geometry remain authoritative.
export const CRICKET_RECORDING_PROFILES = freezeDeep({
  'way/1015118649': {
    id: 'way/1015118649',
    label: 'CR22',
    name: '22 Cricket Place brick porch house',
    appearanceOnly: true,
    preserveMappedMassing: true,
    reviewedWallMaterial: true,
    confidence: 'observed',
    style: 'house',
    source: {
      photoId: 'R281',
      path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0433_lens1_pitch+0.jpg',
      sha256: '4a90a9e9a2cb7d3e9976eb589c3f37feb9d38790cfa9bd3081e7261fb8f286aa',
      pixelInspected: true,
      neighborFrames: [{
        photoId: 'R278',
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0430_lens1_pitch+0.jpg',
        sha256: '573781b5c1fe5ccaf951c4077b137d2303dfaa0c755e5247915620e63c6ff0a2',
        pixelInspected: true,
      }, {
        photoId: 'R295',
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0462_lens0_pitch+0.jpg',
        sha256: '59533ef5a274bc77f0f6f6751c441082559565c4df6e0f8a9edac0358866fa35',
        pixelInspected: true,
      }],
      observation: 'The narrow north-side house between hip-roof 16 and broad cross-gable 24 has red brick, two pale upper sash and a nearly full-width green porch canopy. Its pale front gable has a small paired attic opening. The dark lower entry is toward the east/right; a dense tree obscures western ground openings. This is not the orange-toy house.',
      limitations: 'Porch dimensions, color and entry fraction are visual estimates. Hidden ground glazing is omitted. The current exact frontage is the outer porch edge, so upper-wall setback and the photographed pale gable remain unresolved geometry; mapped wall height 6.09791 m, hip roof and footprint are not changed.',
    },
    addressEvidence: { kind: 'municipal-parcel', address: '22 Cricket Place' },
    parcelEvidence: { service: 'CityMapServer4', objectId: 4384 },
    identityReview,
    camera: { lat: 44.30715767, lon: -78.31125256, bearingDegrees: 342.362, roadId: 'way/33960427', reviewMode: 'cab-seat', status: 'Exact current road-centerline projection; runtime visibility and collision unverified.' },
    frontLatLon: [
      { lat: 44.3072879, lon: -78.3113502 },
      { lat: 44.3073049, lon: -78.3112781 },
    ],
    wallColor: '#925245',
    wallSurface: 'brick',
    trimColor: '#ddd9ce',
    levels: 2,
    windowColumns: 2,
    doorFraction: 0.5,
    skipGroundWindows: true,
    groundWindows: [],
    entryDoor: { fraction: .78, widthMetres: .9, heightMetres: 2.3, color: '#494b3e' },
    porch: true,
    porchRoofColor: '#46564b',
    porchWidthFraction: 0.95,
    porchDepthMetres: 1.8,
    porchHeightMetres: 2.5,
  },
  'way/1015118651': {
    id: 'way/1015118651',
    label: 'CR24',
    name: '24 Cricket Place red-brick porch house',
    appearanceOnly: true,
    preserveMappedMassing: true,
    reviewedWallMaterial: true,
    confidence: 'observed',
    style: 'house',
    source: {
      photoId: 'R283',
      path: 'Peterborough-Building-References-20261024/flat-priority-2048/0870s_lens0_pitch-35_up15.jpg',
      sha256: 'fcdb895bd275ca35ae7dd533e6cb42166cd01a83deb967b20cfb0eb91511a724',
      pixelInspected: true,
      neighborFrames: [{
        photoId: 'R285',
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0435_lens0_pitch-35.jpg',
        sha256: 'cf10a3d72498e3f23848160d8d771ab67a53364f008904ca3f6b06785e685310',
        pixelInspected: true,
      }, {
        photoId: 'R278',
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0430_lens1_pitch+0.jpg',
        sha256: '573781b5c1fe5ccaf951c4077b137d2303dfaa0c755e5247915620e63c6ff0a2',
        pixelInspected: true,
      }],
      observation: 'The broad north-side cross-gable house immediately east/right of narrow 22 has red brick, two pale upper front sash, a broad dark porch canopy with a small central pediment and pale posts. Its side projection is visible in R283/R285. The orange-wheeled toy and curved walk are on this lawn. The narrower white-porch house to its right/east is 28.',
      limitations: 'Porch width/depth and colors are visual estimates; shrubs obscure lower openings. The porch pediment, exact roof/gable treatment, projecting side facade, lawn and toy are not reconstructed. Existing wall height 5.70568 m, roof and footprint are retained.',
    },
    addressEvidence: { kind: 'municipal-parcel', address: '24 Cricket Place' },
    parcelEvidence: { service: 'CityMapServer4', objectId: 4385 },
    identityReview,
    camera: { lat: 44.30719152, lon: -78.31110388, bearingDegrees: 342.362, roadId: 'way/33960427', reviewMode: 'cab-seat', status: 'Exact current road-centerline projection; runtime visibility and collision unverified.' },
    frontLatLon: [
      { lat: 44.3073191, lon: -78.3112248 },
      { lat: 44.3073465, lon: -78.3111084 },
    ],
    wallColor: '#8e4b3e',
    wallSurface: 'brick',
    trimColor: '#dfd9ca',
    levels: 2,
    windowColumns: 2,
    doorFraction: 0.5,
    skipGroundWindows: true,
    porch: true,
    porchRoofColor: '#46504a',
    porchWidthFraction: 0.9,
    porchDepthMetres: 1.6,
    porchHeightMetres: 2.5,
  },
});

/** Add photo-observed appearance defaults without mutating or replacing caller profiles. */
export function addCricketRecordingProfiles(baseProfiles, enabled = true) {
  if (!enabled || !baseProfiles || typeof baseProfiles !== 'object') return baseProfiles;
  let updated = baseProfiles;
  for (const [id, profile] of Object.entries(CRICKET_RECORDING_PROFILES)) {
    if (Object.prototype.hasOwnProperty.call(baseProfiles, id)) continue;
    if (updated === baseProfiles) updated = { ...baseProfiles };
    updated[id] = profile;
  }
  return updated;
}
