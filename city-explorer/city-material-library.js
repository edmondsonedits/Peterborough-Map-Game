const PROVENANCE = 'original procedural';
const VERSION = 'ptbo-city-materials-v1';
const defineMaterial = (kind, intendedUse, scaleMeters, roughness, metalness, projection = 'world-axis') => Object.freeze({
  kind,
  intendedUse,
  provenance: PROVENANCE,
  licenseScope: 'original procedural code; no external imagery or texture license',
  scaleMeters: Object.freeze(scaleMeters),
  roughness,
  metalness,
  fallback: 'preserve base material color and render without procedural detail',
  estimatedTextureBytes: 0,
  projection,
});

export const CITY_MATERIALS = Object.freeze({
  asphalt: defineMaterial('asphalt', 'roads and paved lots', { grain: 0.08, patch: 6.0 }, 0.94, 0, 'world-planar'),
  brick: defineMaterial('brick', 'brick walls', { width: 0.24, height: 0.075, mortarHorizontal: 0.0084, mortarVertical: 0.002625 }, 0.9, 0, 'dominant-wall-axis'),
  concrete: defineMaterial('concrete', 'sidewalks, curbs, slabs', { jointSpacing: 3.2, jointWidth: 0.012, grain: 0.42 }, 0.95, 0, 'world-planar'),
  glass: defineMaterial('glass', 'glass color response only; no added mullion pattern', { variation: 2.5 }, 0.24, 0.1, 'dominant-face-axis'),
  grass: defineMaterial('grass', 'lawns, parks and grass cover', { grain: 0.9, patch: 4.0 }, 1, 0, 'world-planar'),
  'metal-roof': defineMaterial('metal-roof', 'standing-seam metal roofs', { seamSpacing: 0.55, panelVariation: 6.25 }, 0.42, 0.24, 'dominant-face-axis'),
  render: defineMaterial('render', 'plaster, painted masonry, and metal wall panels', { grain: 0.7, cloud: 3.57 }, 0.86, 0.02, 'dominant-face-axis'),
  roof: defineMaterial('roof', 'asphalt shingle and generic roof surfaces', { width: 0.34, height: 0.15, weathering: 2.38 }, 0.92, 0, 'dominant-face-axis'),
  stone: defineMaterial('stone', 'stone and block masonry walls', { width: 0.42, height: 0.28, mortarHorizontal: 0.0147, mortarVertical: 0.0098 }, 0.9, 0, 'dominant-wall-axis'),
  water: defineMaterial('water', 'water surfaces', { grain: 2.4, patch: 12.5 }, 0.2, 0.06, 'world-planar'),
});

export const CITY_PALETTE_SURFACES = Object.freeze({
  residential: 'brick',
  residentialBrick: 'brick',
  residentialPale: 'render',
  residentialSlate: 'stone',
  commercial: 'render',
  commercialGlass: 'glass',
  industrial: 'stone',
  industrialMetal: 'render',
  civic: 'stone',
  civicBrick: 'brick',
  stationBuffBrick: 'brick',
  stationRoof: 'roof',
  tower: 'glass',
  roofDark: 'roof',
  roofClay: 'roof',
  roofMetal: 'metal-roof',
  windowGlass: 'glass',
  storefrontGlass: 'glass',
  shelterGlass: 'glass',
  roadHighway: 'asphalt',
  roadArterial: 'asphalt',
  roadCollector: 'asphalt',
  roadLocal: 'asphalt',
  roadService: 'asphalt',
  roadTunnel: 'asphalt',
  officialRoad: 'asphalt',
  parking: 'asphalt',
  path: 'concrete',
  sidewalk: 'concrete',
  commercialLand: 'concrete',
  industrialLand: 'concrete',
  roadEdge: 'asphalt',
  roadShoulder: 'concrete',
  bridge: 'concrete',
  tunnelWall: 'stone',
  tunnelRoof: 'roof',
  curbConcrete: 'concrete',
  grass: 'grass',
  park: 'grass',
  residentialLand: 'grass',
  water: 'water',
});

const LEGACY_ASPHALT_EFFECT = [
  'float aaaAggregate = cityHash21(floor(vAaaWorldPosition.xz * 3.57));',
  'float aaaPatch = cityNoise21(vAaaWorldPosition.xz * 0.5);',
  'float aaaShade = mix(0.965, 1.035, aaaAggregate * 0.35 + aaaPatch * 0.65);',
  'diffuseColor.rgb *= mix(1.0, aaaShade, __CITY_STRENGTH__);',
].join('\n');
const EFFECTS = Object.freeze({
  asphalt: [
    'float aaaAggregateFootprint = max(fwidth(vAaaWorldPosition.x), fwidth(vAaaWorldPosition.z));',
    'float aaaAggregate = cityNoise21(vAaaWorldPosition.xz * 12.5);',
    'float aaaAggregateFade = 1.0 - smoothstep(0.018, 0.085, aaaAggregateFootprint);',
    'aaaAggregateFade *= 1.0 - smoothstep(45.0, 150.0, length(vAaaWorldPosition - cameraPosition));',
    'float aaaFineAggregate = mix(1.0, mix(0.985, 1.015, aaaAggregate), aaaAggregateFade);',
    'float aaaBroad = cityNoise21(vAaaWorldPosition.xz * 0.17) * 0.68 + cityNoise21(vAaaWorldPosition.xz * 0.055) * 0.32;',
    'float aaaAge = mix(0.955, 1.045, aaaBroad);',
    'float aaaShade = aaaAge * aaaFineAggregate;',
    'diffuseColor.rgb *= mix(1.0, aaaShade, __CITY_STRENGTH__);',
  ].join('\n'),
  brick: [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'vec2 aaaGrid = aaaUv / vec2(0.24, 0.075);',
    'aaaGrid.x += floor(aaaGrid.y) * 0.5;',
    'vec2 aaaCell = fract(aaaGrid);',
    'vec2 aaaAa = max(fwidth(aaaGrid), vec2(0.001));',
    'vec2 aaaEdge = min(aaaCell, 1.0 - aaaCell);',
    'vec2 aaaBrickInterior = smoothstep(vec2(0.035) - aaaAa, vec2(0.035) + aaaAa, aaaEdge);',
    'float aaaBrickMask = aaaBrickInterior.x * aaaBrickInterior.y;',
    'float aaaBrickTone = cityHash21(floor(aaaGrid));',
    'float aaaBrickLight = mix(0.955, mix(0.985, 1.025, aaaBrickTone), aaaBrickMask);',
    'diffuseColor.rgb *= mix(1.0, aaaBrickLight, __CITY_STRENGTH__);',
  ].join('\n'),
  concrete: [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'vec2 aaaGrid = aaaUv / 3.2;',
    'vec2 aaaCell = fract(aaaGrid);',
    'vec2 aaaAa = max(fwidth(aaaGrid), vec2(0.001));',
    'vec2 aaaEdge = min(aaaCell, 1.0 - aaaCell) * 3.2;',
    'float aaaWidth = max(aaaAa.x, aaaAa.y) * 3.2;',
    'float aaaJoint = 1.0 - smoothstep(0.012 - aaaWidth, 0.012 + aaaWidth, min(aaaEdge.x, aaaEdge.y));',
    'float aaaGrain = cityHash21(floor(aaaUv * 2.4));',
    'float aaaCloud = cityNoise21(aaaUv / 3.2);',
    'float aaaConcrete = mix(0.965, 1.035, aaaGrain * 0.35 + aaaCloud * 0.65) * mix(1.0, 0.91, aaaJoint);',
    'diffuseColor.rgb *= mix(1.0, aaaConcrete, __CITY_STRENGTH__);',
  ].join('\n'),
  glass: [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'float aaaGlassTone = cityNoise21(aaaUv * 0.4);',
    'float aaaGlass = mix(0.992, 1.008, aaaGlassTone);',
    'diffuseColor.rgb *= mix(1.0, aaaGlass, __CITY_STRENGTH__);',
  ].join('\n'),
  grass: [
    'float aaaGrassFine = cityHash21(floor(vAaaWorldPosition.xz * 1.11));',
    'float aaaGrassPatch = cityNoise21(vAaaWorldPosition.xz * 0.25);',
    'float aaaGrassShade = mix(0.965, 1.035, aaaGrassFine * 0.35 + aaaGrassPatch * 0.65);',
    'diffuseColor.rgb *= mix(1.0, aaaGrassShade, __CITY_STRENGTH__);',
  ].join('\n'),
  'metal-roof': [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'float aaaPanel = cityHash21(floor(aaaUv * 0.16));',
    'float aaaAcrossSeam = fract(aaaUv.x / 0.55);',
    'float aaaSeamAa = max(fwidth(aaaUv.x / 0.55), 0.001);',
    'float aaaSeam = 1.0 - smoothstep(0.018 - aaaSeamAa, 0.018 + aaaSeamAa, min(aaaAcrossSeam, 1.0 - aaaAcrossSeam));',
    'float aaaMetalRoof = mix(0.98, 1.02, aaaPanel) * mix(1.0, 0.92, aaaSeam);',
    'diffuseColor.rgb *= mix(1.0, aaaMetalRoof, __CITY_STRENGTH__);',
  ].join('\n'),
  render: [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'float aaaRenderGrain = cityHash21(floor(aaaUv * 1.43));',
    'float aaaRenderCloud = cityHash21(floor(aaaUv * 0.28));',
    'float aaaRenderTone = mix(0.975, 1.025, aaaRenderGrain * 0.35 + aaaRenderCloud * 0.65);',
    'diffuseColor.rgb *= mix(1.0, aaaRenderTone, __CITY_STRENGTH__);',
  ].join('\n'),
  roof: [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'vec2 aaaGrid = aaaUv / vec2(0.34, 0.15);',
    'aaaGrid.x += floor(aaaGrid.y) * 0.5;',
    'vec2 aaaCell = fract(aaaGrid);',
    'vec2 aaaAa = max(fwidth(aaaGrid), vec2(0.001));',
    'vec2 aaaEdge = min(aaaCell, 1.0 - aaaCell);',
    'vec2 aaaInterior = smoothstep(vec2(0.025) - aaaAa, vec2(0.025) + aaaAa, aaaEdge);',
    'float aaaShingle = aaaInterior.x * aaaInterior.y;',
    'float aaaWeather = cityHash21(floor(aaaUv * 0.42));',
    'float aaaRoofTone = mix(0.955, mix(0.985, 1.025, aaaWeather), aaaShingle);',
    'diffuseColor.rgb *= mix(1.0, aaaRoofTone, __CITY_STRENGTH__);',
  ].join('\n'),
  stone: [
    'vec2 aaaUv = citySurfaceUv(vAaaWorldPosition, vCityWorldNormal);',
    'vec2 aaaGrid = aaaUv / vec2(0.42, 0.28);',
    'aaaGrid.x += floor(aaaGrid.y) * 0.5;',
    'vec2 aaaCell = fract(aaaGrid);',
    'vec2 aaaAa = max(fwidth(aaaGrid), vec2(0.001));',
    'vec2 aaaEdge = min(aaaCell, 1.0 - aaaCell);',
    'vec2 aaaInterior = smoothstep(vec2(0.035) - aaaAa, vec2(0.035) + aaaAa, aaaEdge);',
    'float aaaStoneMask = aaaInterior.x * aaaInterior.y;',
    'float aaaStoneTone = cityHash21(floor(aaaGrid));',
    'float aaaStoneLight = mix(0.94, mix(0.985, 1.02, aaaStoneTone), aaaStoneMask);',
    'diffuseColor.rgb *= mix(1.0, aaaStoneLight, __CITY_STRENGTH__);',
  ].join('\n'),
  water: [
    'float aaaWaterA = cityHash21(floor(vAaaWorldPosition.xz * 0.42));',
    'float aaaWaterB = cityHash21(floor(vAaaWorldPosition.xz * 0.08));',
    'float aaaWaterTone = mix(0.99, 1.01, aaaWaterA * 0.65 + aaaWaterB * 0.35);',
    'diffuseColor.rgb *= mix(1.0, aaaWaterTone, __CITY_STRENGTH__);',
  ].join('\n'),
});

function materialHasClone(material) {
  return material && typeof material === 'object' && typeof material.clone === 'function';
}

function hasShaderAnchors(shader) {
  return typeof shader?.vertexShader === 'string'
    && typeof shader?.fragmentShader === 'string'
    && shader.vertexShader.includes('#include <common>')
    && shader.vertexShader.includes('#include <defaultnormal_vertex>')
    && shader.vertexShader.includes('#include <begin_vertex>')
    && shader.fragmentShader.includes('#include <common>')
    && shader.fragmentShader.includes('vec4 diffuseColor = vec4( diffuse, opacity );');
}

const SHADER_PREAMBLE = [
  'varying vec3 vAaaWorldPosition;',
  'varying vec3 vCityWorldNormal;',
  'float cityHash21(vec2 value) {',
  '  value = fract(value * vec2(123.34, 456.21));',
  '  value += dot(value, value + 45.32);',
  '  return fract(value.x * value.y);',
  '}',
  'float cityNoise21(vec2 point) {',
  '  vec2 cell = floor(point);',
  '  vec2 blend = fract(point);',
  '  blend = blend * blend * (3.0 - 2.0 * blend);',
  '  float a = cityHash21(cell);',
  '  float b = cityHash21(cell + vec2(1.0, 0.0));',
  '  float c = cityHash21(cell + vec2(0.0, 1.0));',
  '  float d = cityHash21(cell + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);',
  '}',
  'vec2 citySurfaceUv(vec3 position, vec3 worldNormal) {',
  '  vec3 axis = abs(normalize(worldNormal));',
  '  if (axis.y >= axis.x && axis.y >= axis.z) return position.xz;',
  '  if (axis.x >= axis.z) return position.zy;',
  '  return position.xy;',
  '}',
].join('\n');

function rendererMetadata(renderer) {
  const capabilities = renderer?.capabilities;
  if (!capabilities) return null;
  return {
    isWebGL2: capabilities.isWebGL2 === true,
    precision: typeof capabilities.precision === 'string' ? capabilities.precision : null,
  };
}

/** Decorate shared city materials with restrained, metre-scale procedural detail. */
export function installCityMaterialDetail(material, options = {}) {
  const kind = options.kind;
  const quality = options.quality === undefined ? 'full' : options.quality;
  const profile = CITY_MATERIALS[kind];
  if (!material || !profile || !EFFECTS[kind] || !['full', 'lite'].includes(quality)) return false;
  if (material.userData?.cityMaterialDetail) return false;

  const id = typeof options.id === 'string' && options.id.trim() ? options.id.trim() : kind;
  const originalCompile = material.onBeforeCompile;
  const originalCacheKey = typeof material.customProgramCacheKey === 'function'
    ? material.customProgramCacheKey
    : () => '';
  const baseCacheKey = String(originalCacheKey.call(material) || '');
  const strength = quality === 'lite' ? '0.52' : '1.00';
  const asphaltStyle = kind === 'asphalt' ? options.asphaltStyle === 'legacy' ? 'legacy' : 'improved' : null;
  const effectSource = asphaltStyle === 'legacy' ? LEGACY_ASPHALT_EFFECT : EFFECTS[kind];
  const effect = effectSource.replaceAll('__CITY_STRENGTH__', strength);

  material.onBeforeCompile = (shader, renderer) => {
    originalCompile?.call(material, shader, renderer);
    const rendererInfo = rendererMetadata(renderer);
    if (!hasShaderAnchors(shader)) {
      material.userData = {
        ...(material.userData || {}),
        cityMaterial: {
          ...(material.userData?.cityMaterial || {}),
          kind,
          id,
          quality,
          ...(asphaltStyle ? { asphaltStyle } : {}),
          scaleMeters: profile.scaleMeters,
          provenance: profile.provenance,
          version: VERSION,
          renderer: rendererInfo,
          shaderDetailFallback: true,
        },
        cityMaterialDetail: { kind, id, quality, ...(asphaltStyle ? { asphaltStyle } : {}), provenance: profile.provenance },
      };
      return;
    }

    const normalInjection = [
      '#include <defaultnormal_vertex>',
      'vCityWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);',
    ].join('\n');
    const positionInjection = [
      '#include <begin_vertex>',
      'vec4 cityWorldPosition = vec4(transformed, 1.0);',
      '#ifdef USE_BATCHING',
      '  cityWorldPosition = batchingMatrix * cityWorldPosition;',
      '#endif',
      '#ifdef USE_INSTANCING',
      '  cityWorldPosition = instanceMatrix * cityWorldPosition;',
      '#endif',
      'vAaaWorldPosition = (modelMatrix * cityWorldPosition).xyz;',
    ].join('\n');
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vAaaWorldPosition;\nvarying vec3 vCityWorldNormal;',
      )
      .replace('#include <defaultnormal_vertex>', normalInjection)
      .replace('#include <begin_vertex>', positionInjection);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SHADER_PREAMBLE)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity );\n' + effect);

    material.userData = {
      ...(material.userData || {}),
      cityMaterial: {
        ...(material.userData?.cityMaterial || {}),
        kind,
        id,
        quality,
        ...(asphaltStyle ? { asphaltStyle } : {}),
        scaleMeters: profile.scaleMeters,
        provenance: profile.provenance,
        version: VERSION,
        renderer: rendererInfo,
        shaderDetailFallback: false,
      },
      cityMaterialDetail: { kind, id, quality, ...(asphaltStyle ? { asphaltStyle } : {}), provenance: profile.provenance },
    };
  };

  material.customProgramCacheKey = () => baseCacheKey + '|' + VERSION + ':' + kind + ':' + quality + (asphaltStyle === 'legacy' ? ':legacy' : '');
  material.userData = {
    ...(material.userData || {}),
    cityMaterial: {
      ...(material.userData?.cityMaterial || {}),
      kind,
      id,
      quality,
      ...(asphaltStyle ? { asphaltStyle } : {}),
      scaleMeters: profile.scaleMeters,
      provenance: profile.provenance,
      version: VERSION,
      renderer: null,
      shaderDetailFallback: false,
    },
    cityMaterialDetail: { kind, id, quality, ...(asphaltStyle ? { asphaltStyle } : {}), provenance: profile.provenance },
  };
  material.needsUpdate = true;
  return true;
}

/**
 * Three.Material.copy omits onBeforeCompile and customProgramCacheKey.
 * Keep the source hook closures and their source-material context for city batches.
 */
export function cloneCityMaterial(material) {
  if (!materialHasClone(material)) return null;
  const clone = material.clone();
  const originalCompile = material.onBeforeCompile;
  const originalCacheKey = material.customProgramCacheKey;

  if (typeof originalCompile === 'function') {
    clone.onBeforeCompile = (shader, renderer) => {
      originalCompile.call(material, shader, renderer);
      if (clone.userData?.cityMaterial) {
        clone.userData = {
          ...clone.userData,
          cityMaterial: {
            ...clone.userData.cityMaterial,
            renderer: rendererMetadata(renderer),
            shaderDetailFallback: Boolean(material.userData?.cityMaterial?.shaderDetailFallback),
          },
        };
      }
    };
  }
  if (typeof originalCacheKey === 'function') {
    clone.customProgramCacheKey = () => originalCacheKey.call(material);
  }
  clone.userData = { ...(clone.userData || {}), ...(material.userData || {}) };
  return clone;
}
