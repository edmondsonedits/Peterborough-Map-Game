import manifest from './assets/building-reconstruction/batch-001/catalog.json?v=1.6.177' with {type:'json'};

// Only reviewed, individually sourced Blender assets are added to this manifest.
// The loader retains each original mapped shell until the replacement validates.
export function buildingReconstructionEntries({enabled = new URLSearchParams(globalThis.location?.search || '').get('researchedBuildings') !== '0'} = {}) {
  if (!enabled) return [];
  return manifest.entries.map(entry => {
    if (entry.status !== 'reviewed' || !/^\.\/assets\/building-reconstruction\//.test(entry.asset)) {
      throw new Error(`Unreviewed or invalid reconstruction asset: ${entry.id}`);
    }
    const assetUrl = new URL(entry.asset, import.meta.url);
    assetUrl.search = new URL(import.meta.url).search;
    return {...entry, assetUrl:assetUrl.href};
  });
}
