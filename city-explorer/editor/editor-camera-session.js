export function startEditorCameraSession(camera, navigation, mode, resolveGroundTarget) {
  if (!camera || !navigation || typeof navigation.reset !== 'function' || typeof resolveGroundTarget !== 'function') {
    throw new TypeError('Editor camera sessions require a camera, navigation controller, and ground-target resolver.');
  }
  const snapshot = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
    zoom: camera.zoom,
    projectionMatrix: camera.projectionMatrix.clone(),
    projectionMatrixInverse: camera.projectionMatrixInverse.clone(),
  };
  navigation.reset(resolveGroundTarget(mode));
  return snapshot;
}

export function restoreEditorCameraSession(camera, snapshot) {
  if (!camera || !snapshot) return false;
  camera.position.copy(snapshot.position);
  camera.quaternion.copy(snapshot.quaternion);
  camera.up.copy(snapshot.up);
  camera.zoom = snapshot.zoom;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.copy(snapshot.projectionMatrix);
  camera.projectionMatrixInverse.copy(snapshot.projectionMatrixInverse);
  camera.updateMatrixWorld(true);
  return true;
}
