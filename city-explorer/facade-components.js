const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : fallback, min, max);
}

/**
 * Produce bounded, edge-local facade panels for the existing batched-panel renderer.
 * Returned coordinates are metres relative to the wall and normalized across its edge.
 */
export function facadeComponentPlan({appearance, edgeLength, wallHeight, floorCount, front = false, lite = false, featureId = ''} = {}) {
  if (!appearance || !Number.isFinite(edgeLength) || !Number.isFinite(wallHeight) || edgeLength < 2.3 || wallHeight < 2.4 || appearance.archetype === 'ancillary') return [];
  const components = appearance.components || {}, layout = appearance.layout || {};
  const archetype = appearance.archetype || 'residential';
  const limit = lite ? 24 : 80;
  const margin = Math.min(0.9, edgeLength * 0.14), usable = edgeLength - margin * 2;
  const pitch = bounded(layout.pitchMetres, 3.1, 2, 8);
  const maxColumns = bounded(layout.maxColumns, 4, 1, 12);
  const maxFloors = bounded(layout.maxFloors, 3, 1, 8);
  const columns = Math.max(1, Math.min(lite ? 3 : maxColumns, Math.floor(usable / pitch)));
  const floors = Math.max(1, Math.min(
    Number.isFinite(Number(floorCount)) && Number(floorCount) > 0 ? Math.round(Number(floorCount)) : Math.round(wallHeight / 3.15),
    Math.floor(wallHeight / 2.4), maxFloors, lite ? 2 : maxFloors
  ));
  const floorPitch = wallHeight / floors;
  const spacing = usable / columns;
  const panels = [];
  const add = (kind, materialKey, center, width, lowerY, upperY, offset = 0.055) => {
    if (panels.length >= limit) return false;
    width = Math.min(width, usable);
    lowerY = Math.max(0.08, lowerY);
    upperY = Math.min(wallHeight - 0.08, upperY);
    if (width < 0.08 || upperY - lowerY < 0.04) return false;
    center = Math.max(margin + width / 2, Math.min(edgeLength - margin - width / 2, center));
    panels.push({kind, materialKey, t: center / edgeLength, width, lowerY, upperY, offset: clamp(offset, 0, 0.25)});
    return true;
  };
  const cornice = components.cornice;
  if (cornice?.enabled) {
    const inset = bounded(cornice.widthInsetMetres, 0.9, 0, edgeLength * 0.45);
    const height = bounded(cornice.heightMetres, 0.2, 0.04, 0.6);
    add('cornice', cornice.materialKey || 'facadeTrim', edgeLength / 2, edgeLength - inset * 2, wallHeight - height - 0.12, wallHeight - 0.12, cornice.offsetMetres || 0.065);
  }
  const lintel = components.lintel;
  if (archetype === 'storefront' && wallHeight > 3.5 && lintel?.enabled) {
    const inset = bounded(lintel.widthInsetMetres, 0.9, 0, edgeLength * 0.45);
    const height = bounded(lintel.heightMetres, 0.18, 0.04, 0.5);
    const lower = Math.min(2.8, floorPitch - 0.22);
    add('lintel', lintel.materialKey || 'facadeTrim', edgeLength / 2, edgeLength - inset * 2, lower, lower + height, lintel.offsetMetres || 0.065);
  }
  let entryColumn = -1;
  if (front && columns > 0) {
    let hash = 2166136261;
    for (const char of `${featureId}:entry`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    entryColumn = (hash >>> 0) % columns;
    const entry = components.entry || {};
    const center = margin + (entryColumn + 0.5) * spacing;
    const width = bounded(entry.widthMetres, 1, 0.65, Math.min(3, spacing * 0.8));
    const height = Math.min(bounded(entry.heightMetres, 2.25, 1.8, 3.5), wallHeight - 0.2);
    const frameWidth = bounded(entry.frameWidthMetres, 0.2, 0.05, 0.45);
    if (panels.length + 2 <= limit) {
      add('door-frame', entry.materialKey || 'facadeTrim', center, width + frameWidth, 0.08, height + 0.12, layout.frameOffsetMetres || 0.045);
      add('door', entry.glassMaterialKey || (archetype === 'storefront' ? 'storefrontGlass' : 'windowGlass'), center, width, 0.1, height, layout.glassOffsetMetres || 0.04);
    }
  }
  const window = components.window || {};
  const sill = components.sill || {};
  const widthLimit = Math.min(spacing * (archetype === 'storefront' ? 0.78 : 0.56), archetype === 'storefront' ? 2.6 : 1.8);
  const width = Math.min(bounded(window.widthMetres, 1.35, 0.35, widthLimit), widthLimit);
  const heightLimit = archetype === 'storefront' ? 2.1 : archetype === 'industrial' ? 1.3 : 1.6;
  const height = Math.min(bounded(window.heightMetres, 1.4, 0.35, heightLimit), Math.max(0.35, floorPitch - 0.8));
  const frameWidth = bounded(window.frameWidthMetres, 0.18, 0.05, 0.4);
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (front && floor === 0 && column === entryColumn) continue;
      if (panels.length + 2 > limit) continue;
      const center = margin + (column + 0.5) * spacing;
      const shopWindow = archetype === 'storefront' && floor === 0;
      const lower = floor * floorPitch + (shopWindow ? 0.4 : archetype === 'industrial' ? 1.65 : 0.95);
      const upper = Math.min((floor + 1) * floorPitch - 0.45, lower + Math.min(height, shopWindow ? 2.1 : 1.5));
      if (upper - lower < 0.35) continue;
      const panelWidth = Math.min(width, shopWindow ? widthLimit : width);
      const frameTop = Math.min(wallHeight - 0.08, upper + frameWidth / 2);
      const frameBottom = Math.max(0.08, lower - frameWidth / 2);
      add('window-frame', window.frameMaterialKey || 'facadeTrim', center, panelWidth + frameWidth, frameBottom, frameTop, layout.frameOffsetMetres || 0.045);
      add('window', window.glassMaterialKey || (shopWindow ? 'storefrontGlass' : 'windowGlass'), center, panelWidth, lower, upper, layout.glassOffsetMetres || 0.04);
      if (!lite && sill.enabled) {
        const sillWidth = panelWidth + bounded(sill.widthExtraMetres, 0.28, 0.04, 0.6);
        const sillHeight = bounded(sill.heightMetres, 0.1, 0.04, 0.25);
        add('sill', sill.materialKey || 'facadeTrim', center, sillWidth, Math.max(0.08, lower - sillHeight), Math.max(0.12, lower - 0.02), sill.offsetMetres || 0.065);
      }
    }
  }
  return panels;
}
