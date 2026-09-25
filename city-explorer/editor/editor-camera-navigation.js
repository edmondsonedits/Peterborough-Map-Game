export function createEditorCameraNavigation(THREE, camera, viewport) {
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  let initialized = false;
  let drag = null;

  function initializeTarget() {
    if (initialized) return;
    camera.getWorldDirection(forward);
    target.copy(camera.position).addScaledVector(forward, Math.max(30, Math.abs(camera.position.y) * 0.75));
    initialized = true;
  }

  function reset(targetPoint) {
    drag = null;
    initialized = false;
    target.set(0, 0, 0);
    if (targetPoint && [targetPoint.x, targetPoint.y, targetPoint.z].every(Number.isFinite)) {
      target.copy(targetPoint);
      initialized = true;
    }
    return initialized ? distanceToTarget() : null;
  }

  function distanceToTarget() {
    initializeTarget();
    return camera.position.distanceTo(target);
  }

  function begin(event) {
    if (event.button !== 2) return false;
    initializeTarget();
    drag = {
      x: event.clientX,
      y: event.clientY,
      pan: Boolean(event.shiftKey),
    };
    return true;
  }

  function move(event) {
    if (!drag) return false;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    offset.copy(camera.position).sub(target);
    const distance = Math.max(1, offset.length());
    if (drag.pan) {
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      screenUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      const unitsPerPixel = distance / Math.max(1, viewport.height);
      target.addScaledVector(right, -dx * unitsPerPixel);
      target.addScaledVector(screenUp, dy * unitsPerPixel);
      camera.position.addScaledVector(right, -dx * unitsPerPixel);
      camera.position.addScaledVector(screenUp, dy * unitsPerPixel);
    } else {
      spherical.setFromVector3(offset);
      spherical.theta -= dx * 0.005;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.005, 0.08, Math.PI - 0.08);
      offset.setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
    }
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return true;
  }

  function end() {
    const wasDragging = Boolean(drag);
    drag = null;
    return wasDragging;
  }

  function zoom(deltaY) {
    initializeTarget();
    offset.copy(camera.position).sub(target);
    const distance = THREE.MathUtils.clamp(Math.max(8, offset.length()) * Math.exp(Number(deltaY || 0) * 0.001), 8, 12000);
    offset.setLength(distance);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return distance;
  }

  return { begin, move, end, zoom, reset, distanceToTarget, target };
}
