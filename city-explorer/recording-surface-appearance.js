/** Conservative surface colours observed across the user's driving references.
 * These are appearance defaults, not sampled albedo or new site boundaries.
 */
export const RECORDING_SURFACE_PALETTE = Object.freeze({
  parking: Object.freeze({ previous: 0x3c4444, color: 0x4c4d4a, use: 'Existing asphalt parking surfaces; neutral weathered grey.' }),
  path: Object.freeze({ previous: 0x87907e, color: 0x93948e, use: 'Existing concrete paths; reduced green cast.' }),
  grass: Object.freeze({ previous: 0x386c46, color: 0x4b6b48, use: 'Existing grass areas; restrained yellow-green.' }),
  park: Object.freeze({ previous: 0x245e3d, color: 0x3f603f, use: 'Existing park grass; avoid dark emerald fill.' }),
  residentialLand: Object.freeze({ previous: 0x315b40, color: 0x415d40, use: 'Existing residential ground; muted grass fallback.' }),
});

export function recordingExpansionEnabled(search = '') {
  const params = new URLSearchParams(search);
  return params.get('recordingExpansion') !== 'off' && params.get('recordingReferences') !== 'off' && params.get('visuals') !== 'legacy';
}

/** Keep geometry/shader settings and explicit custom colours unchanged. */
export function applyRecordingSurfacePalette(materials, enabled = true) {
  if (!enabled) return [];
  const changed = [];
  for (const [key, entry] of Object.entries(RECORDING_SURFACE_PALETTE)) {
    const color = materials[key]?.color;
    if (color?.getHex?.() !== entry.previous) continue;
    color.setHex(entry.color);
    changed.push(key);
  }
  return changed;
}
