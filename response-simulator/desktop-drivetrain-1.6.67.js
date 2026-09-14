/* Browser-only emergency-response training simulator drivetrain v1.6.67. No physical vehicle interfaces. */
(() => {
  'use strict';

  const VERSION = '1.6.67';
  const BASE_CAP_KMH = 100;
  const SHIFT_CAP_KMH = 150;
  const DOUBLE_TAP_MS = 360;
  if (window.PTBO_DESKTOP_DRIVETRAIN?.version === VERSION) return;

  const editable = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
  const state = {
    gear: 1,
    maxKmh: BASE_CAP_KMH,
    lastWTapAt: -Infinity,
    lastCollisionCount: Number(window.PTBO_ROAD_COLLISION?.state?.collisions) || 0,
  };
  let toastTimer = 0;

  function velocityToKmh() {
    const value = Number(window.PTBO_GEARBOX?.velocityToKmh);
    return Number.isFinite(value) && value > 0 ? value : 111195 * 60 * 3.6;
  }

  function clampForwardSpeed() {
    const conversion = velocityToKmh();
    const currentVelocity = Number(velocity) || 0;
    if (currentVelocity > 0 && currentVelocity * conversion > state.maxKmh) {
      velocity = state.maxKmh / conversion;
    }
  }

  function showGearStatus(message) {
    let node = document.getElementById('ptbo-desktop-gear-status');
    if (!node) {
      node = document.createElement('div');
      node.id = 'ptbo-desktop-gear-status';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.style.cssText = 'position:fixed;left:50%;bottom:22px;z-index:2147483000;transform:translate(-50%,12px);padding:7px 11px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(8,13,24,.92);box-shadow:0 5px 18px rgba(0,0,0,.35);color:#f8fafc;font:800 11px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.03em;opacity:0;pointer-events:none;transition:opacity .14s ease,transform .14s ease;';
      document.body?.appendChild(node);
    }
    node.textContent = message;
    node.style.opacity = '1';
    node.style.transform = 'translate(-50%,0)';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translate(-50%,12px)';
    }, 1100);
  }

  function setGear(gear, reason = '') {
    const nextGear = gear >= 2 ? 2 : 1;
    const changed = state.gear !== nextGear;
    state.gear = nextGear;
    state.maxKmh = nextGear === 2 ? SHIFT_CAP_KMH : BASE_CAP_KMH;
    document.documentElement.dataset.ptboDesktopGear = String(state.gear);
    document.documentElement.dataset.ptboDesktopSpeedCap = String(state.maxKmh);
    clampForwardSpeed();
    if (changed) {
      showGearStatus(reason === 'collision'
        ? `Gear 1 · ${BASE_CAP_KMH} km/h · boundary reset`
        : `Gear ${state.gear} · ${state.maxKmh} km/h`);
      window.dispatchEvent(new CustomEvent('ptbo-desktop-gear-change', {
        detail: { gear: state.gear, maxKmh: state.maxKmh, reason },
      }));
    }
    return changed;
  }

  function handleKeyDown(event) {
    const key = event.code === 'KeyW' ? 'w' : (event.key?.length === 1 ? event.key.toLowerCase() : event.key);
    if (key !== 'w' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target?.closest?.(editable)) return;
    const now = performance.now();
    if (now - state.lastWTapAt <= DOUBLE_TAP_MS) {
      state.lastWTapAt = -Infinity;
      setGear(2, 'double-tap-w');
    } else {
      state.lastWTapAt = now;
    }
  }

  function tick() {
    const collisionCount = Number(window.PTBO_ROAD_COLLISION?.state?.collisions) || 0;
    if (collisionCount > state.lastCollisionCount) setGear(1, 'collision');
    state.lastCollisionCount = collisionCount;
    clampForwardSpeed();
    requestAnimationFrame(tick);
  }

  window.addEventListener('keydown', handleKeyDown, true);
  window.PTBO_DESKTOP_DRIVETRAIN = Object.freeze({
    version: VERSION,
    state,
    baseCapKmh: BASE_CAP_KMH,
    shiftedCapKmh: SHIFT_CAP_KMH,
    doubleTapMs: DOUBLE_TAP_MS,
    reset: () => setGear(1, 'manual'),
    shiftUp: () => setGear(2, 'manual'),
    clamp: clampForwardSpeed,
  });
  document.documentElement.dataset.ptboDesktopDrivetrain = VERSION;
  document.documentElement.dataset.ptboDesktopGear = '1';
  document.documentElement.dataset.ptboDesktopSpeedCap = String(BASE_CAP_KMH);
  requestAnimationFrame(tick);
})();
