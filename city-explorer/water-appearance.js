export function installWaterAppearance(material) {
  const time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ptboWaterTime = time;
    shader.vertexShader = 'varying vec2 ptboWaterXZ;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nptboWaterXZ = (modelMatrix * vec4(position, 1.0)).xz;',
    );
    shader.fragmentShader = 'varying vec2 ptboWaterXZ;\nuniform float ptboWaterTime;\n' +
      shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec2 p = ptboWaterXZ;
        float t = ptboWaterTime;
        float detail = 1.0 - smoothstep(0.12, 1.4, max(length(dFdx(p)), length(dFdy(p))));
        float a = sin(dot(p, vec2(2.1, 0.8)) - t * 1.4);
        float b = sin(dot(p, vec2(-0.9, 3.2)) + t * 1.1);
        normal = normalize(normal + mat3(viewMatrix) * vec3(a, 0.0, b) * (0.065 * detail));
        float grazing = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float sheen = grazing * grazing;
        float broad = sin(dot(p, vec2(0.16, 0.23)) - t * 0.35)
          * sin(dot(p, vec2(-0.27, 0.08)) + t * 0.19);
        diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + 0.024 * broad + 0.018 * a * b * detail),
          vec3(0.19, 0.31, 0.38), 0.60 * sheen);
      `);
  };
  material.customProgramCacheKey = () => 'peterborough-water-ripples';
  return time;
}
