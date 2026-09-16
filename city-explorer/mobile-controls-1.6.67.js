(() => {
  'use strict';

  const VERSION = '1.6.67';
  const root = document.getElementById('touch-controls');
  const joystick = document.getElementById('movement-joystick');
  const knob = joystick?.querySelector('.joystick-knob');
  const actionButton = document.getElementById('mobile-action-button');
  const actionLabel = document.getElementById('mobile-action-label');
  const actionDetail = document.getElementById('mobile-action-detail');
  const flightButtons = root?.querySelectorAll('[data-mobile-command]') || [];

  if (!root || !joystick || !knob || !actionButton || !actionLabel || !actionDetail) return;

  root.dataset.mobileControlsVersion = VERSION;
  document.documentElement.dataset.cityExplorerMobileControls = VERSION;

  const keyNames = Object.freeze({
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
    KeyE: 'e',
    KeyQ: 'q',
  });
  const movementCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const activeKeys = new Set();
  let pointerId = null;

  function emitKey(code, down) {
    if (!keyNames[code]) return;
    if (down && activeKeys.has(code)) return;
    if (!down && !activeKeys.has(code)) return;
    down ? activeKeys.add(code) : activeKeys.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code,
      key: keyNames[code],
      bubbles: true,
      cancelable: true,
    }));
  }

  function releaseMovement() {
    movementCodes.forEach(code => emitKey(code, false));
  }

  function resetJoystick() {
    releaseMovement();
    knob.style.transform = 'translate3d(0, 0, 0)';
    joystick.classList.remove('is-active');
    joystick.removeAttribute('data-direction');
    pointerId = null;
  }

  function applyJoystick(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const maxRadius = Math.max(26, Math.min(rect.width, rect.height) * 0.31);
    const distance = Math.hypot(dx, dy);
    if (distance > maxRadius) {
      const scale = maxRadius / distance;
      dx *= scale;
      dy *= scale;
    }

    knob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;

    const nx = dx / maxRadius;
    const ny = dy / maxRadius;
    const deadzone = 0.26;
    const horizontal = Math.abs(nx) >= deadzone ? Math.sign(nx) : 0;
    const vertical = Math.abs(ny) >= deadzone ? Math.sign(ny) : 0;

    emitKey('KeyA', horizontal < 0);
    emitKey('KeyD', horizontal > 0);
    emitKey('KeyW', vertical < 0);
    emitKey('KeyS', vertical > 0);

    const direction = [
      vertical < 0 ? 'forward' : vertical > 0 ? 'back' : '',
      horizontal < 0 ? 'left' : horizontal > 0 ? 'right' : '',
    ].filter(Boolean).join('-');
    if (direction) joystick.dataset.direction = direction;
    else joystick.removeAttribute('data-direction');
  }

  joystick.addEventListener('pointerdown', event => {
    if (document.getElementById('app')?.classList.contains('is-map')) return;
    event.preventDefault();
    pointerId = event.pointerId;
    joystick.setPointerCapture?.(pointerId);
    joystick.classList.add('is-active');
    applyJoystick(event.clientX, event.clientY);
  });

  joystick.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    applyJoystick(event.clientX, event.clientY);
  });

  const finishJoystick = event => {
    if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
    if (event?.cancelable) event.preventDefault();
    resetJoystick();
  };
  joystick.addEventListener('pointerup', finishJoystick);
  joystick.addEventListener('pointercancel', finishJoystick);
  joystick.addEventListener('lostpointercapture', finishJoystick);

  function tapKey(code) {
    emitKey(code, true);
    window.setTimeout(() => emitKey(code, false), 70);
  }

  actionButton.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (actionButton.disabled) return;
    tapKey('KeyE');
    actionButton.classList.add('is-pressed');
  });
  const releaseAction = () => actionButton.classList.remove('is-pressed');
  actionButton.addEventListener('pointerup', releaseAction);
  actionButton.addEventListener('pointercancel', releaseAction);
  actionButton.addEventListener('pointerleave', releaseAction);

  flightButtons.forEach(button => {
    const code = button.dataset.mobileCommand;
    const start = event => {
      event.preventDefault();
      emitKey(code, true);
      button.classList.add('is-pressed');
    };
    const end = event => {
      if (event.cancelable) event.preventDefault();
      emitKey(code, false);
      button.classList.remove('is-pressed');
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
  });

  function syncMode() {
    const app = document.getElementById('app');
    const mode = document.documentElement.dataset.gameplayMode || 'onFoot';
    const ready = document.documentElement.dataset.gameplayReady === 'true';
    const mapMode = app?.classList.contains('is-map') || mode === 'map';
    const flyMode = app?.classList.contains('is-fly') || mode === 'fly';

    root.classList.toggle('is-map-mode', mapMode);
    root.classList.toggle('is-fly-mode', flyMode);

    if (mode === 'driving') {
      actionLabel.textContent = 'Exit';
      actionDetail.textContent = 'Truck';
      actionButton.setAttribute('aria-label', 'Exit fire truck');
    } else {
      actionLabel.textContent = 'Enter';
      actionDetail.textContent = 'Truck';
      actionButton.setAttribute('aria-label', 'Enter fire truck');
    }

    actionButton.disabled = !ready || mapMode || flyMode;
    if (mapMode) resetJoystick();
  }

  const observer = new MutationObserver(syncMode);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gameplay-mode', 'data-gameplay-ready'] });
  const app = document.getElementById('app');
  if (app) observer.observe(app, { attributes: true, attributeFilter: ['class'] });
  syncMode();

  window.addEventListener('blur', () => {
    resetJoystick();
    [...activeKeys].forEach(code => emitKey(code, false));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetJoystick();
      [...activeKeys].forEach(code => emitKey(code, false));
    }
  });
})();
