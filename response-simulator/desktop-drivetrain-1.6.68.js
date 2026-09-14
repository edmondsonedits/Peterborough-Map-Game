/* Browser-only emergency-response training simulator drivetrain v1.6.68. No physical vehicle interfaces. */
(() => {
  'use strict';

  const VERSION = '1.6.68';
  const DOUBLE_TAP_MS = 360;
  const GEAR_CAPS_KMH = Object.freeze([100, 150, 200, 250, 300, Infinity]);
  const TOP_GEAR = GEAR_CAPS_KMH.length;
  if (window.PTBO_DESKTOP_DRIVETRAIN?.version === VERSION) return;

  const editable = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
  const state = {
    gear: 1,
    maxKmh: GEAR_CAPS_KMH[0],
    lastWTapAt: -Infinity,
    lastCollisionCount: Number(window.PTBO_ROAD_COLLISION?.state?.collisions) || 0,
  };
  let toastTimer = 0;

  function velocityToKmh() {
    const value = Number(window.PTBO_GEARBOX?.velocityToKmh);
    return Number.isFinite(value) && value > 0 ? value : 111195 * 60 * 3.6;
  }

  function clampForwardSpeed() {
    if (!Number.isFinite(state.maxKmh)) return;
    const conversion = velocityToKmh();
    const currentVelocity = Number(velocity) || 0;
    if (currentVelocity > 0 && currentVelocity * conversion > state.maxKmh) {
      velocity = state.maxKmh / conversion;
    }
  }

  function gearLabel() {
    return Number.isFinite(state.maxKmh)
      ? `Gear ${state.gear} · ${state.maxKmh} km/h`
      : `Gear ${state.gear} · Unlimited`;
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
    const nextGear = Math.max(1, Math.min(TOP_GEAR, Math.round(Number(gear) || 1)));
    const changed = state.gear !== nextGear;
    state.gear = nextGear;
    state.maxKmh = GEAR_CAPS_KMH[nextGear - 1];
    document.documentElement.dataset.ptboDesktopGear = String(state.gear);
    document.documentElement.dataset.ptboDesktopSpeedCap = Number.isFinite(state.maxKmh) ? String(state.maxKmh) : 'unlimited';
    clampForwardSpeed();
    if (changed) {
      showGearStatus(reason === 'collision'
        ? `Gear 1 · ${GEAR_CAPS_KMH[0]} km/h · boundary reset`
        : gearLabel());
      window.dispatchEvent(new CustomEvent('ptbo-desktop-gear-change', {
        detail: {
          gear: state.gear,
          maxKmh: Number.isFinite(state.maxKmh) ? state.maxKmh : null,
          unlimited: !Number.isFinite(state.maxKmh),
          reason,
        },
      }));
    }
    return changed;
  }

  function shiftUp(reason = 'double-tap-w') {
    if (state.gear >= TOP_GEAR) {
      showGearStatus(gearLabel());
      return false;
    }
    return setGear(state.gear + 1, reason);
  }

  function handleKeyDown(event) {
    const key = event.code === 'KeyW' ? 'w' : (event.key?.length === 1 ? event.key.toLowerCase() : event.key);
    if (key !== 'w' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.target?.closest?.(editable)) return;
    const now = performance.now();
    if (now - state.lastWTapAt <= DOUBLE_TAP_MS) {
      state.lastWTapAt = -Infinity;
      shiftUp('double-tap-w');
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
    gearCapsKmh: GEAR_CAPS_KMH,
    topGear: TOP_GEAR,
    doubleTapMs: DOUBLE_TAP_MS,
    reset: () => setGear(1, 'manual'),
    shiftUp: () => shiftUp('manual'),
    setGear: gear => setGear(gear, 'manual'),
    clamp: clampForwardSpeed,
  });
  document.documentElement.dataset.ptboDesktopDrivetrain = VERSION;
  document.documentElement.dataset.ptboDesktopGear = '1';
  document.documentElement.dataset.ptboDesktopSpeedCap = String(GEAR_CAPS_KMH[0]);
  requestAnimationFrame(tick);
})();
