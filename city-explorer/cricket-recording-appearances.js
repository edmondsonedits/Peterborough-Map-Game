const freezeDeep = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

// Appearance-only estimates for the confirmed 22 Cricket Place frontage.
// The mapped footprint and existing roof/profile geometry remain authoritative.
export const CRICKET_RECORDING_PROFILES = freezeDeep({
  'way/1015118649': {
    id: 'way/1015118649',
    label: 'CR22',
    name: '22 Cricket Place brick porch house',
    appearanceOnly: true,
    preserveMappedMassing: true,
    confidence: 'observed',
    style: 'house',
    source: {
      path: 'Peterborough-Building-References-20261024/flat-priority-2048/0870s_lens0_pitch-35_up15.jpg',
      sha256: 'fcdb895bd275ca35ae7dd533e6cb42166cd01a83deb967b20cfb0eb91511a724',
      pixelInspected: true,
      neighborFrames: [{
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0435_lens0_pitch-35.jpg',
        sha256: 'cf10a3d72498e3f23848160d8d771ab67a53364f008904ca3f6b06785e685310',
        pixelInspected: true,
      }, {
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0450_lens0_pitch-35.jpg',
        sha256: '4ba8dc0a9446de0b4222ad1db9b4e96801364aa09db72c14f927b8d3258d9c2d',
        pixelInspected: true,
      }],
      observation: 'The left red-brick house has a white-trim porch, two upper front windows, and a ground-floor entry/window. The neighboring right-hand porch has a green canopy; the orange-wheeled toy is visible at the lawn edge.',
      limitations: 'Porch dimensions and opening proportions are visual estimates from oblique perspective exports; no mapped height, roof, or footprint values are replaced.',
    },
    addressEvidence: { kind: 'user-confirmation', address: '22 Cricket Place' },
    parcelEvidence: { service: 'CityMapServer4', objectId: 4384 },
    frontLatLon: [
      { lat: 44.3072879, lon: -78.3113502 },
      { lat: 44.3073049, lon: -78.3112781 },
    ],
    wallColor: '#783b31',
    trimColor: '#ece8df',
    levels: 2,
    windowColumns: 2,
    doorFraction: 0.5,
    skipGroundWindows: true,
    groundWindows: [{ t: 0.25, width: 1.05, height: 1.35, bottom: 0.35 }],
    porch: true,
    porchRoofColor: '#46504a',
    porchWidthFraction: 0.8,
    porchDepthMetres: 1.8,
    porchHeightMetres: 2.5,
  },
  'way/1015118651': {
    id: 'way/1015118651',
    label: 'CR24',
    name: '24 Cricket Place red-brick porch house',
    appearanceOnly: true,
    preserveMappedMassing: true,
    confidence: 'observed',
    style: 'house',
    source: {
      path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0435_lens0_pitch-35.jpg',
      sha256: 'cf10a3d72498e3f23848160d8d771ab67a53364f008904ca3f6b06785e685310',
      pixelInspected: true,
      neighborFrames: [{
        path: 'Peterborough-Building-References-20261024/dense/flat-768/frame_0450_lens0_pitch-35.jpg',
        sha256: '4ba8dc0a9446de0b4222ad1db9b4e96801364aa09db72c14f927b8d3258d9c2d',
        pixelInspected: true,
      }],
      observation: 'The immediate right-hand brick house has two upper front windows and a pale porch with a green canopy; its lawn and entry walk are visible.',
      limitations: 'Porch dimensions and surface colors are visual estimates; foliage partly obscures ground-floor openings. No mapped height, roof, or footprint values are replaced.',
    },
    addressEvidence: { kind: 'municipal-parcel', address: '24 Cricket Place' },
    parcelEvidence: { service: 'CityMapServer4', objectId: 4385 },
    frontLatLon: [
      { lat: 44.3073191, lon: -78.3112248 },
      { lat: 44.3073465, lon: -78.3111084 },
    ],
    wallColor: '#783b31',
    trimColor: '#ece8df',
    levels: 2,
    windowColumns: 2,
    doorFraction: 0.5,
    skipGroundWindows: true,
    porch: true,
    porchRoofColor: '#545958',
    porchWidthFraction: 0.48,
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
