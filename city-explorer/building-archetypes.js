/** Inferred visual grammar only: never modifies surveyed geometry or dimensions. */
function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function classifyBuildingArchetype(tags = {}, wallHeight = 0, footprintArea = 0) {
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const use = `${type} ${tags.shop || ''} ${tags.office || ''} ${tags.amenity || ''} ${tags.tourism || ''}`.toLowerCase();
  if (/^(garage|garages|shed|carport|roof|greenhouse)$/.test(type)) return 'ancillary';
  if (/industrial|warehouse|manufactur/.test(use)) return 'industrial';
  if (/school|college|university|hospital|church|cathedral|civic|public|fire_station|library|community_centre/.test(use)) return 'civic';
  if (tags.shop && tags.shop !== 'no' || /retail|commercial|office|supermarket|mall|restaurant|cafe|fast_food|bank/.test(use)) return 'storefront';
  if (/apartments|dormitory|hotel/.test(use)) return 'apartment';
  if (/house|detached|semidetached|bungalow|terrace|residential/.test(type)) return 'residential';
  return wallHeight > 10 && footprintArea > 180 ? 'apartment' : 'residential';
}

/**
 * Return bounded edge-local panels. t is edge fraction; lowerY/upperY are metres
 * above the resolved foundation, offset is metres outward from the wall.
 * The caller supplies the street-facing edge; no entrance location is surveyed
 * or asserted here. Materials use the existing city building palette.
 */
export function buildingFacadePlan({ tags = {}, featureId = '', edgeLength, wallHeight,
  edgeIndex = 0, footprintArea = 0, lite = false, front = false } = {}) {
  const archetype = classifyBuildingArchetype(tags, wallHeight, footprintArea);
  const panels = [];
  const result = { archetype, inferred: true, panels };
  if (!Number.isFinite(edgeLength) || !Number.isFinite(wallHeight)
    || edgeLength < 2.3 || wallHeight < 2.4 || archetype === 'ancillary') return result;
  const limit = lite ? 24 : 80;
  const seed = `${featureId}:${edgeIndex}:${archetype}`;
  const margin = Math.min(0.9, edgeLength * 0.14);
  const usable = edgeLength - margin * 2;
  const add = (kind, materialKey, center, width, lowerY, upperY, offset = 0.055) => {
    width = Math.min(width, usable);
    lowerY = Math.max(0.08, lowerY);
    upperY = Math.min(wallHeight - 0.08, upperY);
    if (panels.length >= limit || width < 0.08 || upperY - lowerY < 0.04) return;
    center = Math.max(margin + width / 2, Math.min(edgeLength - margin - width / 2, center));
    panels.push({ kind, materialKey, t: center / edgeLength, width, lowerY, upperY, offset });
  };
  const storefront = archetype === 'storefront';
  const industrial = archetype === 'industrial';
  const residential = archetype === 'residential';
  const pitch = industrial ? 5.8 : storefront ? 3.2 : archetype === 'civic' ? 3.5 : 2.8;
  const columns = Math.max(1, Math.min(lite ? 3 : residential ? 4 : 7, Math.floor(usable / pitch)));
  const spacing = usable / columns;
  const levelTag = Number.parseFloat(tags['building:levels']);
  const estimated = Number.isFinite(levelTag) && levelTag > 0 ? Math.round(levelTag) : Math.round(wallHeight / 3.15);
  const floors = Math.max(1, Math.min(estimated, Math.floor(wallHeight / 2.4), industrial ? 1 : lite ? 2 : residential ? 3 : 5));
  const floorPitch = wallHeight / floors;
  const doorColumn = hash(`${seed}:entry`) % columns;
  const doorWidth = Math.min(spacing * 0.64, industrial ? 2.7 : storefront ? 1.3 : 1.0);
  const doorTop = Math.min(wallHeight - 0.35, industrial ? 3.2 : 2.25);
  if (front) {
    const center = margin + (doorColumn + 0.5) * spacing;
    add('door-frame', 'facadeTrim', center, doorWidth + 0.22, 0.08, doorTop + 0.13, 0.045);
    add('door', storefront ? 'storefrontGlass' : 'windowGlass', center, doorWidth, 0.1, doorTop);
  }
  // Thin horizontal members are explicit panels, not extra wall volumes.
  add('cornice', 'facadeTrim', edgeLength / 2, usable, wallHeight - 0.32, wallHeight - 0.12, 0.065);
  if (storefront && wallHeight > 3.5) add('lintel', 'facadeTrim', edgeLength / 2, usable, Math.min(2.8, floorPitch - 0.22), Math.min(3.0, floorPitch - 0.06), 0.065);
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (front && floor === 0 && column === doorColumn) continue;
      // Reserve frame + glass together, so the budget never cuts a window in half.
      if (panels.length + 2 > limit) return result;
      const center = margin + (column + 0.5) * spacing;
      const shopWindow = storefront && floor === 0;
      const width = Math.min(spacing * (shopWindow ? 0.78 : 0.56), shopWindow ? 2.6 : industrial ? 2.0 : 1.45);
      const lower = floor * floorPitch + (shopWindow ? 0.4 : industrial ? 1.65 : 0.95);
      const upper = Math.min((floor + 1) * floorPitch - 0.45, lower + (shopWindow ? 2.1 : industrial ? 1.3 : 1.4));
      if (upper - lower < 0.35) continue;
      const glass = shopWindow ? 'storefrontGlass' : hash(`${seed}:${floor}:${column}`) % 9 === 0 ? 'windowWarm' : 'windowGlass';
      add('window-frame', 'facadeTrim', center, width + 0.18, lower - 0.09, upper + 0.09, 0.045);
      add('window', glass, center, width, lower, upper);
      if (!lite && residential && panels.length < limit) add('sill', 'facadeTrim', center, width + 0.28, lower - 0.16, lower - 0.06, 0.065);
    }
  }
  return result;
}
