/* Peterborough 3D Simulator mobile driving refinement — v1.6.69 */
(() => {
  'use strict';

  const VERSION = '1.6.69';
  const joystick = document.getElementById('movement-joystick');
  if (!joystick || !matchMedia('(pointer: coarse)').matches) return;

  const analog = { active: false, pointerId: null, x: 0, y: 0 };
  let bridgeInstalled = false;
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const mobilePad = {
    id: 'PTBO Mobile Precision Steering',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    vibrationActuator: null,
  };

  const mode = () => document.documentElement.dataset.gameplayMode || 'onFoot';
  const driving = () => mode() === 'driving';

  // app.js already has a good analog gamepad path, but it removes a 0.16
  // hardware-stick deadzone. Mobile touch input does not need that hardware
  // deadzone, so encode the touch value just above 0.16 and let app.js decode
  // it back to a smooth near-zero value. This gives almost no touch deadzone
  // without making tiny movements jump to full steering.
  function encodeForRuntime(value, touchDeadzone, exponent) {
    const raw = Math.max(-1, Math.min(1, Number(value) || 0));
    const magnitude = Math.abs(raw);
    if (magnitude <= touchDeadzone) return 0;
    const normalized = (magnitude - touchDeadzone) / (1 - touchDeadzone);
    const shaped = Math.pow(Math.max(0, Math.min(1, normalized)), exponent);
    return Math.sign(raw) * Math.min(1, 0.1605 + 0.8395 * shaped);
  }

  function updateFromPointer(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.max(30, Math.min(rect.width, rect.height) * 0.34);
    let dx = clientX - cx;
    let dy = clientY - cy;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      const scale = radius / distance;
      dx *= scale;
      dy *= scale;
    }

    const nx = dx / radius;
    const ny = dy / radius;
    // ~2% steering travel is enough to begin a very soft turn. Throttle has a
    // slightly larger centre tolerance so resting thumbs do not creep the truck.
    const steer = encodeForRuntime(nx, 0.018, 1.32);
    const throttle = encodeForRuntime(ny, 0.035, 1.18);
    analog.x = steer;
    analog.y = throttle;
    mobilePad.axes[0] = steer;
    mobilePad.axes[1] = throttle;
    mobilePad.timestamp = performance.now();
    document.documentElement.dataset.mobileSteering = String((-steer).toFixed(3));
    document.documentElement.dataset.mobileThrottle = String((-throttle).toFixed(3));
    joystick.dataset.precisionSteering = Math.abs(nx) < 0.30 && Math.abs(nx) >= 0.018 ? 'soft' : 'normal';
  }

  function clearAnalog() {
    analog.active = false;
    analog.pointerId = null;
    analog.x = analog.y = 0;
    mobilePad.axes[0] = mobilePad.axes[1] = 0;
    mobilePad.timestamp = performance.now();
    document.documentElement.dataset.mobileSteering = '0';
    document.documentElement.dataset.mobileThrottle = '0';
    joystick.removeAttribute('data-precision-steering');
  }

  function installGamepadBridge() {
    const nativeGetGamepads = typeof navigator.getGamepads === 'function'
      ? navigator.getGamepads.bind(navigator)
      : () => [];
    const replacement = () => {
      const nativePads = Array.from(nativeGetGamepads() || []).filter(Boolean);
      return analog.active && driving() ? [mobilePad, ...nativePads] : nativePads;
    };
    try {
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: replacement });
      bridgeInstalled = true;
    } catch (_) {
      try {
        navigator.getGamepads = replacement;
        bridgeInstalled = true;
      } catch (_) {}
    }
    document.documentElement.dataset.mobileAnalogDriving = bridgeInstalled ? VERSION : 'fallback';
  }
  installGamepadBridge();

  // The v1.6.68 mobile controller still emits digital W/A/S/D events. In
  // driving mode those would override analog steering, so suppress only those
  // synthetic movement events while the precision joystick is active. The E
  // action button and real keyboard input are untouched.
  const digitalDrivingCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
  const suppressDigitalDriving = event => {
    if (!bridgeInstalled || !analog.active || !driving() || event.isTrusted || !digitalDrivingCodes.has(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('keydown', suppressDigitalDriving, true);
  window.addEventListener('keyup', suppressDigitalDriving, true);

  joystick.addEventListener('pointerdown', event => {
    if (!bridgeInstalled || !driving()) return;
    analog.active = true;
    analog.pointerId = event.pointerId;
    updateFromPointer(event.clientX, event.clientY);
  }, true);

  joystick.addEventListener('pointermove', event => {
    if (!analog.active || event.pointerId !== analog.pointerId || !driving()) return;
    updateFromPointer(event.clientX, event.clientY);
  }, true);

  const finish = event => {
    if (!analog.active) return;
    if (event?.pointerId !== undefined && analog.pointerId !== null && event.pointerId !== analog.pointerId) return;
    clearAnalog();
  };
  joystick.addEventListener('pointerup', finish, true);
  joystick.addEventListener('pointercancel', finish, true);
  joystick.addEventListener('lostpointercapture', finish, true);

  const observer = new MutationObserver(() => {
    if (!driving()) clearAnalog();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gameplay-mode'] });

  addEventListener('blur', clearAnalog);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAnalog(); });
})();
