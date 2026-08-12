/*
  DOWNTOWN–LITTLE LAKE HERO-QUALITY LAYER

  This module contains presentation rules only. Geographic coordinates,
  terrain, roads, buildings and water remain authoritative in their existing
  GIS layers. The bounded slice lets desktop hardware spend more on surface
  response, atmosphere and local detail without making the complete city pay
  the same rendering cost.
*/

export const VERTICAL_SLICE_BOUNDS = Object.freeze({
  west: -78.3285,
  south: 44.2890,
  east: -78.2990,
  north: 44.3135,
});

export function coordinateInVerticalSlice(lat, lon, paddingDegrees = 0) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return longitude >= VERTICAL_SLICE_BOUNDS.west - paddingDegrees
    && longitude <= VERTICAL_SLICE_BOUNDS.east + paddingDegrees
    && latitude >= VERTICAL_SLICE_BOUNDS.south - paddingDegrees
    && latitude <= VERTICAL_SLICE_BOUNDS.north + paddingDegrees;
}

export function projectedVerticalSliceBounds(project, paddingMetres = 0) {
  if (typeof project !== 'function') return null;
  const corners = [
    project(VERTICAL_SLICE_BOUNDS.south, VERTICAL_SLICE_BOUNDS.west),
    project(VERTICAL_SLICE_BOUNDS.south, VERTICAL_SLICE_BOUNDS.east),
    project(VERTICAL_SLICE_BOUNDS.north, VERTICAL_SLICE_BOUNDS.west),
    project(VERTICAL_SLICE_BOUNDS.north, VERTICAL_SLICE_BOUNDS.east),
  ];
  if (corners.some((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return null;
  const padding = Math.max(0, Number(paddingMetres) || 0);
  return {
    minX: Math.min(...corners.map((point) => point.x)) - padding,
    maxX: Math.max(...corners.map((point) => point.x)) + padding,
    minZ: Math.min(...corners.map((point) => point.y)) - padding,
    maxZ: Math.max(...corners.map((point) => point.y)) + padding,
  };
}

export function worldPointInVerticalSlice(x, z, bounds) {
  if (!bounds || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) return false;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

const SURFACE_FRAGMENTS = Object.freeze({
  asphalt: `
    float aaaAggregate = aaaHash21(floor(vAaaWorldPosition.xz * 1.55));
    float aaaPatch = aaaHash21(floor(vAaaWorldPosition.xz * 0.055));
    float aaaShade = mix(0.91, 1.045, aaaAggregate * 0.68 + aaaPatch * 0.32);
    diffuseColor.rgb *= aaaShade;
  `,
  brick: `
    float aaaCourse = step(0.075, fract((vAaaWorldPosition.y + 0.11) / 0.72));
    float aaaBond = step(0.05, fract((vAaaWorldPosition.x + vAaaWorldPosition.z) / 1.42
      + floor(vAaaWorldPosition.y / 0.72) * 0.5));
    float aaaBrick = aaaCourse * aaaBond;
    float aaaVariation = aaaHash21(floor(vAaaWorldPosition.xz * 0.48) + floor(vAaaWorldPosition.y));
    diffuseColor.rgb *= mix(vec3(0.79), vec3(mix(0.94, 1.055, aaaVariation)), aaaBrick);
  `,
  masonry: `
    float aaaPanel = aaaHash21(floor(vAaaWorldPosition.xz * 0.34) + floor(vAaaWorldPosition.y * 0.33));
    diffuseColor.rgb *= mix(0.91, 1.055, aaaPanel);
  `,
  roof: `
    float aaaRoofGrain = aaaHash21(floor(vAaaWorldPosition.xz * 0.82));
    float aaaRoofWeather = aaaHash21(floor(vAaaWorldPosition.xz * 0.075));
    diffuseColor.rgb *= mix(0.88, 1.06, aaaRoofGrain * 0.62 + aaaRoofWeather * 0.38);
  `,
  grass: `
    float aaaGrassFine = aaaHash21(floor(vAaaWorldPosition.xz * 0.34));
    float aaaGrassPatch = aaaHash21(floor(vAaaWorldPosition.xz * 0.045));
    diffuseColor.rgb *= mix(0.82, 1.08, aaaGrassFine * 0.38 + aaaGrassPatch * 0.62);
  `,
  water: `
    float aaaWaveA = sin(vAaaWorldPosition.x * 0.075 + vAaaWorldPosition.z * 0.031);
    float aaaWaveB = sin(vAaaWorldPosition.x * -0.026 + vAaaWorldPosition.z * 0.091);
    float aaaWaterPatch = aaaHash21(floor(vAaaWorldPosition.xz * 0.025));
    float aaaWaterLight = 0.5 + 0.5 * (aaaWaveA * 0.58 + aaaWaveB * 0.42);
    diffuseColor.rgb *= mix(0.79, 1.13, aaaWaterLight * 0.72 + aaaWaterPatch * 0.28);
  `,
});

/** Add deterministic world-space microvariation without texture downloads. */
export function installWorldSurfaceDetail(material, kind) {
  if (!material || !SURFACE_FRAGMENTS[kind] || material.userData?.worldSurfaceDetail === kind) return false;
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    originalCompile?.(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAaaWorldPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAaaWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vAaaWorldPosition;
float aaaHash21(vec2 value) {
  value = fract(value * vec2(123.34, 456.21));
  value += dot(value, value + 45.32);
  return fract(value.x * value.y);
}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );\n${SURFACE_FRAGMENTS[kind]}`,
      );
  };
  material.customProgramCacheKey = () => `ptbo-world-surface-${kind}-v1`;
  material.userData = { ...(material.userData || {}), worldSurfaceDetail: kind };
  material.needsUpdate = true;
  return true;
}

const SKY_THEMES = Object.freeze({
  day: {
    zenith: 0x4779a5,
    horizon: 0xb8d1d4,
    lower: 0xd9d0b9,
    sun: 0xfff1c9,
    cloud: 0xf4f1df,
    cloudStrength: 0.095,
    starStrength: 0,
  },
  dusk: {
    zenith: 0x132d46,
    horizon: 0xc18468,
    lower: 0x44342e,
    sun: 0xffc47d,
    cloud: 0xd5aa93,
    cloudStrength: 0.08,
    starStrength: 0.02,
  },
  night: {
    zenith: 0x01050d,
    horizon: 0x071724,
    lower: 0x020408,
    sun: 0x8ea9c8,
    cloud: 0x26394b,
    cloudStrength: 0.08,
    starStrength: 0.62,
  },
});

export function createSkyAtmosphere(THREE, radius = 18000) {
  const theme = SKY_THEMES.day;
  const uniforms = {
    uZenith: { value: new THREE.Color(theme.zenith) },
    uHorizon: { value: new THREE.Color(theme.horizon) },
    uLower: { value: new THREE.Color(theme.lower) },
    uSunColor: { value: new THREE.Color(theme.sun) },
    uCloudColor: { value: new THREE.Color(theme.cloud) },
    uCloudStrength: { value: theme.cloudStrength },
    uStarStrength: { value: theme.starStrength },
    uSunDirection: { value: new THREE.Vector3(-0.42, 0.34, -0.84).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vSkyDirection;
      void main() {
        vSkyDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vSkyDirection;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uLower;
      uniform vec3 uSunColor;
      uniform vec3 uCloudColor;
      uniform vec3 uSunDirection;
      uniform float uCloudStrength;
      uniform float uStarStrength;
      float hash21(vec2 value) {
        value = fract(value * vec2(123.34, 345.45));
        value += dot(value, value + 34.345);
        return fract(value.x * value.y);
      }
      void main() {
        vec3 direction = normalize(vSkyDirection);
        float upper = smoothstep(-0.03, 0.72, direction.y);
        vec3 colour = mix(uLower, mix(uHorizon, uZenith, upper), smoothstep(-0.24, 0.05, direction.y));
        float sunCore = pow(max(dot(direction, uSunDirection), 0.0), 920.0);
        float sunGlow = pow(max(dot(direction, uSunDirection), 0.0), 22.0);
        colour += uSunColor * (sunCore * 1.7 + sunGlow * 0.12);
        float angle = atan(direction.z, direction.x);
        float band = sin(angle * 7.0 + direction.y * 53.0)
          + sin(angle * 13.0 - direction.y * 37.0) * 0.48
          + sin(angle * 29.0 + direction.y * 91.0) * 0.2;
        float cloudMask = smoothstep(1.08, 1.5, band)
          * smoothstep(0.025, 0.12, direction.y)
          * (1.0 - smoothstep(0.48, 0.76, direction.y));
        colour = mix(colour, uCloudColor, cloudMask * uCloudStrength);
        vec2 starCell = floor(vec2(angle * 190.0, direction.y * 410.0));
        float stars = step(0.993, hash21(starCell)) * smoothstep(0.08, 0.38, direction.y);
        colour += vec3(stars * uStarStrength);
        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.name = 'Peterborough procedural atmosphere';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData = { type: 'procedural-atmosphere', radius };

  const setTheme = (name) => {
    const selected = SKY_THEMES[name] || SKY_THEMES.day;
    uniforms.uZenith.value.set(selected.zenith);
    uniforms.uHorizon.value.set(selected.horizon);
    uniforms.uLower.value.set(selected.lower);
    uniforms.uSunColor.value.set(selected.sun);
    uniforms.uCloudColor.value.set(selected.cloud);
    uniforms.uCloudStrength.value = selected.cloudStrength;
    uniforms.uStarStrength.value = selected.starStrength;
  };
  return { mesh, setTheme, uniforms };
}
