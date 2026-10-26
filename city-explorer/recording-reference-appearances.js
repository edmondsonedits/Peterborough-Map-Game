/** Photo-supported appearance settings layered over existing bounded frontage profiles. */
const sharedSurfaceAppearance = Object.freeze({ pathColor: '#85827b', drivewayColor: '#514f4b' });
const noFrillsYellowPanel = Object.freeze({
  fraction: 0.18, widthFraction: 0.36, bottomMetres: 0.15, heightMetres: 4.9,
  color: '#f6df16', outsetMetres: 0.16, referenceId: 'recording-reference-r01-yellow-wall',
});
const noFrillsSignLayout = Object.freeze({
  when: Object.freeze({ signWidthMetres: 12, signFraction: 0.18, signHeightMetres: 4.3 }),
  signWidthMetres: 9, signFraction: 0.15, signHeightMetres: 3.75, signBoardHeightMetres: 0.8,
});
const r13PierPanel = Object.freeze({
  fraction: 0.73, widthFraction: 0.22, bottomMetres: 0, heightMetres: 20.2,
  color: '#b9ae96', outsetMetres: 0.30, referenceId: 'recording-reference-r13-stone-pier',
});
const makeRecord = (id, label, name, source, observation, limitations, appearance = { frontGarden: sharedSurfaceAppearance }) => Object.freeze({
  id, label, name, source: Object.freeze(source), observation, limitations, appearance: Object.freeze(appearance),
});

/** Existing-footage appearance settings; no building mass, footprint or collision changes. */
export const RECORDING_REFERENCE_APPEARANCES = Object.freeze({
  'way/1006575704': makeRecord('way/1006575704', 'S03', '219 Sherbrooke balcony frontage', {
    path: 'Peterborough-Building-References-20261024/flat-priority-2048/0495s_lens0.jpg',
    sha256: '08ac955513d032a9088dc8450b1a33f2978797552d4610f15f8cfb7d901b429e', sourceSeconds: 495, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
  }, 'The visible 219 number anchors the frontage; the yard has a light concrete walk and darker paved access beside green lawn.', 'The car masks part of the foreground. Existing experimental calibration and dusk lighting limit color precision.'),
  'way/1006575744': makeRecord('way/1006575744', 'S04', 'Rectangular brick frontage beside 219', {
    path: 'Peterborough-Building-References-20261024/flat-priority-2048/0495s_lens0.jpg',
    sha256: '08ac955513d032a9088dc8450b1a33f2978797552d4610f15f8cfb7d901b429e', sourceSeconds: 495, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
  }, 'The adjacent brick house has a narrow gray walk and dark paved side access through a small lawn/retaining-edge frontage.', 'The shared view and car limit exact pavement boundaries; current clipped garden positions remain unchanged.'),
  'way/1006575743': makeRecord('way/1006575743', 'S05', 'Brick house with curved white porch', {
    path: 'Peterborough-Building-References-20261024/flat-priority-2048/0495s_lens0.jpg',
    sha256: '08ac955513d032a9088dc8450b1a33f2978797552d4610f15f8cfb7d901b429e', sourceSeconds: 495, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
  }, 'The brick house and curved white porch sit behind a lawn, with a gray paved walk and darker vehicle access at the side.', 'Trees, foreground car, and low evening light obscure parts of the ground.'),
  'way/1006575739': makeRecord('way/1006575739', 'S09', 'Brick house with white porch and upper balcony', {
    path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0510s_lens0_pitch+0.jpg',
    sha256: 'b75f920ee92b7734532f8088c378b7bc07942a4a8413f66059c102d0c301c477', sourceSeconds: 510, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
  }, 'White porch/balcony brick house has a short lawn edge, gray entrance walk, and dark paved side access.', 'Trees, signs, and the vehicle obscure ground edges; existing hedge and surface bounds are retained.'),
  'way/1006575702': makeRecord('way/1006575702', 'S10', 'Blue-sided gable house with glazed porch', {
    path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0510s_lens0_pitch+0.jpg',
    sha256: 'b75f920ee92b7734532f8088c378b7bc07942a4a8413f66059c102d0c301c477', sourceSeconds: 510, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
  }, 'The blue-sided gabled house has a glazed porch, small green planting/lawn strips, and a broad dark paved access area.', 'Trees and a parked vehicle obscure the yard edge; no parking extent is inferred.'),
  'way/1031042883': makeRecord('way/1031042883', 'R13', '364 Water Street office', {
    path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0714s_lens0_pitch+0.jpg',
    sha256: '57371f5366f978d3fb1236436af8191e56fc3eaa893ab94cbd826ee259ce3afe', sourceSeconds: 714, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
    baseline: Object.freeze({ path: 'test-artifacts/recording-visuals-20261025/final/full-R13-front.jpg', sha256: 'cbde5ab2deef2c6343712a4e20ecc422dd0e774269400a52a1f24431efb931ac' }),
  }, 'The source shows a broad pale stone/concrete pier between the narrow vertical glazed bay on the north/left end and the ribbon windows. In the final R13 frontage, ribbons and lower glazing incorrectly cross this pier. A surface panel from t=.62 to .84 restores the divider and leaves the vertical strip (starts near .845) exposed.', 'Pier width and material are visual estimates from one oblique source. Height uses the existing 20.2 m profile height; no building dimensions or glazing boundaries are surveyed.', {
    facadePanels: Object.freeze([r13PierPanel]),
  }),
  'way/755554888': makeRecord('way/755554888', 'R01', 'No Frills, George/Sherbrooke', {
    path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0582s_lens0_pitch+0.jpg',
    sha256: '6f640d248abcd9dacacb373a6e871a37f170f5ebd16ab1939ecde83d9797e2b7', sourceSeconds: 582, lens: 0, fovDegrees: 100, yawDegrees: 0, pitchDegrees: 0,
    neighborFrames: Object.freeze([
      Object.freeze({ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0576s_lens0_pitch+0.jpg', sha256: '049db04e2a13453f4a6a8a6e50e225f5975545125664e91580abff00409d71e9', sourceSeconds: 576, lens: 0 }),
      Object.freeze({ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0588s_lens0_pitch+0.jpg', sha256: 'ca369dbd1ee3e53c58bfd1f4526ecaf18b7c742d23ffecffa3e781d7a148b04e', sourceSeconds: 588, lens: 0 }),
    ]),
    baselines: Object.freeze([
      Object.freeze({ path: 'test-artifacts/recording-visuals-20261025/baseline/full-R01-front.jpg', sha256: '0c3e08f9f724cbbefe74a489072bf890aeb2c1ce1a1f806f852051b02fc34ae7' }),
      Object.freeze({ path: 'test-artifacts/recording-visuals-20261025/baseline/full-R01-oblique.jpg', sha256: '86b978bd9cff440bff3a38b59cf2d91f702662e38bfe0889cc7fae3758246831' }),
    ]),
  }, 'Source shows the No Frills west-end facade with a broad yellow sign-bearing wall beside pale cladding. Both R01 baseline views show the mapped facade as mostly white with only a narrow yellow eave strip.', 'Panel span/color are visual estimates from dusk-lit perspective imagery. The frontage order is west (t=0) to east (t=1); the source image right side is west. Frame 0588 shows the separate pale return, which is untouched.', {
    facadePanels: Object.freeze([noFrillsYellowPanel]),
    signLayout: noFrillsSignLayout,
  }),
});

/** Apply only appearance fields, preserving identity, massing and existing profile overrides. */
export function applyRecordingReferenceAppearance(profile, enabled = true) {
  if (!enabled || !profile || typeof profile !== 'object') return profile;
  const record = RECORDING_REFERENCE_APPEARANCES[profile.id];
  if (!record) return profile;
  const appearance = record.appearance;
  let updated = profile;
  if (appearance.frontGarden && profile.frontGarden && typeof profile.frontGarden === 'object') {
    updated = { ...profile, frontGarden: { ...appearance.frontGarden, ...profile.frontGarden } };
  }
  if (Array.isArray(appearance.facadePanels)) {
    const panels = Array.isArray(updated.facadePanels) ? updated.facadePanels : [];
    const existingIds = new Set(panels.map(panel => panel?.referenceId).filter(Boolean));
    const additions = appearance.facadePanels.filter(panel => !existingIds.has(panel.referenceId));
    if (additions.length) updated = { ...updated, facadePanels: [...panels, ...additions] };
  }
  const layout = appearance.signLayout;
  if (layout && profile.signBoardHeightMetres == null && profile.signWidthMetres === layout.when.signWidthMetres && profile.signFraction === layout.when.signFraction && profile.signHeightMetres === layout.when.signHeightMetres) {
    updated = { ...updated, signWidthMetres: layout.signWidthMetres, signFraction: layout.signFraction, signHeightMetres: layout.signHeightMetres, signBoardHeightMetres: layout.signBoardHeightMetres };
  }
  return updated;
}
