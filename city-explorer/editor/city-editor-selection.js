function editorTag(object) {
  for (let current = object; current; current = current.parent) {
    const tag = current.userData?.cityEditor;
    if (tag?.id) return { object: current, tag };
  }
  return null;
}

export function isProtectedEditorTarget(target, protectedGroups = new Set()) {
  const protectedSet = protectedGroups instanceof Set ? protectedGroups : new Set(protectedGroups || []);
  for (let current = target; current; current = current.parent) {
    if (protectedSet.has(current) || current.userData?.cityEditorProtected === true) return true;
  }
  return false;
}

export function pickEditorSelection(intersections, isRegistered = () => true, protectedGroups = new Set()) {
  for (const intersection of intersections || []) {
    const target = intersection?.object;
    if (!target || isProtectedEditorTarget(target, protectedGroups)) continue;
    const tagged = editorTag(target);
    if (!tagged || (tagged.tag.canTransform === false && tagged.tag.kind === 'protected')) continue;
    if (isRegistered(tagged.tag.id, tagged.tag)) return { ...tagged.tag, object: tagged.object, intersection };
  }
  return null;
}

export function createGeneratedReplacementDocument(document, sourceRecord, transform, replacementId) {
  if (!document || !Array.isArray(document.objects) || !Array.isArray(document.overrides)) {
    throw new TypeError('A normalized scene document is required to replace a generated feature.');
  }
  if (!sourceRecord?.id || !transform || !replacementId) {
    throw new TypeError('A generated source, transform, and replacement ID are required.');
  }
  const replacement = {
    id: replacementId,
    assetKey: 'generated-source-clone',
    label: sourceRecord.label || sourceRecord.assetKey,
    visible: true,
    properties: { sourceTargetId: sourceRecord.id },
    transform,
  };
  return {
    ...document,
    objects: [...document.objects.filter((record) => record.id !== replacementId), replacement],
    overrides: [
      ...document.overrides.filter((override) => override.id !== sourceRecord.id),
      { id: sourceRecord.id, operation: 'replace', assetKey: 'generated-source-clone' },
    ],
  };
}
