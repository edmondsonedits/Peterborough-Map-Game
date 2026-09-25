import { generatedRegistry, makeGeneratedId } from './generated-registry.js';

const VALID_OPERATIONS = new Set(['hide', 'appearance', 'replace']);

export function applyOverrides(document, adapter = {}) {
  if (!document || !Array.isArray(document.overrides)) throw new TypeError('A normalized scene document with overrides is required.');
  const registry = adapter.registry || generatedRegistry;
  const authoredRuntime = adapter.authoredRuntime;

  registry.resetOverrides?.();
  for (const id of registry.records.keys()) registry.restore(id);
  for (const id of registry.appliedReplacementIds) authoredRuntime?.remove?.(id);
  registry.appliedReplacementIds.clear();

  for (const override of document.overrides) {
    if (!VALID_OPERATIONS.has(override?.operation) || typeof override.id !== 'string') continue;
    const target = registry.getEditableRecord(override.id);
    if (!target) continue;
    if (override.operation === 'hide') {
      registry.hide(override.id);
      continue;
    }
    if (override.operation === 'appearance') {
      registry.setAppearance(override.id, override.appearance || {}, adapter);
      continue;
    }
    if (override.operation === 'replace' && authoredRuntime?.upsert && override.assetKey) {
      registry.hide(override.id);
      const replacementId = makeGeneratedId({ sourceType: 'authored-replacement', sourceId: override.id });
      const storedReplacement = document.objects?.find((record) => record.id === replacementId);
      const transform = storedReplacement?.transform || target.transform || {
        longitude: 0, latitude: 0, elevation: 0,
        rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
      };
      authoredRuntime.upsert({
        id: replacementId,
        assetKey: storedReplacement?.assetKey || override.assetKey,
        label: storedReplacement?.label || target.label,
        visible: storedReplacement?.visible !== false,
        properties: storedReplacement?.properties || { sourceTargetId: target.id },
        transform,
      });
      const replacement = authoredRuntime.getObject?.(replacementId);
      if (replacement) {
        replacement.userData ||= {};
        replacement.userData.cityEditor = {
          ...(replacement.userData.cityEditor || {}),
          sourceTargetId: target.id,
        };
      }
      registry.appliedReplacementIds.add(replacementId);
    }
  }
  return true;
}
