const freezeDeep = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
};

// Compact, source-grounded facade deltas. The complete 51-target review lives in
// data/corridor-recording-review.json and is cross-checked by the focused test.
export const CORRIDOR_RECORDING_APPEARANCES = freezeDeep({
  'way/1009651246': {
    id: 'way/1009651246', disposition: 'represented-with-limitations',
    source: [{ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0600s_lens1_pitch+0.jpg', sha256: '5dc60edc300f90b8683312ead55a3d064cd80c01f27261b582fe00131663a0f9', pixelInspected: true }],
    evidence: 'Single-level flat-roof dark gray commercial frontage with pale stone base and sparse door/window openings.',
    appearance: { plinthColor: '#b7b3a8', plinthHeight: 0.8 },
  },
  'way/1009651260': {
    id: 'way/1009651260', disposition: 'represented-with-limitations',
    source: [{ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0612s_lens1_pitch+0.jpg', sha256: 'dce52eaa50de031aa788401666e1be0961bf176969f019765c45cec3b8714ec5', pixelInspected: true }],
    evidence: 'Three broad horizontal ribbon-window rows separated by wide concrete bands; glazed projecting corner entrance.',
    appearance: { doorFraction: 0.12 },
  },
  'way/1009651262': {
    id: 'way/1009651262', disposition: 'represented-with-limitations',
    source: [{ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0630s_lens1_pitch+0.jpg', sha256: 'b5cc43b4de1ca36f6ce8557d5d9884ed15d72cf060b843b40d788c5a1f2b530a', pixelInspected: true }],
    evidence: 'Showplace east wing has red brick, stepped parapet, arched upper window and a glazed ground-level entrance.',
    appearance: { windowOverrides: [{ level: 1, column: 1, shape: 'arch', widthMetres: 1.8, heightMetres: 2.2, referenceId: 'source-0630-lens1-upper-center-arch' }] },
  },
  'way/995887447': {
    id: 'way/995887447', disposition: 'represented-with-limitations',
    source: [{ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0636s_lens0_pitch+0.jpg', sha256: '71174d64dccf4e92031862246ed7512ecaac79d14f713051748d42e2721592db', pixelInspected: true }],
    evidence: 'Robinson Place lower wing is pale masonry with green-framed, large ground-floor panes separated by visible piers and a covered entrance; complex rear/upper mass remains simplified.',
    appearance: { windowOverrides: Array.from({ length: 10 }, (_, column) => ({
      level: 0, column, shape: 'rectangle', heightMetres: 3.2,
      referenceId: `source-0636-lens0-ground-bay-${column}`,
    })) },
  },
  'way/1006243553': {
    id: 'way/1006243553', disposition: 'represented-with-limitations',
    source: [{ path: 'Peterborough-Building-References-20261024/sherbrooke-water-hunter/perspective-2048/0732s_lens0_pitch+0.jpg', sha256: '521bd8dd8c4104630ed90dea6a4b9a4af110a4ba95f82c072756904548c6474e', pixelInspected: true }],
    evidence: 'Tall red brick shop frontage has three levels, dark storefront bands and pale cornice/trim.',
    appearance: { archedWindowLevels: [2] },
  },
});

const appearanceFields = new Set([
  'wallColor', 'trimColor', 'plinthHeight', 'plinthColor',
  'windowWidthMetres', 'windowHeightMetres', 'doorFraction',
  'glazedLevels', 'glazedLevelHeights', 'archedWindowLevels', 'windowOverrides',
  'features', 'facadePanels', 'frontGarden',
]);

function applyValue(profile, key, value) {
  if (!appearanceFields.has(key) || value == null) return profile;

  if (key === 'glazedLevelHeights' && typeof value === 'object' && !Array.isArray(value)) {
    const current = profile[key] && typeof profile[key] === 'object' ? profile[key] : {};
    const additions = Object.fromEntries(Object.entries(value).filter(([floor]) => current[floor] == null));
    return Object.keys(additions).length ? { ...profile, [key]: { ...current, ...additions } } : profile;
  }

  if (key === 'frontGarden' && typeof value === 'object' && !Array.isArray(value)) {
    const current = profile.frontGarden && typeof profile.frontGarden === 'object' ? profile.frontGarden : {};
    const additions = Object.fromEntries(Object.entries(value).filter(([field]) => current[field] == null));
    return Object.keys(additions).length ? { ...profile, frontGarden: { ...current, ...additions } } : profile;
  }

  if (key === 'windowOverrides' && Array.isArray(value)) {
    const current = Array.isArray(profile.windowOverrides) ? profile.windowOverrides : [];
    const slots = new Set(current.filter(item => Number.isInteger(item?.level) && Number.isInteger(item?.column)).map(item => `${item.level}:${item.column}`));
    const refs = new Set(current.map(item => item?.referenceId).filter(Boolean));
    const additions = value.filter(item => {
      const slot = `${item.level}:${item.column}`;
      return item?.referenceId && !refs.has(item.referenceId) && !slots.has(slot);
    });
    return additions.length ? { ...profile, windowOverrides: [...current, ...additions] } : profile;
  }
  if (key === 'facadePanels' && Array.isArray(value)) {
    const current = Array.isArray(profile.facadePanels) ? profile.facadePanels : [];
    const ids = new Set(current.map(panel => panel?.referenceId).filter(Boolean));
    const additions = value.filter(panel => panel?.referenceId && !ids.has(panel.referenceId));
    return additions.length ? { ...profile, facadePanels: [...current, ...additions] } : profile;
  }

  // Profile arrays are authored overrides. Fill an absent field, but do not append
  // to an explicit per-building selection such as glazedLevels: [].
  if (Array.isArray(value)) return profile[key] == null ? { ...profile, [key]: value } : profile;
  return profile[key] == null ? { ...profile, [key]: value } : profile;
}

/** Apply reviewed facade-only additions. Existing explicit per-building values win. */
export function applyCorridorRecordingAppearance(profile, enabled = true) {
  if (!enabled || !profile || typeof profile !== 'object') return profile;
  const record = CORRIDOR_RECORDING_APPEARANCES[profile.id];
  if (!record) return profile;
  let updated = profile;
  for (const [key, value] of Object.entries(record.appearance)) updated = applyValue(updated, key, value);
  return updated;
}
