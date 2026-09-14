// Original illustrative palettes applied to existing Blender vertex colours.
// Geometry, placement, bark and resource counts are preserved.
export const VEGETATION_PALETTES = Object.freeze({
  crimson: Object.freeze([0.105, 0.036, 0.027]),
  olive: Object.freeze([0.18, 0.22, 0.065]),
});

export function recolorVegetation(geometry, palette) {
  const target = VEGETATION_PALETTES[palette];
  if (!target) throw new Error(`Unknown vegetation palette: ${palette}`);
  const colors = geometry.getAttribute('color');
  if (!colors || colors.itemSize < 3) throw new Error('Vegetation requires vertex colours');
  const variant = geometry.clone();
  const output = variant.getAttribute('color');
  let changedVertices = 0;
  for (let i = 0; i < colors.count; i += 1) {
    const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
    // Generator leaves have green > red; bark has red > green.
    if (g <= r) continue;
    const shade = Math.max(0.55, Math.min(1.45, g / 0.28));
    output.setXYZ(i, target[0] * shade, target[1] * shade, target[2] * shade);
    changedVertices += 1;
  }
  if (!changedVertices) { variant.dispose(); throw new Error('No foliage vertices found'); }
  output.needsUpdate = true;
  variant.userData = { ...variant.userData, palette, changedVertices, appearance: 'illustrative-reference-inspired' };
  return variant;
}

export function createVegetationVariant(family, palette) {
  const lods = [];
  try {
    for (const level of family.lods) lods.push({ ...level, geometry: recolorVegetation(level.geometry, palette) });
    return { ...family, family: `${family.family}-${palette}`, lods,
      provenance: 'Illustrative palette from possibly Gemini-altered street references; not measured colour or species.' };
  } catch (error) {
    lods.forEach(level => level.geometry.dispose());
    throw error;
  }
}

// Deliberately bounded pilot. Other survey/district trees retain existing appearance.
export function stationOneVegetationPalette(featureId) {
  return featureId === 'station1-tree-front' ? 'crimson' : null;
}
