export function groupFeaturesByTile(features, getTileKey) {
  if (!Array.isArray(features)) throw new TypeError('features must be an array');
  if (typeof getTileKey !== 'function') throw new TypeError('getTileKey must be a function');
  const groupsByKey = new Map();
  for (const feature of features) {
    const key = getTileKey(feature);
    let group = groupsByKey.get(key);
    if (!group) groupsByKey.set(key, group = { key, features: [] });
    group.features.push(feature);
  }
  return Array.from(groupsByKey.values());
}

function readCoordinatePair(point) {
  if (Array.isArray(point) && point.length >= 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1])) return [point[0], point[1]];
  if (point && Number.isFinite(point.x)) {
    const second = Number.isFinite(point.z) ? point.z : point.y;
    if (Number.isFinite(second)) return [point.x, second];
  }
  return null;
}

function anyRingIntersectsSquare(value, spawnX, spawnZ, radius) {
  if (!Array.isArray(value) || !value.length) return false;
  const points = value.map(readCoordinatePair);
  if (points.every(Boolean)) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    return minX <= spawnX + radius && maxX >= spawnX - radius
      && minZ <= spawnZ + radius && maxZ >= spawnZ - radius;
  }
  return value.some(child => anyRingIntersectsSquare(child, spawnX, spawnZ, radius));
}

export function isInInitialCityBuildCohort(feature, {
  spawnX, spawnZ, radius, priorityIds,
} = {}) {
  if (feature?.priority === true || feature?.isPriority === true) return true;
  if (priorityIds?.has?.(feature?.id) || (Array.isArray(priorityIds) && priorityIds.includes(feature?.id))) return true;
  if (!Number.isFinite(spawnX) || !Number.isFinite(spawnZ)
    || !Number.isFinite(radius) || radius < 0) return false;
  return Array.isArray(feature?.rings)
    && anyRingIntersectsSquare(feature.rings, spawnX, spawnZ, radius);
}

function defaultYieldFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });
}

function elapsedSince(now, start) {
  return Math.max(0, now() - start);
}

export async function runProgressiveCityBuild({
  groups,
  buildFeature,
  commitGroup,
  onCommit,
  getFocus,
  getDistance,
  isInitialGroup = group => group?.initial === true,
  now = () => performance.now(),
  yieldFrame = defaultYieldFrame,
  budgetMs = 5,
} = {}) {
  if (!Array.isArray(groups)) throw new TypeError('groups must be an array');
  if (typeof buildFeature !== 'function') throw new TypeError('buildFeature must be a function');
  if (typeof commitGroup !== 'function') throw new TypeError('commitGroup must be a function');
  if (typeof now !== 'function' || typeof yieldFrame !== 'function') throw new TypeError('now and yieldFrame must be functions');
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new RangeError('budgetMs must be positive and finite');

  const metrics = { featuresCompleted: 0, groupsCompleted: 0, maxSliceMs: 0, commitElapsedMs: 0 };
  let activeBuildSliceMs = 0;
  const finishBuildSlice = () => {
    metrics.maxSliceMs = Math.max(metrics.maxSliceMs, activeBuildSliceMs);
    activeBuildSliceMs = 0;
  };
  const yieldWork = async () => {
    finishBuildSlice();
    await yieldFrame({ ...metrics });
  };

  const pending = groups.filter(group => !isInitialGroup(group));
  const initial = groups.filter(isInitialGroup);
  const buildGroup = async group => {
    const features = Array.isArray(group?.features) ? group.features : [];
    if (!features.length) return;
    for (const feature of features) {
      const featureStarted = now();
      const buildResult = buildFeature(feature, group);
      activeBuildSliceMs += elapsedSince(now, featureStarted);
      await buildResult;
      metrics.featuresCompleted += 1;
      if (activeBuildSliceMs >= budgetMs) await yieldWork();
    }
    finishBuildSlice();
    const commitStarted = now();
    await commitGroup(group);
    metrics.commitElapsedMs += elapsedSince(now, commitStarted);
    metrics.groupsCompleted += 1;
    if (typeof onCommit === 'function') await onCommit(group, { ...metrics });
    await yieldFrame({ ...metrics });
  };

  for (const group of initial) await buildGroup(group);
  while (pending.length) {
    let selected = 0;
    const focus = typeof getFocus === 'function' ? getFocus() : null;
    if (typeof getDistance === 'function') {
      let nearest = Infinity;
      for (let index = 0; index < pending.length; index += 1) {
        const distance = getDistance(pending[index], focus);
        const comparable = Number.isFinite(distance) ? distance : Infinity;
        if (comparable < nearest) { nearest = comparable; selected = index; }
      }
    }
    await buildGroup(pending.splice(selected, 1)[0]);
  }
  return { ...metrics };
}
