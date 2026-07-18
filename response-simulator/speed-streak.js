(() => {
  'use strict';

  if (window.PTBO_SPEED_STREAK) return;

  const CONFIG = Object.freeze({
    increasePerSecond: 0.2,
    maxHandlingSetting: 50,
    movementThreshold: 0.00000001,
  });

  const state = {
    driveMilliseconds: 0,
    completedSeconds: 0,
    multiplier: 1,
    lastTimestamp: 0,
    lastCollisionCount: 0,
    resetReason: 'start',
  };

  let indicatorNode = null;

  function getSpeedSetting() {
    const input = document.getElementById('sld-speed');
    return Math.max(1, Number(input?.value) || 5);
  }

  function getMaximumMultiplier() {
    return Math.max(1, CONFIG.maxHandlingSetting / getSpeedSetting());
  }

  function getCollisionCount() {
    return Number(window.PTBO_ROAD_COLLISION?.state?.collisions) || 0;
  }

  function isDrivingForward() {
    try {
      const throttleHeld = Boolean(keys?.ArrowUp || keys?.w);
      return throttleHeld && Number(velocity) > CONFIG.movementThreshold;
    } catch {
      return false;
    }
  }

  function installIndicator() {
    if (indicatorNode?.isConnected) return;
    const telemetry = document.querySelector('.telemetry-box');
    if (!telemetry) return;

    telemetry.appendChild(document.createElement('br'));
    telemetry.append('SPEED STREAK: ');
    indicatorNode = document.createElement('span');
    indicatorNode.id = 'tel-speed-streak';
    telemetry.appendChild(indicatorNode);
    updateIndicator();
  }

  function updateIndicator() {
    installIndicator();
    if (!indicatorNode) return;
    const bonusPercent = Math.round((state.multiplier - 1) * 100);
    indicatorNode.textContent = `+${bonusPercent}%`;
    indicatorNode.title = `${state.completedSeconds} second${state.completedSeconds === 1 ? '' : 's'} driven without a collision`;
  }

  function reset(reason = 'collision') {
    state.driveMilliseconds = 0;
    state.completedSeconds = 0;
    state.multiplier = 1;
    state.resetReason = reason;
    updateIndicator();
    window.dispatchEvent(new CustomEvent('ptbo-speed-streak-reset', { detail: { reason } }));
  }

  function updateMultiplier() {
    const completedSeconds = Math.floor(state.driveMilliseconds / 1000);
    if (completedSeconds === state.completedSeconds) return;

    state.completedSeconds = completedSeconds;
    const requestedMultiplier = 1 + completedSeconds * CONFIG.increasePerSecond;
    state.multiplier = Math.min(requestedMultiplier, getMaximumMultiplier());
    updateIndicator();
    window.dispatchEvent(new CustomEvent('ptbo-speed-streak-change', {
      detail: {
        seconds: state.completedSeconds,
        multiplier: state.multiplier,
        bonusPercent: Math.round((state.multiplier - 1) * 100),
      },
    }));
  }

  function applyAccelerationBoost() {
    if (!isDrivingForward() || state.multiplier <= 1) return;
    try {
      const baseAcceleration = 0.00000005 * getSpeedSetting();
      velocity += baseAcceleration * (state.multiplier - 1);
    } catch {
      // The simulator physics variables are not available yet.
    }
  }

  function tick(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const delta = Math.min(100, Math.max(0, timestamp - state.lastTimestamp));
    state.lastTimestamp = timestamp;

    const collisionCount = getCollisionCount();
    if (collisionCount > state.lastCollisionCount) reset('collision');
    state.lastCollisionCount = collisionCount;

    if (isDrivingForward()) {
      state.driveMilliseconds += delta;
      updateMultiplier();
      applyAccelerationBoost();
    }

    requestAnimationFrame(tick);
  }

  function wrapStationTeleport() {
    try {
      if (typeof teleportToStation !== 'function' || teleportToStation._speedStreakWrapped) return;
      const originalTeleport = teleportToStation;
      teleportToStation = function speedStreakTeleport(...args) {
        reset('station-teleport');
        return originalTeleport.apply(this, args);
      };
      teleportToStation._speedStreakWrapped = true;
      window.teleportToStation = teleportToStation;
    } catch {
      // The simulator has not exposed its teleport function yet.
    }
  }

  function initialize() {
    installIndicator();
    state.lastCollisionCount = getCollisionCount();
    wrapStationTeleport();
    window.addEventListener('ptbo-road-collision-ready', () => {
      state.lastCollisionCount = getCollisionCount();
      wrapStationTeleport();
    });
    requestAnimationFrame(tick);
  }

  window.PTBO_SPEED_STREAK = Object.freeze({
    state,
    reset,
    get bonusPercent() {
      return Math.round((state.multiplier - 1) * 100);
    },
  });

  initialize();
})();
