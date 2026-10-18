/** Shared instance collections need per-feature bounds, not the collection box. */
export function editorFeatureBounds(THREE, record) {
  const bounds = new THREE.Box3();
  for (const part of record.parts || [{ object: record.object, instanceIndex: record.instanceIndex }]) {
    const object = part.object;
    if (!object) continue;
    object.updateWorldMatrix(true, true);
    if (Number.isInteger(part.instanceIndex) && object.getMatrixAt && object.geometry) {
      object.geometry.computeBoundingBox();
      const matrix = new THREE.Matrix4();
      object.getMatrixAt(part.instanceIndex, matrix);
      matrix.premultiply(object.matrixWorld);
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(matrix));
    } else bounds.union(new THREE.Box3().setFromObject(object));
  }
  return bounds;
}
