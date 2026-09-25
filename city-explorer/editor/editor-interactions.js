export function rebindEditorSelection(selection, resolveRecord) {
  if (!selection || typeof resolveRecord !== 'function') return null;
  const record = resolveRecord(selection.id);
  if (!record?.object) return null;
  return {
    id: record.id,
    kind: record.kind,
    object: record.object,
    canTransform: record.canTransform,
  };
}

export function cancelTransformControlDrag(transform) {
  if (!transform) return false;
  if (typeof transform.pointerUp === 'function') transform.pointerUp(null);
  else {
    transform.dragging = false;
    transform.axis = null;
  }
  return true;
}
