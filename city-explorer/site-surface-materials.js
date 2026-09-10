/** Appearance zones digitized from Ontario SCOOP 2023, not new collision meshes.
 * Boundaries are approximate visual interpretation, not a surveyed error bound.
 * Source/licence: packaged station-one survey metadata, OGL Ontario.
 */
export const STATION_APRON = Object.freeze([
  [-78.3224151, 44.3008868], [-78.3221152, 44.3008974],
  [-78.322109, 44.300773], [-78.322408, 44.300762],
]);
export const STATION_REAR_PAVING = Object.freeze([
  [-78.32244, 44.301065], [-78.32190, 44.301085],
  [-78.32191, 44.30133], [-78.32246, 44.30131],
]);

export function installStationApron(material, project) {
  const zones = [
    { points: STATION_APRON, color: 'vec3(0.40, 0.39, 0.35)' },
    { points: STATION_REAR_PAVING, color: 'vec3(0.105, 0.115, 0.11)' },
  ];
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const cacheKey = previousKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    // Existing asphalt decorator provides the world-space varying/hash.
    const fragments = zones.map((zone) => {
    const points = zone.points.map(([lon, lat]) => project(lat, lon));
    const edges = points.map((a, index) => {
      const b = points[(index + 1) % points.length];
      return `((p.x - ${a.x.toFixed(6)}) * ${(b.y - a.y).toFixed(6)} - (p.y - ${a.y.toFixed(6)}) * ${(b.x - a.x).toFixed(6)})`;
    });
    return `
      if ((${edges.map(edge => `${edge} >= 0.0`).join(' && ')}) || (${edges.map(edge => `${edge} <= 0.0`).join(' && ')})) {
        // Neutral concrete character. Joints are illustrative, not digitized.
        diffuseColor.rgb = ${zone.color};
      }
    `;
    }).join('\n');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nvec2 p = vAaaWorldPosition.xz;\n' + fragments);
  };
  material.customProgramCacheKey = () => `${cacheKey}-station-surfaces-2`;
  material.needsUpdate = true;
}
