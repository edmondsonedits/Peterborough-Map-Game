/*
  Peterborough City Explorer gameplay primitives.

  This module deliberately keeps the movement maths independent from the
  renderer.  The browser integration, automated tests, and any future physics
  replacement can therefore share one documented set of tuning values.
*/

export const FIRE_STATION_ONE = Object.freeze({
  id: 'peterborough-fire-station-1',
  name: 'Peterborough Fire Station 1',
  address: '210 Sherbrooke Street',
  // City of Peterborough Fire Services location; the building footprint is
  // OSM way 1009651229.  These are not visual calibration offsets.
  lat: 44.3010385,
  lon: -78.3220374,
  buildingLat: 44.30096875,
  buildingLon: -78.3221624,
  playerLat: 44.30079,
  playerLon: -78.32209,
  truckLat: 44.30082,
  truckLon: -78.32215,
  // The apparatus doors face south toward Sherbrooke Street.
  truckHeading: Math.PI,
});

export const PLAYER_TUNING = Object.freeze({
  walkSpeed: 4.6,
  sprintSpeed: 7.2,
  accelerationResponse: 13,
  brakingResponse: 18,
  rotationResponse: 15,
  enterDistance: 6.5,
  cameraDistance: 8.6,
  cameraHeight: 1.55,
  cameraPositionResponse: 11,
  cameraTargetResponse: 16,
});

export const TRUCK_TUNING = Object.freeze({
  length: 10.4,
  width: 2.55,
  height: 3.25,
  wheelbase: 5.65,
  trackWidth: 2.12,
  maximumForwardSpeed: 27.5,
  maximumReverseSpeed: 7.2,
  forwardAcceleration: 3.85,
  reverseAcceleration: 2.65,
  serviceBrake: 8.8,
  rollingDrag: 0.56,
  aerodynamicDrag: 0.008,
  offRoadSpeed: 11.5,
  offRoadAccelerationScale: 0.48,
  steeringLowSpeed: 0.54,
  steeringHighSpeed: 0.15,
  steeringResponse: 7.5,
  steeringReturnResponse: 10,
  exitSpeed: 0.75,
  chaseDistance: 10.2,
  chaseHeight: 3.4,
  cameraPositionResponse: 7.8,
  cameraTargetResponse: 12,
});

export function exponentialStep(current, target, response, delta) {
  const safeDelta = Math.max(0, Number(delta) || 0);
  return current + (target - current) * (1 - Math.exp(-Math.max(0, response) * safeDelta));
}

export function wrapAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

export function dampAngle(current, target, response, delta) {
  return wrapAngle(current + wrapAngle(target - current) * (1 - Math.exp(-response * Math.max(0, delta))));
}

export function headingFromDirection(x, z) {
  return Math.atan2(-x, -z);
}

export function directionFromHeading(heading) {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

export function gameplayAxesFromKeys(keys) {
  const pressed = (code) => keys?.has?.(code);
  return {
    forward: Number(pressed('KeyW') || pressed('ArrowUp')) - Number(pressed('KeyS') || pressed('ArrowDown')),
    strafe: Number(pressed('KeyD') || pressed('ArrowRight')) - Number(pressed('KeyA') || pressed('ArrowLeft')),
    steering: Number(pressed('KeyA') || pressed('ArrowLeft')) - Number(pressed('KeyD') || pressed('ArrowRight')),
    sprinting: Boolean(pressed('ShiftLeft') || pressed('ShiftRight')),
  };
}

/** Advance a heavy rear-steered fire apparatus with a stable bicycle model. */
export function stepFireTruckKinematics(current, input, delta, onRoad = true) {
  const dt = Math.min(0.05, Math.max(0, Number(delta) || 0));
  const throttle = Math.max(-1, Math.min(1, Number(input?.throttle) || 0));
  const steeringInput = Math.max(-1, Math.min(1, Number(input?.steering) || 0));
  let speed = Number(current.speed) || 0;
  const absoluteSpeed = Math.abs(speed);
  let acceleration = 0;

  if (throttle > 0) {
    acceleration = speed < -0.2 ? TRUCK_TUNING.serviceBrake : TRUCK_TUNING.forwardAcceleration;
  } else if (throttle < 0) {
    acceleration = speed > 0.2 ? -TRUCK_TUNING.serviceBrake : -TRUCK_TUNING.reverseAcceleration;
  } else if (absoluteSpeed > 0.001) {
    acceleration = -Math.sign(speed) * (TRUCK_TUNING.rollingDrag + TRUCK_TUNING.aerodynamicDrag * speed * speed);
  }
  if (!onRoad && throttle !== 0 && Math.sign(acceleration) === Math.sign(throttle)) {
    acceleration *= TRUCK_TUNING.offRoadAccelerationScale;
  }
  speed += acceleration * dt;
  if (throttle === 0 && Math.sign(speed) !== Math.sign(Number(current.speed) || 0)) speed = 0;
  const forwardLimit = onRoad ? TRUCK_TUNING.maximumForwardSpeed : TRUCK_TUNING.offRoadSpeed;
  speed = Math.max(-(onRoad ? TRUCK_TUNING.maximumReverseSpeed : TRUCK_TUNING.maximumReverseSpeed * 0.65), Math.min(forwardLimit, speed));

  const speedRatio = Math.min(1, absoluteSpeed / TRUCK_TUNING.maximumForwardSpeed);
  const maximumSteer = TRUCK_TUNING.steeringLowSpeed
    + (TRUCK_TUNING.steeringHighSpeed - TRUCK_TUNING.steeringLowSpeed) * speedRatio;
  const targetSteering = steeringInput * maximumSteer;
  const steeringResponse = steeringInput ? TRUCK_TUNING.steeringResponse : TRUCK_TUNING.steeringReturnResponse;
  const steering = exponentialStep(Number(current.steering) || 0, targetSteering, steeringResponse, dt);
  const heading = wrapAngle((Number(current.heading) || 0) + speed / TRUCK_TUNING.wheelbase * Math.tan(steering) * dt);
  const direction = directionFromHeading(heading);

  return {
    x: (Number(current.x) || 0) + direction.x * speed * dt,
    z: (Number(current.z) || 0) + direction.z * speed * dt,
    heading,
    speed,
    steering,
    acceleration,
  };
}

function mesh(THREE, geometry, material, parent, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function standardMaterial(THREE, color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.66, metalness: 0.04, ...options });
}

export function createFirefighter(THREE) {
  const root = new THREE.Group();
  root.name = 'Playable firefighter';
  const visual = new THREE.Group();
  root.add(visual);
  const navy = standardMaterial(THREE, 0x172c3a, { roughness: 0.82 });
  const dark = standardMaterial(THREE, 0x10171b, { roughness: 0.9 });
  const skin = standardMaterial(THREE, 0xc88e67, { roughness: 0.88 });
  const gold = standardMaterial(THREE, 0xc5a34b, { roughness: 0.6, metalness: 0.12 });

  const torso = mesh(THREE, new THREE.CapsuleGeometry(0.36, 0.72, 4, 8), navy, visual, 0, 1.35, 0);
  torso.scale.set(1.08, 1, 0.72);
  mesh(THREE, new THREE.CapsuleGeometry(0.27, 0.14, 4, 8), skin, visual, 0, 2.1, -0.01);
  const helmet = mesh(THREE, new THREE.SphereGeometry(0.31, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), gold, visual, 0, 2.31, 0);
  helmet.scale.z = 1.1;
  mesh(THREE, new THREE.BoxGeometry(0.72, 0.055, 0.46), gold, visual, 0, 2.28, -0.03);

  const makeLimb = (side, arm) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (arm ? 0.43 : 0.2), arm ? 1.72 : 0.94, 0);
    visual.add(pivot);
    const length = arm ? 0.88 : 0.98;
    const limb = mesh(THREE, new THREE.CapsuleGeometry(arm ? 0.105 : 0.135, length - 0.2, 3, 7), arm ? navy : dark, pivot, 0, -length / 2, 0);
    if (!arm) mesh(THREE, new THREE.BoxGeometry(0.28, 0.18, 0.46), dark, pivot, 0, -length, -0.09);
    return pivot;
  };
  const leftArm = makeLimb(-1, true);
  const rightArm = makeLimb(1, true);
  const leftLeg = makeLimb(-1, false);
  const rightLeg = makeLimb(1, false);
  mesh(THREE, new THREE.BoxGeometry(0.76, 0.09, 0.05), gold, visual, 0, 1.22, -0.31);
  root.userData.animation = { visual, leftArm, rightArm, leftLeg, rightLeg, phase: 0 };
  return root;
}

export function createFireTruck(THREE) {
  const root = new THREE.Group();
  root.name = 'Peterborough pumper truck';
  const visual = new THREE.Group();
  root.add(visual);
  const red = standardMaterial(THREE, 0xb3131d, { roughness: 0.48, metalness: 0.16 });
  const redDark = standardMaterial(THREE, 0x760c13, { roughness: 0.54, metalness: 0.13 });
  const white = standardMaterial(THREE, 0xf1eee3, { roughness: 0.48 });
  const chrome = standardMaterial(THREE, 0xc8d0ce, { roughness: 0.22, metalness: 0.82 });
  const dark = standardMaterial(THREE, 0x11181c, { roughness: 0.68, metalness: 0.1 });
  const glass = standardMaterial(THREE, 0x17394c, { roughness: 0.18, metalness: 0.2 });
  const tyre = standardMaterial(THREE, 0x0d1011, { roughness: 0.94 });
  const lampRed = standardMaterial(THREE, 0xff2635, { emissive: 0xff101d, emissiveIntensity: 0.35, roughness: 0.25 });
  const lampWhite = standardMaterial(THREE, 0xfff2c9, { emissive: 0xffe7b0, emissiveIntensity: 0.7, roughness: 0.22 });

  mesh(THREE, new THREE.BoxGeometry(2.48, 0.42, 9.55), dark, visual, 0, 0.73, 0.22);
  mesh(THREE, new THREE.BoxGeometry(2.5, 1.34, 5.02), red, visual, 0, 1.63, 2.05);
  mesh(THREE, new THREE.BoxGeometry(2.46, 1.98, 3.58), red, visual, 0, 1.93, -2.62);
  mesh(THREE, new THREE.BoxGeometry(2.34, 0.31, 3.5), white, visual, 0, 2.97, -2.62);
  mesh(THREE, new THREE.BoxGeometry(2.12, 0.8, 0.055), glass, visual, 0, 2.35, -4.43);
  mesh(THREE, new THREE.BoxGeometry(0.085, 0.84, 0.075), white, visual, 0, 2.35, -4.47);
  mesh(THREE, new THREE.BoxGeometry(1.52, 0.36, 0.075), chrome, visual, 0, 1.22, -4.48);
  for (let slat = 0; slat < 4; slat += 1) {
    mesh(THREE, new THREE.BoxGeometry(1.42, 0.035, 0.035), dark, visual, 0, 1.08 + slat * 0.095, -4.53);
  }
  mesh(THREE, new THREE.BoxGeometry(2.2, 0.12, 0.075), white, visual, 0, 1.67, -4.48);
  const leftWindshield = mesh(THREE, new THREE.BoxGeometry(0.055, 0.72, 1.18), glass, visual, -1.245, 2.32, -3.42);
  leftWindshield.rotation.y = -0.02;
  const rightWindshield = leftWindshield.clone();
  rightWindshield.position.x = 1.245;
  visual.add(rightWindshield);

  mesh(THREE, new THREE.BoxGeometry(2.62, 0.22, 0.36), chrome, visual, 0, 0.72, -4.91);
  mesh(THREE, new THREE.BoxGeometry(2.55, 0.09, 8.25), white, visual, 0, 1.59, 0.2);
  mesh(THREE, new THREE.BoxGeometry(2.58, 0.18, 0.18), white, visual, 0, 2.74, 1.94);

  // Low-poly hose lockers, pump panel, rails, ladders, and rear step make the
  // apparatus readable at street distance without loading a large texture.
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 4; bay += 1) {
      const locker = mesh(THREE, new THREE.BoxGeometry(0.055, 0.92, 0.96), chrome, visual, side * 1.27, 1.68, 0.24 + bay * 1.02);
      locker.material = chrome;
      mesh(THREE, new THREE.BoxGeometry(0.066, 0.025, 0.52), redDark, visual, side * 1.306, 1.68, 0.24 + bay * 1.02);
    }
    mesh(THREE, new THREE.BoxGeometry(0.06, 0.82, 1.05), dark, visual, side * 1.29, 1.68, -0.48);
    for (let step = 0; step < 3; step += 1) {
      mesh(THREE, new THREE.BoxGeometry(0.15, 0.07, 0.78), chrome, visual, side * 1.36, 0.64 + step * 0.31, 0.95);
    }
  }
  mesh(THREE, new THREE.BoxGeometry(1.18, 0.16, 4.4), chrome, visual, 0, 2.97, 2.18);
  for (let rung = 0; rung < 11; rung += 1) mesh(THREE, new THREE.BoxGeometry(1.12, 0.07, 0.07), dark, visual, 0, 3.08, 0.25 + rung * 0.38);
  mesh(THREE, new THREE.BoxGeometry(2.72, 0.18, 0.62), chrome, visual, 0, 0.64, 5.03);

  const wheelPositions = [
    [-1.27, -2.83, true], [1.27, -2.83, true],
    [-1.27, 2.82, false], [1.27, 2.82, false],
    [-1.27, 3.72, false], [1.27, 3.72, false],
  ];
  const wheels = [];
  const frontWheels = [];
  wheelPositions.forEach(([x, z, steerable]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.62, z);
    visual.add(pivot);
    const wheel = mesh(THREE, new THREE.CylinderGeometry(0.56, 0.56, 0.32, 14), tyre, pivot);
    wheel.rotation.z = Math.PI / 2;
    const hub = mesh(THREE, new THREE.CylinderGeometry(0.22, 0.22, 0.34, 12), chrome, pivot);
    hub.rotation.z = Math.PI / 2;
    wheels.push({ wheel, hub, pivot, side: Math.sign(x) });
    if (steerable) frontWheels.push(pivot);
  });

  const beacons = [];
  for (const x of [-0.76, 0.76]) beacons.push(mesh(THREE, new THREE.BoxGeometry(0.44, 0.16, 0.25), lampRed, visual, x, 3.22, -3.52));
  for (const x of [-0.8, 0.8]) mesh(THREE, new THREE.BoxGeometry(0.32, 0.26, 0.08), lampWhite, visual, x, 1.03, -4.66);
  for (const x of [-0.88, 0.88]) beacons.push(mesh(THREE, new THREE.BoxGeometry(0.3, 0.22, 0.08), lampRed, visual, x, 2.06, 4.62));

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext('2d');
  context.fillStyle = '#f1eee3';
  context.font = '700 38px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('PETERBOROUGH FIRE', 256, 48);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const label = mesh(THREE, new THREE.PlaneGeometry(2.55, 0.48), labelMaterial, visual, side * 1.311, 2.45, -1.7);
    label.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  root.userData.truck = { visual, wheels, frontWheels, beacons, labelTexture };
  return root;
}

function stationSurveyFeature(survey, id) {
  return survey?.features?.find?.((feature) => String(feature.id || feature.properties?.id) === id) || null;
}

function surveyLineFrame(THREE, feature, project) {
  if (feature?.geometry?.type !== 'LineString' || feature.geometry.coordinates.length < 2) return null;
  const startGeo = feature.geometry.coordinates[0];
  const endGeo = feature.geometry.coordinates.at(-1);
  const start = project(Number(startGeo[1]), Number(startGeo[0]));
  const end = project(Number(endGeo[1]), Number(endGeo[0]));
  const dx = end.x - start.x;
  const dz = end.y - start.y;
  const length = Math.hypot(dx, dz);
  if (length < 0.25) return null;
  return {
    start,
    end,
    length,
    x: (start.x + end.x) / 2,
    z: (start.y + end.y) / 2,
    yaw: Math.atan2(-dz, dx),
  };
}

function addSurveyAlignedPanel(THREE, root, frame, terrainHeightAtWorld, materials, options) {
  const section = new THREE.Group();
  const ground = terrainHeightAtWorld(frame.x, frame.z);
  section.position.set(frame.x, ground, frame.z);
  section.rotation.y = frame.yaw;
  root.add(section);

  const wallHeight = options.wallHeight || 5.55;
  mesh(THREE, new THREE.BoxGeometry(frame.length, wallHeight, 0.18), materials.brick, section, 0, wallHeight / 2, 0.02);
  mesh(THREE, new THREE.BoxGeometry(frame.length + 0.2, 0.32, 0.36), materials.roof, section, 0, wallHeight - 0.08, -0.01);

  if (options.kind === 'apparatus') {
    const bays = 4;
    const margin = 0.55;
    const bayWidth = (frame.length - margin * 2) / bays;
    for (let index = 0; index < bays; index += 1) {
      const x = -frame.length / 2 + margin + bayWidth * (index + 0.5);
      const visibleWidth = bayWidth - 0.38;
      mesh(THREE, new THREE.BoxGeometry(visibleWidth + 0.18, 4.45, 0.12), materials.frame, section, x, 2.35, 0.14);
      mesh(THREE, new THREE.BoxGeometry(visibleWidth, 4.17, 0.08), materials.door, section, x, 2.31, 0.23);
      for (let row = 1; row < 6; row += 1) {
        mesh(THREE, new THREE.BoxGeometry(visibleWidth - 0.12, 0.025, 0.025), materials.frame, section, x, 0.62 + row * 0.62, 0.285);
      }
      const windows = 4;
      for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
        const wx = x - visibleWidth * 0.36 + windowIndex * visibleWidth * 0.24;
        mesh(THREE, new THREE.BoxGeometry(visibleWidth * 0.17, 0.34, 0.025), materials.glass, section, wx, 2.05, 0.305);
      }
    }
  }

  if (options.kind === 'office') {
    mesh(THREE, new THREE.BoxGeometry(frame.length * 0.62, 0.82, 0.04), materials.glass, section, -frame.length * 0.08, 2.0, 0.225);
    for (const fraction of [-0.28, -0.06, 0.16]) {
      mesh(THREE, new THREE.BoxGeometry(0.07, 0.9, 0.04), materials.frame, section, frame.length * fraction, 2.0, 0.255);
    }
    mesh(THREE, new THREE.BoxGeometry(1.7, 2.7, 0.055), materials.glass, section, frame.length * 0.39, 1.43, 0.25);
  }
  if (options.kind === 'entry') {
    mesh(THREE, new THREE.BoxGeometry(frame.length * 0.7, 0.72, 0.04), materials.glass, section, 0, 2.05, 0.225);
    mesh(THREE, new THREE.BoxGeometry(0.075, 0.8, 0.04), materials.frame, section, 0, 2.05, 0.255);
  }
  return section;
}

/**
 * Add only surveyed, footprint-attached visual detail to Station 1.
 *
 * The ordinary OSM/municipal building mesh remains the authoritative mass.
 * This layer has no independent local origin: every panel is generated from a
 * reviewed geographic line in the semantic survey, so it cannot drift away
 * from the footprint when the city origin, terrain, or building data changes.
 */
export function createFireStationFacade(THREE, { project, terrainHeightAtWorld, survey } = {}) {
  const root = new THREE.Group();
  root.name = 'Fire Station 1 surveyed facade detail';
  root.userData = {
    type: 'recognizable-city-site',
    siteId: FIRE_STATION_ONE.id,
    sourceNotes: 'Generated from reviewed geographic facade lines; no reference imagery is embedded.',
    surveyFeatureIds: [],
  };
  if (typeof project !== 'function' || typeof terrainHeightAtWorld !== 'function' || !survey) {
    root.userData.status = 'mesh-fallback';
    return root;
  }

  const materials = {
    brick: standardMaterial(THREE, 0x6f4538, { roughness: 0.94 }),
    door: standardMaterial(THREE, 0xb93d3e, { roughness: 0.7, metalness: 0.05 }),
    frame: standardMaterial(THREE, 0x575550, { roughness: 0.72, metalness: 0.12 }),
    glass: standardMaterial(THREE, 0x203b46, { roughness: 0.22, metalness: 0.16 }),
    roof: standardMaterial(THREE, 0x282b29, { roughness: 0.92 }),
  };
  const apparatusFeature = stationSurveyFeature(survey, 'station1-apparatus-facade');
  const entryFeature = stationSurveyFeature(survey, 'station1-entry-facade');
  const officeFeature = stationSurveyFeature(survey, 'station1-office-facade');
  const apparatusFrame = surveyLineFrame(THREE, apparatusFeature, project);
  const entryFrame = surveyLineFrame(THREE, entryFeature, project);
  const officeFrame = surveyLineFrame(THREE, officeFeature, project);
  if (apparatusFrame) {
    addSurveyAlignedPanel(THREE, root, apparatusFrame, terrainHeightAtWorld, materials, { kind: 'apparatus', wallHeight: 5.55 });
    root.userData.surveyFeatureIds.push(apparatusFeature.id);
  }
  if (entryFrame) {
    addSurveyAlignedPanel(THREE, root, entryFrame, terrainHeightAtWorld, materials, { kind: 'entry', wallHeight: 4.7 });
    root.userData.surveyFeatureIds.push(entryFeature.id);
  }
  if (officeFrame) {
    const office = addSurveyAlignedPanel(THREE, root, officeFrame, terrainHeightAtWorld, materials, { kind: 'office', wallHeight: 4.65 });
    root.userData.surveyFeatureIds.push(officeFeature.id);
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      context.fillStyle = '#142027';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#f4eee0';
      context.font = '700 27px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('PETERBOROUGH FIRE SERVICES  ·  STATION 1', 384, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sign = mesh(THREE, new THREE.PlaneGeometry(Math.min(8.2, officeFrame.length * 0.67), 0.82), new THREE.MeshBasicMaterial({ map: texture }), office, 0, 4.13, 0.255);
      sign.userData.texture = texture;
      root.userData.texture = texture;
    }
  }
  root.userData.status = root.userData.surveyFeatureIds.length === 3 ? 'survey-aligned' : 'partial-fallback';
  return root;
}

function createLegacyFireStationFacade(THREE) {
  const root = new THREE.Group();
  root.name = 'Fire Station 1 precinct detail';
  root.userData = {
    type: 'recognizable-city-site',
    siteId: FIRE_STATION_ONE.id,
    sourceNotes: 'GIS-aligned model created from lawful visual comparison; no reference imagery is embedded.',
  };

  // The municipal/OSM footprint remains the authoritative building mass. This
  // shallow additive layer supplies Station 1's recognizable street-level cues.
  const brick = standardMaterial(THREE, 0x6f4538, { roughness: 0.94 });
  const brickDark = standardMaterial(THREE, 0x3c332d, { roughness: 0.96 });
  const concrete = standardMaterial(THREE, 0xb6ae9c, { roughness: 0.86 });
  const doorRed = standardMaterial(THREE, 0xb93d3e, { roughness: 0.7, metalness: 0.05 });
  const doorFrame = standardMaterial(THREE, 0x575550, { roughness: 0.72, metalness: 0.12 });
  const glass = standardMaterial(THREE, 0x203b46, { roughness: 0.22, metalness: 0.16 });
  const roof = standardMaterial(THREE, 0x282b29, { roughness: 0.92 });
  const metal = standardMaterial(THREE, 0x818783, { roughness: 0.42, metalness: 0.58 });
  const asphalt = standardMaterial(THREE, 0x363936, { roughness: 1 });
  const marking = standardMaterial(THREE, 0xd8d3bd, { roughness: 0.78 });
  const timber = standardMaterial(THREE, 0x77614a, { roughness: 0.94 });
  const soil = standardMaterial(THREE, 0x49382d, { roughness: 1 });
  const foliage = standardMaterial(THREE, 0x4b632f, { roughness: 0.96 });
  const flower = standardMaterial(THREE, 0xc94143, { roughness: 0.82 });

  mesh(THREE, new THREE.BoxGeometry(43.2, 5.8, 0.38), brick, root, 0, 3.0, 13.22);
  mesh(THREE, new THREE.BoxGeometry(43.5, 0.52, 0.72), roof, root, 0, 5.83, 13.08);
  mesh(THREE, new THREE.BoxGeometry(25.4, 0.4, 0.74), concrete, root, -8.65, 5.38, 13.2);

  // Four south-facing red apparatus doors, with panel seams and the real small
  // horizontal window rows, replace the former three generic pale doors.
  const bayCenters = [-16.0, -9.65, -3.3, 3.05];
  bayCenters.forEach((x, bayIndex) => {
    mesh(THREE, new THREE.BoxGeometry(5.75, 4.5, 0.2), doorFrame, root, x, 2.72, 13.48);
    mesh(THREE, new THREE.BoxGeometry(5.42, 4.22, 0.13), doorRed, root, x, 2.68, 13.61);
    for (let row = 1; row < 6; row += 1) {
      mesh(THREE, new THREE.BoxGeometry(5.28, 0.035, 0.035), doorFrame, root, x, 0.68 + row * 0.62, 13.7);
    }
    for (const windowX of [-1.82, -0.61, 0.61, 1.82]) {
      mesh(THREE, new THREE.BoxGeometry(0.86, 0.38, 0.04), glass, root, x + windowX, 2.16, 13.71);
    }
    const canopy = mesh(THREE, new THREE.BoxGeometry(5.95, 0.14, 1.05), metal, root, x, 5.22, 13.76);
    canopy.rotation.x = -0.08;
    canopy.userData = { type: 'apparatus-bay-canopy', bay: bayIndex + 1 };
  });

  // Stepped east office wing, ribbon window, and recessed public entrance.
  mesh(THREE, new THREE.BoxGeometry(14.1, 4.65, 0.5), brickDark, root, 14.2, 2.52, 13.34);
  mesh(THREE, new THREE.BoxGeometry(14.35, 0.42, 0.82), roof, root, 14.2, 4.83, 13.13);
  mesh(THREE, new THREE.BoxGeometry(8.2, 0.95, 0.08), glass, root, 11.9, 2.05, 13.66);
  for (const mullionX of [8.6, 10.8, 13.0, 15.2]) {
    mesh(THREE, new THREE.BoxGeometry(0.09, 1.02, 0.05), doorFrame, root, mullionX, 2.05, 13.72);
  }
  mesh(THREE, new THREE.BoxGeometry(2.05, 2.82, 0.12), glass, root, 19.0, 1.52, 13.69);
  mesh(THREE, new THREE.BoxGeometry(0.1, 2.88, 0.05), metal, root, 19.0, 1.52, 13.76);
  mesh(THREE, new THREE.BoxGeometry(3.1, 0.16, 1.2), metal, root, 19.0, 3.08, 13.82);

  // Rooftop service block, HVAC units, guard rail, and communications mast.
  mesh(THREE, new THREE.BoxGeometry(18.4, 1.05, 7.6), roof, root, -2.6, 6.13, 3.0);
  mesh(THREE, new THREE.BoxGeometry(4.1, 1.35, 3.0), metal, root, 5.4, 6.63, 2.1);
  mesh(THREE, new THREE.BoxGeometry(3.2, 0.95, 2.5), metal, root, -8.4, 6.43, 0.4);
  mesh(THREE, new THREE.CylinderGeometry(0.08, 0.11, 9.2, 8), metal, root, -1.5, 10.65, 1.3).userData = { type: 'communications-mast' };
  for (const mastY of [9.1, 11.0, 12.6]) {
    mesh(THREE, new THREE.BoxGeometry(2.0, 0.06, 0.06), metal, root, -1.5, mastY, 1.3);
    mesh(THREE, new THREE.BoxGeometry(0.06, 0.06, 1.55), metal, root, -1.5, mastY, 1.3);
  }
  for (const x of [-10.2, -5.2, -0.2, 4.8, 9.8]) {
    mesh(THREE, new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), metal, root, x, 6.55, -1.9);
  }
  mesh(THREE, new THREE.BoxGeometry(21.0, 0.06, 0.06), metal, root, -0.2, 7.02, -1.9);

  // Official surfaces remain authoritative; these thin elements add only the
  // observed apron tone, east parking stalls, and entrance landscaping.
  mesh(THREE, new THREE.BoxGeometry(43.0, 0.045, 18.0), asphalt, root, 0, 0.05, 23.0);
  for (const x of [25.0, 28.0, 31.0, 34.0, 37.0]) {
    mesh(THREE, new THREE.BoxGeometry(0.09, 0.035, 5.2), marking, root, x, 0.09, 20.0);
  }
  mesh(THREE, new THREE.BoxGeometry(12.2, 0.035, 0.1), marking, root, 31.0, 0.09, 17.4);

  // Flagpole, raised flower bed, shrubs, and mature crimson tree are placed in
  // the same relative positions visible from Sherbrooke Street.
  mesh(THREE, new THREE.BoxGeometry(13.0, 0.7, 3.0), timber, root, 8.0, 0.37, 25.0);
  mesh(THREE, new THREE.BoxGeometry(12.2, 0.4, 2.35), soil, root, 8.0, 0.73, 25.0);
  for (let index = 0; index < 22; index += 1) {
    const x = 2.6 + (index % 11) * 1.05;
    const z = 24.45 + Math.floor(index / 11) * 1.0;
    mesh(THREE, new THREE.SphereGeometry(0.2, 6, 4), flower, root, x, 1.04, z);
  }
  mesh(THREE, new THREE.CylinderGeometry(0.09, 0.13, 13.0, 10), metal, root, 8.0, 6.75, 23.4);
  const flagWhite = new THREE.MeshBasicMaterial({ color: 0xf0eee7, side: THREE.DoubleSide });
  const flagRed = new THREE.MeshBasicMaterial({ color: 0xd3222a, side: THREE.DoubleSide });
  mesh(THREE, new THREE.PlaneGeometry(2.5, 1.3), flagWhite, root, 9.28, 12.45, 23.4).userData = { type: 'station-flag' };
  mesh(THREE, new THREE.PlaneGeometry(0.55, 1.3), flagRed, root, 8.305, 12.45, 23.41);
  mesh(THREE, new THREE.PlaneGeometry(0.55, 1.3), flagRed, root, 10.255, 12.45, 23.41);
  mesh(THREE, new THREE.CircleGeometry(0.25, 6), flagRed, root, 9.28, 12.45, 23.42);

  for (const x of [10.8, 13.2, 15.6, 18.0, 20.4]) {
    mesh(THREE, new THREE.SphereGeometry(0.75, 7, 5), foliage, root, x, 0.76, 14.6);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#142027';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f4eee0';
  context.font = '700 27px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('PETERBOROUGH FIRE SERVICES  ·  STATION 1', 384, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = mesh(THREE, new THREE.PlaneGeometry(8.8, 0.95), new THREE.MeshBasicMaterial({ map: texture }), root, 14.0, 4.55, 13.72);
  sign.userData.texture = texture;
  root.userData.texture = texture;
  return root;
}
