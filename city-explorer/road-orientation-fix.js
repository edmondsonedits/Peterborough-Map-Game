import * as THREE from 'three';

// The city renderer creates each road as a thin box whose local Z axis follows
// the road segment. Quaternion.setFromUnitVectors() does not preserve a stable
// "up" direction when the target points close to local -Z, so otherwise valid
// OSM segments can roll 90/180 degrees and appear as tall black fins.
//
// Keep the road's local X axis horizontal and derive a terrain-following local
// Y axis. The patch is intentionally limited to the app's +Z road alignment
// call; all other Three.js quaternion behaviour remains unchanged.
const originalSetFromUnitVectors = THREE.Quaternion.prototype.setFromUnitVectors;
const localForwardAxis = new THREE.Vector3(0, 0, 1);
const worldUp = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const side = new THREE.Vector3();
const surfaceNormal = new THREE.Vector3();
const basis = new THREE.Matrix4();

THREE.Quaternion.prototype.setFromUnitVectors = function setFromUnitVectorsWithStableRoadUp(from, to) {
  const isRoadForwardAxis = Math.abs(from.x) < 1e-7
    && Math.abs(from.y) < 1e-7
    && from.z > 0.999999;

  if (isRoadForwardAxis && Number.isFinite(to.x) && Number.isFinite(to.y) && Number.isFinite(to.z)) {
    forward.copy(to);
    if (forward.lengthSq() > 1e-12) {
      forward.normalize();
      side.crossVectors(worldUp, forward);

      // A road segment should never be vertical, but retain Three.js's native
      // fallback if malformed source data produces one.
      if (side.lengthSq() > 1e-12) {
        side.normalize();
        surfaceNormal.crossVectors(forward, side).normalize();
        basis.makeBasis(side, surfaceNormal, forward);
        return this.setFromRotationMatrix(basis);
      }
    }
  }

  return originalSetFromUnitVectors.call(this, from, to);
};

// Confirm the module and app share the same Three.js instance before starting.
if (localForwardAxis.z !== 1) throw new Error('Road orientation bootstrap failed');
await import('./app.js');
