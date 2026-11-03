export const STATION_THREE_DOOR_NAMES = Object.freeze([
  'Station3_Door_01',
  'Station3_Door_02',
  'Station3_Door_03',
]);
export const STATION_THREE_INITIAL_CAMERA_DISTANCE_SCALE = 0.68;
export const STATION_THREE_INTERIOR_DRIVE_CAMERA_HEIGHT = 0.85;
export const STATION_THREE_BAY_EXIT_LOCAL_Z = 5.5;

export function stationGameplayLabels(station) {
  const number = Math.max(1, Number(station?.number) || 1);
  return {
    station: `Fire Station ${number}`,
    engine: `Fire Rescue Engine ${number}`,
  };
}

export function hideStationThreeReplacementRecords(records, hide) {
  if (typeof hide !== 'function') return 0;
  let hidden = 0;
  for (const record of records || []) {
    if (record?.sourceType !== 'building' || String(record.sourceId) !== 'way/558402285') continue;
    if (hide(record.id) !== false) hidden += 1;
  }
  return hidden;
}

export function stationThreeLocalPosition({ x, z, anchorX, anchorZ, modelYaw }) {
  const dx = Number(x) - Number(anchorX);
  const dz = Number(z) - Number(anchorZ);
  const yaw = Number(modelYaw) || 0;
  return {
    x: Math.cos(yaw) * dx - Math.sin(yaw) * dz,
    z: Math.sin(yaw) * dx + Math.cos(yaw) * dz,
  };
}

const SLAT_COUNT = 10;

export function inspectStationThreeModel(root) {
  if (!root || typeof root.traverse !== 'function') {
    return { ready: false, doors: [], errors: ['Station 3 model root is unavailable'] };
  }

  const objects = new Map();
  root.traverse(object => {
    if (object?.name) objects.set(object.name, object);
  });

  const doors = [];
  const errors = [];
  for (const name of STATION_THREE_DOOR_NAMES) {
    const door = objects.get(name);
    if (!door || !door.position || !Number.isFinite(door.position.y)) {
      errors.push(`Missing movable door ${name}`);
      continue;
    }
    const slats = [];
    for (let index = 0; index < SLAT_COUNT; index += 1) {
      const slatName = `${name}_Slat_${String(index).padStart(2, '0')}`;
      const slat = objects.get(slatName);
      if (!slat) errors.push(`Missing door slat ${slatName}`);
      else if (!slat.position || !slat.rotation
        || !Number.isFinite(slat.position.x) || !Number.isFinite(slat.position.y) || !Number.isFinite(slat.position.z)
        || !Number.isFinite(slat.rotation.x)) errors.push(`Door slat ${slatName} has no movable transform`);
      else slats.push(slat);
    }
    doors.push({ name, object: door, slats });
  }

  return { ready: errors.length === 0, doors, errors };
}

export function selectStationThreeSpawn({ stationNumber, assetReady, fallback, interior }) {
  return Number(stationNumber) === 3 && assetReady && interior ? interior : fallback;
}

export function stationThreeThrottleInput({ stationNumber, assetReady, doorPhase, throttle }) {
  const value = Number(throttle) || 0;
  return Number(stationNumber) === 3 && assetReady && doorPhase !== 'open' && value > 0 ? 0 : value;
}

export function loadStationThreeAsset({
  url,
  fetchAsset = globalThis.fetch,
  parseAsset,
  validateAsset = () => true,
  disposeAsset = () => {},
  timeoutMs = 8000,
}) {
  if (typeof fetchAsset !== 'function' || typeof parseAsset !== 'function') {
    throw new TypeError('Station 3 asset loading requires fetch and parse functions');
  }

  return new Promise((resolve) => {
    const abortController = new AbortController();
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      abortController.abort();
      resolve({ asset: null, validation: null, reason: 'timeout' });
    }, Math.max(1, Number(timeoutMs) || 8000));

    const finish = (result) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
      return true;
    };

    (async () => {
      let parsedAsset = null;
      try {
        const response = await fetchAsset(url, { signal: abortController.signal });
        if (settled) return;
        if (!response?.ok) throw new Error(`Station 3 asset request returned ${response?.status ?? 'no response'}`);
        const data = await response.arrayBuffer();
        if (settled) return;
        parsedAsset = await parseAsset(data, url);
        if (settled) {
          disposeAsset(parsedAsset);
          return;
        }
        const validation = validateAsset(parsedAsset);
        const valid = validation === true || validation?.ready === true;
        if (!valid) {
          disposeAsset(parsedAsset);
          finish({ asset: null, validation, reason: 'invalid' });
          return;
        }
        finish({ asset: parsedAsset, validation, reason: null });
      } catch (error) {
        if (settled) {
          if (parsedAsset) disposeAsset(parsedAsset);
          return;
        }
        if (parsedAsset) disposeAsset(parsedAsset);
        finish({ asset: null, validation: null, reason: 'load-failed', error });
      }
    })();
  });
}

export function attachStationThreeModel({ root, parent, createGroup, position, configure = () => {} }) {
  let group = null;
  try {
    group = createGroup();
    group.position.set(position.x, position.y, position.z);
    group.add(root);
    configure(group);
    parent.add(group);
    return { group, error: null };
  } catch (error) {
    group?.removeFromParent?.();
    root?.removeFromParent?.();
    return { group: null, error };
  }
}

export function createStationThreeDoorController({
  doors,
  doorNames = STATION_THREE_DOOR_NAMES,
  delayMs = 850,
  durationMs = 1900,
  openHeight = 4.2,
  slatSpacing = 0.42,
}) {
  if (!Array.isArray(doors) || doors.length !== STATION_THREE_DOOR_NAMES.length) {
    throw new TypeError('A Station 3 door controller requires all three doors');
  }
  const requestedNames = [...new Set(doorNames)];
  if (!requestedNames.length || requestedNames.some(name => !STATION_THREE_DOOR_NAMES.includes(name))) {
    throw new TypeError('Station 3 door controller received an unknown door name');
  }
  const doorsByName = new Map(doors.map(door => [door.name, door]));
  if (requestedNames.some(name => !doorsByName.has(name))) {
    throw new TypeError('Station 3 door controller is missing a requested door');
  }
  const entries = requestedNames.map(name => doorsByName.get(name)).map(({ object, name, slats }) => {
    if (!object?.position || !Number.isFinite(object.position.y)) {
      throw new TypeError(`Station 3 door ${name || ''} has no movable y position`);
    }
    if (!Array.isArray(slats) || slats.length !== SLAT_COUNT) {
      throw new TypeError(`Station 3 door ${name || ''} requires all ten named slats`);
    }
    const closed = slats.map((slat) => {
      if (!slat?.position || !slat?.rotation) {
        throw new TypeError(`Station 3 door ${name || ''} has a slat without a transform`);
      }
      return {
        slat,
        position: { x: slat.position.x, y: slat.position.y, z: slat.position.z },
        rotationX: slat.rotation.x,
      };
    });
    return { name, closed };
  });
  const delay = Math.max(0, Number(delayMs) || 0);
  const duration = Math.max(1, Number(durationMs) || 1);
  let startedAt = null;
  let phase = 'closed';
  let fraction = 0;
  let target = 0;
  let startFraction = 0;
  let motionDuration = duration;

  function applyFraction(value) {
    entries.forEach(({ closed }) => {
      closed.forEach(({ slat, position, rotationX }) => {
        const trackPosition = position.y + Number(openHeight) * value;
        const cornerStart = Number(openHeight) - Number(slatSpacing) / 2;
        const turn = Math.min(1, Math.max(0, (trackPosition - cornerStart) / Number(slatSpacing)));
        slat.position.x = position.x;
        slat.position.y = Math.min(trackPosition, Number(openHeight));
        slat.position.z = position.z - Math.max(0, trackPosition - Number(openHeight));
        slat.rotation.x = rotationX - (Math.PI / 2) * turn;
      });
    });
  }

  function advance(nowMs, { obstructed = false } = {}) {
    if (startedAt === null || phase === 'closed' || phase === 'open') return phase;
    const now = Number(nowMs);
    if (obstructed && target === 0 && phase === 'closing' && fraction > 0) {
      startFraction = fraction;
      target = 1;
      startedAt = now;
      motionDuration = Math.max(1, duration * (target - startFraction));
      return phase = 'opening';
    }
    if (now < startedAt) return phase = 'waiting';
    const progress = Math.min(1, Math.max(0, (now - startedAt) / motionDuration));
    const eased = progress * progress * (3 - 2 * progress);
    fraction = startFraction + (target - startFraction) * eased;
    applyFraction(fraction);
    if (progress >= 1) {
      fraction = target;
      applyFraction(fraction);
      startedAt = null;
      return phase = target === 1 ? 'open' : 'closed';
    }
    return phase = target === 1 ? 'opening' : 'closing';
  }

  function moveTo(next, nowMs, delayMsForStart = 0) {
    const now = Number(nowMs);
    if (startedAt !== null) advance(now);
    target = next;
    startFraction = fraction;
    if (Math.abs(target - fraction) < 1e-9) {
      fraction = target;
      startedAt = null;
      applyFraction(fraction);
      phase = target === 1 ? 'open' : 'closed';
      return target;
    }
    startedAt = now + delayMsForStart;
    motionDuration = Math.max(1, duration * Math.abs(target - startFraction));
    phase = delayMsForStart > 0 ? 'waiting' : target === 1 ? 'opening' : 'closing';
    return target;
  }

  const controller = {
    get phase() { return phase; },
    get fraction() { return fraction; },
    get target() { return target; },
    start(nowMs = 0) {
      return moveTo(1, nowMs, delay);
    },
    open(nowMs = 0) { return moveTo(1, nowMs); },
    close(nowMs = 0) { return moveTo(0, nowMs); },
    toggle(nowMs = 0) { return moveTo(target === 1 ? 0 : 1, nowMs); },
    update(nowMs, options) { return advance(nowMs, options); },
    reset() {
      fraction = 0;
      target = 0;
      startFraction = 0;
      startedAt = null;
      phase = 'closed';
      applyFraction(fraction);
    },
  };
  return controller;
}
