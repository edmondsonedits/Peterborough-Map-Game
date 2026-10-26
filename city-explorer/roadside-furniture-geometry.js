function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function unitDirection(direction, fallback = { x: 0, z: 1 }) {
  const x = finite(direction?.x, fallback.x);
  const z = finite(direction?.z, fallback.z);
  const length = Math.hypot(x, z);
  if (length < 1e-6) return { ...fallback };
  return { x: x / length, z: z / length };
}

function darkLensMaterial(material, color) {
  if (!material?.clone) return material;
  const clone = material.clone();
  clone.color?.set(color);
  clone.emissive?.set(0x000000);
  if ('emissiveIntensity' in clone) clone.emissiveIntensity = 0;
  clone.needsUpdate = true;
  return clone;
}

/**
 * Create static, instanced roadside lamps and traffic signals.
 * Placement coordinates and heights are in world metres; poles start at baseY.
 */
export function createRoadsideFurnitureMeshes({ THREE, lamps = [], signals = [], materials }) {
  if (!THREE || !materials) throw new TypeError('THREE and materials are required');

  const meshes = [];
  const lampPartLists = Array.from({ length: lamps.length }, () => []);
  const signalPartLists = Array.from({ length: signals.length }, () => []);
  const dummy = new THREE.Object3D();
  const vertical = new THREE.Vector3(0, 1, 0);
  const setCylinder = (mesh, index, x, y, z, length, direction, yaw) => {
    dummy.position.set(x, y, z);
    if (direction) {
      dummy.quaternion.setFromUnitVectors(vertical, new THREE.Vector3(direction.x, 0, direction.z).normalize());
    } else {
      dummy.rotation.set(0, yaw || 0, 0);
    }
    dummy.scale.set(1, length, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  const setBox = (mesh, index, x, y, z, yaw, scale = { x: 1, y: 1, z: 1 }) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(scale.x, scale.y, scale.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  const makeMesh = (geometry, material, count, type, sourceIds) => {
    if (!count) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.frustumCulled = true;
    mesh.userData = { type, count, decorative: true, collision: false, sourceIds };
    meshes.push(mesh);
    return mesh;
  };
  const finish = (mesh) => {
    if (!mesh) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox?.();
    mesh.computeBoundingSphere();
  };
  const addPart = (parts, object, instanceIndex) => {
    if (object) parts.push({ object, instanceIndex });
  };

  const validLamps = lamps.map((lamp) => ({
    x: finite(lamp?.x, 0), z: finite(lamp?.z, 0), baseY: finite(lamp?.baseY, 0),
    armDirection: unitDirection(lamp?.armDirection),
    armLength: Math.max(0.4, finite(lamp?.armLength, 2.4)),
    poleHeight: Math.max(1, finite(lamp?.poleHeight, 7.4)), sourceId: lamp?.sourceId ?? null,
  }));
  if (validLamps.length) {
    const poles = makeMesh(new THREE.CylinderGeometry(0.062, 0.095, 1, 8), materials.lightPole, validLamps.length, 'street-lamp-poles', validLamps.map((lamp) => lamp.sourceId));
    const arms = makeMesh(new THREE.CylinderGeometry(0.045, 0.055, 1, 8), materials.lightPole, validLamps.length, 'street-lamp-arms', validLamps.map((lamp) => lamp.sourceId));
    const heads = makeMesh(new THREE.BoxGeometry(0.68, 0.18, 0.34), materials.lampLens, validLamps.length, 'street-lamp-heads', validLamps.map((lamp) => lamp.sourceId));
    validLamps.forEach((lamp, index) => {
      const { x, z, baseY, poleHeight, armLength, armDirection: dir } = lamp;
      const armY = baseY + poleHeight - 0.22;
      const tipX = x + dir.x * armLength;
      const tipZ = z + dir.z * armLength;
      setCylinder(poles, index, x, baseY + poleHeight / 2, z, poleHeight);
      setCylinder(arms, index, x + dir.x * armLength / 2, armY, z + dir.z * armLength / 2, armLength, dir);
      const yaw = Math.atan2(-dir.z, dir.x);
      setBox(heads, index, tipX, armY - 0.06, tipZ, yaw);
      addPart(lampPartLists[index], poles, index);
      addPart(lampPartLists[index], arms, index);
      addPart(lampPartLists[index], heads, index);
    });
    finish(poles); finish(arms); finish(heads);
  }

  const validSignals = signals.map((signal) => ({
    x: finite(signal?.x, 0), z: finite(signal?.z, 0), baseY: finite(signal?.baseY, 0),
    armDirection: unitDirection(signal?.armDirection),
    facingDirection: unitDirection(signal?.facingDirection, unitDirection(signal?.armDirection)),
    armLength: Math.max(1, finite(signal?.armLength, 5)),
    poleHeight: Math.max(1, finite(signal?.poleHeight, 8)), sourceId: signal?.sourceId ?? null,
  }));
  if (validSignals.length) {
    const ids = validSignals.map((signal) => signal.sourceId);
    const poles = makeMesh(new THREE.CylinderGeometry(0.09, 0.14, 1, 8), materials.lightPole, validSignals.length, 'traffic-signal-poles', ids);
    const arms = makeMesh(new THREE.CylinderGeometry(0.055, 0.065, 1, 8), materials.lightPole, validSignals.length * 2, 'traffic-signal-arms', ids);
    const heads = makeMesh(new THREE.BoxGeometry(0.48, 1.05, 0.24), materials.signalHousing, validSignals.length, 'traffic-signal-heads', ids);
    const redLenses = makeMesh(new THREE.SphereGeometry(0.125, 8, 6), darkLensMaterial(materials.signalRed, 0x78231d), validSignals.length, 'traffic-signal-lenses', ids);
    const amberLenses = makeMesh(new THREE.SphereGeometry(0.125, 8, 6), darkLensMaterial(materials.signalRed, 0x785022), validSignals.length, 'traffic-signal-lenses', ids);
    const greenLenses = makeMesh(new THREE.SphereGeometry(0.125, 8, 6), darkLensMaterial(materials.signalGreen, 0x23633d), validSignals.length, 'traffic-signal-lenses', ids);
    redLenses && (redLenses.userData.lensColor = 'red');
    amberLenses && (amberLenses.userData.lensColor = 'amber');
    greenLenses && (greenLenses.userData.lensColor = 'green');
    validSignals.forEach((signal, index) => {
      const { x, z, baseY, poleHeight, armLength, armDirection: dir, facingDirection: face } = signal;
      const tipX = x + dir.x * armLength;
      const tipZ = z + dir.z * armLength;
      const yaw = Math.atan2(face.x, face.z);
      const headHeight = 1.05;
      const headY = baseY + Math.max(5.3 + headHeight / 2 + 0.08, poleHeight - 1.18);
      const armY = Math.max(baseY + poleHeight - 0.16, headY + headHeight / 2 + 0.48);
      const armStart = armLength * 0.5;
      setCylinder(poles, index, x, baseY + poleHeight / 2, z, poleHeight);
      setCylinder(arms, index * 2, x + dir.x * armStart, armY, z + dir.z * armStart, armLength, dir);
      setCylinder(arms, index * 2 + 1, tipX, (armY + headY + headHeight / 2) / 2, tipZ, armY - headY - headHeight / 2);
      setBox(heads, index, tipX, headY, tipZ, yaw);
      const lensDepth = 0.145;
      const lensX = tipX + face.x * lensDepth;
      const lensZ = tipZ + face.z * lensDepth;
      const lensScale = { x: 0.72, y: 0.72, z: 0.36 };
      setBox(redLenses, index, lensX, headY + 0.31, lensZ, yaw, lensScale);
      setBox(amberLenses, index, lensX, headY, lensZ, yaw, lensScale);
      setBox(greenLenses, index, lensX, headY - 0.31, lensZ, yaw, lensScale);
      addPart(signalPartLists[index], poles, index);
      addPart(signalPartLists[index], arms, index * 2);
      addPart(signalPartLists[index], arms, index * 2 + 1);
      addPart(signalPartLists[index], heads, index);
      addPart(signalPartLists[index], redLenses, index);
      addPart(signalPartLists[index], amberLenses, index);
      addPart(signalPartLists[index], greenLenses, index);
    });
    [poles, arms, heads, redLenses, amberLenses, greenLenses].forEach(finish);
  }

  return {
    meshes,
    lampParts: (index) => lampPartLists[index] ? [...lampPartLists[index]] : [],
    signalParts: (index) => signalPartLists[index] ? [...signalPartLists[index]] : [],
  };
}
