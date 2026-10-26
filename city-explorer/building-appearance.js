const DEFAULT_PRESETS = {
  residential: {
    confidence: 'conservative',
    components: {
      window: {widthMetres: 1.35, heightMetres: 1.4, frameWidthMetres: 0.18, frameMaterialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'},
      sill: {enabled: true, widthExtraMetres: 0.28, heightMetres: 0.1, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      cornice: {enabled: true, widthInsetMetres: 0.9, heightMetres: 0.2, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      entry: {widthMetres: 1, heightMetres: 2.25, frameWidthMetres: 0.22, materialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'}
    },
    layout: {maxColumns: 4, maxFloors: 3, pitchMetres: 2.8, frameOffsetMetres: 0.03, glassOffsetMetres: 0.055}
  },
  storefront: {
    confidence: 'conservative',
    components: {
      window: {widthMetres: 2.6, heightMetres: 2.1, frameWidthMetres: 0.18, frameMaterialKey: 'facadeTrim', glassMaterialKey: 'storefrontGlass'},
      sill: {enabled: false, widthExtraMetres: 0.16, heightMetres: 0.08, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      cornice: {enabled: true, widthInsetMetres: 0.9, heightMetres: 0.2, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      lintel: {enabled: true, widthInsetMetres: 0.9, heightMetres: 0.18, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      entry: {widthMetres: 1.3, heightMetres: 2.35, frameWidthMetres: 0.22, materialKey: 'facadeTrim', glassMaterialKey: 'storefrontGlass'}
    },
    layout: {maxColumns: 7, maxFloors: 5, pitchMetres: 3.2, frameOffsetMetres: 0.03, glassOffsetMetres: 0.055}
  },
  apartment: {
    confidence: 'conservative',
    components: {
      window: {widthMetres: 1.45, heightMetres: 1.4, frameWidthMetres: 0.16, frameMaterialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'},
      sill: {enabled: false, widthExtraMetres: 0.2, heightMetres: 0.08, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      cornice: {enabled: true, widthInsetMetres: 0.9, heightMetres: 0.2, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      entry: {widthMetres: 1.1, heightMetres: 2.3, frameWidthMetres: 0.2, materialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'}
    },
    layout: {maxColumns: 7, maxFloors: 5, pitchMetres: 3.15, frameOffsetMetres: 0.03, glassOffsetMetres: 0.055}
  },
  civic: {
    confidence: 'conservative',
    components: {
      window: {widthMetres: 1.5, heightMetres: 1.5, frameWidthMetres: 0.18, frameMaterialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'},
      sill: {enabled: false, widthExtraMetres: 0.2, heightMetres: 0.08, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      cornice: {enabled: true, widthInsetMetres: 0.9, heightMetres: 0.22, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      entry: {widthMetres: 1.15, heightMetres: 2.4, frameWidthMetres: 0.22, materialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'}
    },
    layout: {maxColumns: 7, maxFloors: 5, pitchMetres: 3.5, frameOffsetMetres: 0.03, glassOffsetMetres: 0.055}
  },
  industrial: {
    confidence: 'conservative',
    components: {
      window: {widthMetres: 2, heightMetres: 1.3, frameWidthMetres: 0.16, frameMaterialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'},
      sill: {enabled: false, widthExtraMetres: 0.2, heightMetres: 0.08, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      cornice: {enabled: true, widthInsetMetres: 0.9, heightMetres: 0.2, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      entry: {widthMetres: 1.2, heightMetres: 2.3, frameWidthMetres: 0.2, materialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'}
    },
    layout: {maxColumns: 7, maxFloors: 1, pitchMetres: 5.8, frameOffsetMetres: 0.03, glassOffsetMetres: 0.055}
  },
  ancillary: {
    confidence: 'conservative',
    components: {
      window: {widthMetres: 0.9, heightMetres: 1, frameWidthMetres: 0.14, frameMaterialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'},
      sill: {enabled: false, widthExtraMetres: 0.16, heightMetres: 0.07, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      cornice: {enabled: false, widthInsetMetres: 0.9, heightMetres: 0.16, offsetMetres: 0.065, materialKey: 'facadeTrim'},
      entry: {widthMetres: 0.9, heightMetres: 2.1, frameWidthMetres: 0.18, materialKey: 'facadeTrim', glassMaterialKey: 'windowGlass'}
    },
    layout: {maxColumns: 2, maxFloors: 1, pitchMetres: 4, frameOffsetMetres: 0.03, glassOffsetMetres: 0.055}
  }
};

const FEATURE_APPEARANCE_OVERRIDES = Object.freeze({});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function classify(tags, wallHeight, footprintArea) {
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const use = `${type} ${tags.shop || ''} ${tags.office || ''} ${tags.amenity || ''} ${tags.tourism || ''}`.toLowerCase();
  if (/^(garage|garages|shed|carport|roof|greenhouse)$/.test(type)) return 'ancillary';
  if (/industrial|warehouse|manufactur/.test(use)) return 'industrial';
  if (/school|college|university|hospital|church|cathedral|civic|public|fire_station|library|community_centre/.test(use)) return 'civic';
  if ((tags.shop && tags.shop !== 'no') || /retail|commercial|office|supermarket|mall|restaurant|cafe|fast_food|bank/.test(use)) return 'storefront';
  if (/apartments|dormitory|hotel/.test(use)) return 'apartment';
  if (/house|detached|semidetached|bungalow|terrace|residential/.test(type)) return 'residential';
  return wallHeight > 10 && footprintArea > 180 ? 'apartment' : 'residential';
}

function mergeAppearance(base, override) {
  const merged = {components: {}, layout: {...base.layout}};
  for (const [component, properties] of Object.entries(base.components)) merged.components[component] = {...properties};
  if (!override || typeof override !== 'object') return merged;
  const componentKeys = Object.keys(merged.components);
  for (const component of componentKeys) {
    const source = override.components?.[component];
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const key of Object.keys(merged.components[component])) {
      if (!own(source, key)) continue;
      const existing = merged.components[component][key], candidate = source[key];
      if (typeof existing === 'boolean') {
        if (typeof candidate === 'boolean') merged.components[component][key] = candidate;
      } else if (typeof existing === 'number') {
        if (Number.isFinite(candidate)) merged.components[component][key] = clamp(candidate, 0.01, 12);
      } else if (typeof existing === 'string') {
        if (typeof candidate === 'string' && /^[\w#.-]{1,48}$/.test(candidate)) merged.components[component][key] = candidate;
      }
    }
  }
  const layoutSource = override.layout;
  if (layoutSource && typeof layoutSource === 'object' && !Array.isArray(layoutSource)) {
    for (const key of Object.keys(merged.layout)) if (Number.isFinite(layoutSource[key])) merged.layout[key] = clamp(layoutSource[key], 0.1, 20);
  }
  return merged;
}

export const CONSERVATIVE_BUILDING_PRESETS = freezeDeep(DEFAULT_PRESETS);
export { FEATURE_APPEARANCE_OVERRIDES };

/** Resolve only facade appearance data. Tags, identity, dimensions, and geometry are never changed. */
export function resolveBuildingAppearance({tags = {}, featureId = '', wallHeight = 0, footprintArea = 0, override, quality = 'default'} = {}) {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) tags = {};
  const archetype = classify(tags, Number(wallHeight) || 0, Number(footprintArea) || 0);
  const preset = CONSERVATIVE_BUILDING_PRESETS[archetype] || CONSERVATIVE_BUILDING_PRESETS.residential;
  const selectedOverride = override || FEATURE_APPEARANCE_OVERRIDES[String(featureId)] || undefined;
  const normalized = mergeAppearance(preset, selectedOverride);
  return freezeDeep({
    presetId: archetype,
    archetype,
    confidence: selectedOverride ? 'reviewed-appearance' : preset.confidence,
    quality: ['lite', 'default', 'legacy'].includes(quality) ? quality : 'default',
    components: normalized.components,
    layout: normalized.layout
  });
}
