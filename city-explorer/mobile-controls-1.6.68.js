(() => {
  'use strict';

  const VERSION = '1.6.68';
  const root = document.getElementById('touch-controls');
  const joystick = document.getElementById('movement-joystick');
  const knob = joystick?.querySelector('.joystick-knob');
  const joystickCaption = joystick?.closest('.mobile-joystick-wrap')?.querySelector('.mobile-control-caption');
  const actionButton = document.getElementById('mobile-action-button');
  const actionLabel = document.getElementById('mobile-action-label');
  const actionDetail = document.getElementById('mobile-action-detail');
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const menuScrim = document.getElementById('mobile-menu-scrim');
  const interactionPrompt = document.getElementById('interaction-prompt');
  const controlPanel = document.querySelector('.control-panel');
  const flightButtons = root?.querySelectorAll('[data-mobile-command]') || [];
  const app = document.getElementById('app');

  if (!root || !joystick || !knob || !actionButton || !actionLabel || !actionDetail) return;

  root.dataset.mobileControlsVersion = VERSION;
  document.documentElement.dataset.cityExplorerMobileControls = VERSION;

  const keyNames = Object.freeze({
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyQ: 'q', ShiftLeft: 'Shift',
  });
  const movementCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'];
  const activeKeys = new Set();
  let pointerId = null;
  let menuOpen = false;
  let lastDirection = '';

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
    joystick.classList.remove('is-active', 'is-running');
    joystick.removeAttribute('data-direction');
    joystick.removeAttribute('data-strength');
    if (joystickCaption) joystickCaption.textContent = document.documentElement.dataset.gameplayMode === 'driving' ? 'Drive' : 'Move';
    pointerId = null;
    lastDirection = '';
  }

  function directionFromVector(nx, ny, magnitude) {
    if (magnitude < 0.20) return '';
    const angle = Math.atan2(ny, nx) * 180 / Math.PI;
    if (angle >= -22.5 && angle < 22.5) return 'right';
    if (angle >= 22.5 && angle < 67.5) return 'back-right';
    if (angle >= 67.5 && angle < 112.5) return 'back';
    if (angle >= 112.5 && angle < 157.5) return 'back-left';
    if (angle >= 157.5 || angle < -157.5) return 'left';
    if (angle >= -157.5 && angle < -112.5) return 'forward-left';
    if (angle >= -112.5 && angle < -67.5) return 'forward';
    return 'forward-right';
  }

  function applyDirection(direction, magnitude) {
    const forward = direction.includes('forward');
    const back = direction.includes('back');
    const left = direction.includes('left');
    const right = direction.includes('right');
    emitKey('KeyW', forward);
    emitKey('KeyS', back);
    emitKey('KeyA', left);
    emitKey('KeyD', right);

    const mode = document.documentElement.dataset.gameplayMode || 'onFoot';
    const running = mode === 'onFoot' && magnitude >= 0.84 && Boolean(direction);
    emitKey('ShiftLeft', running);
    joystick.classList.toggle('is-running', running);
    if (joystickCaption) joystickCaption.textContent = running ? 'Run' : mode === 'driving' ? 'Drive' : 'Move';
  }

  function applyJoystick(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const maxRadius = Math.max(30, Math.min(rect.width, rect.height) * 0.34);
    const rawDistance = Math.hypot(dx, dy);
    if (rawDistance > maxRadius) {
      const scale = maxRadius / rawDistance;
      dx *= scale;
      dy *= scale;
    }

    knob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    const nx = dx / maxRadius;
    const ny = dy / maxRadius;
    const magnitude = Math.min(1, Math.hypot(nx, ny));
    const direction = directionFromVector(nx, ny, magnitude);

    if (!direction) {
      releaseMovement();
      joystick.removeAttribute('data-direction');
      joystick.dataset.strength = 'idle';
      joystick.classList.remove('is-running');
      if (joystickCaption) joystickCaption.textContent = document.documentElement.dataset.gameplayMode === 'driving' ? 'Drive' : 'Move';
      lastDirection = '';
      return;
    }

    if (direction !== lastDirection || magnitude < 0.32) {
      applyDirection(direction, magnitude);
      lastDirection = direction;
    } else {
      applyDirection(direction, magnitude);
    }
    joystick.dataset.direction = direction;
    joystick.dataset.strength = magnitude >= 0.84 ? 'strong' : magnitude >= 0.52 ? 'medium' : 'light';
  }

  joystick.addEventListener('pointerdown', event => {
    if (app?.classList.contains('is-map')) return;
    event.preventDefault();
    closeMenu();
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

  function setMenu(open) {
    menuOpen = Boolean(open);
    app?.classList.toggle('mobile-menu-open', menuOpen);
    menuToggle?.setAttribute('aria-expanded', String(menuOpen));
    if (menuOpen) resetJoystick();
  }
  function closeMenu() { if (menuOpen) setMenu(false); }
  menuToggle?.addEventListener('click', event => {
    event.preventDefault();
    setMenu(!menuOpen);
  });
  menuScrim?.addEventListener('click', closeMenu);
  controlPanel?.addEventListener('click', event => {
    if (event.target.closest('.hud-button')) window.setTimeout(closeMenu, 80);
  });

  function syncActionButton(mode, ready, mapMode, flyMode) {
    const promptText = interactionPrompt?.textContent?.trim() || '';
    const promptVisible = interactionPrompt?.classList.contains('is-visible') && Boolean(promptText);
    const canEnter = mode === 'onFoot' && promptVisible && /enter/i.test(promptText);
    const canExit = mode === 'driving' && promptVisible && /exit/i.test(promptText);

    actionButton.classList.toggle('is-ready', canEnter || canExit);
    if (!ready) {
      actionLabel.textContent = '…';
      actionDetail.textContent = 'Loading';
      actionButton.disabled = true;
    } else if (mapMode || flyMode) {
      actionLabel.textContent = 'Action';
      actionDetail.textContent = 'Unavailable';
      actionButton.disabled = true;
    } else if (mode === 'driving') {
      actionLabel.textContent = canExit ? 'Exit' : 'Stop';
      actionDetail.textContent = canExit ? 'Truck' : 'To exit';
      actionButton.disabled = !canExit;
      actionButton.setAttribute('aria-label', canExit ? 'Exit fire truck' : 'Stop the fire truck to exit');
    } else {
      actionLabel.textContent = canEnter ? 'Enter' : 'Truck';
      actionDetail.textContent = canEnter ? 'Truck' : 'Get closer';
      actionButton.disabled = !canEnter;
      actionButton.setAttribute('aria-label', canEnter ? 'Enter fire truck' : 'Move closer to the fire truck to enter');
    }
  }

  function syncMode() {
    const mode = document.documentElement.dataset.gameplayMode || 'onFoot';
    const ready = document.documentElement.dataset.gameplayReady === 'true';
    const mapMode = app?.classList.contains('is-map') || mode === 'map';
    const flyMode = app?.classList.contains('is-fly') || mode === 'fly';

    root.classList.toggle('is-map-mode', mapMode);
    root.classList.toggle('is-fly-mode', flyMode);
    root.classList.toggle('is-driving-mode', mode === 'driving');
    if (joystickCaption && pointerId === null) joystickCaption.textContent = mode === 'driving' ? 'Drive' : flyMode ? 'Fly' : 'Move';
    syncActionButton(mode, ready, mapMode, flyMode);
    if (mapMode) resetJoystick();
  }

  const observer = new MutationObserver(syncMode);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gameplay-mode', 'data-gameplay-ready'] });
  if (app) observer.observe(app, { attributes: true, attributeFilter: ['class'] });
  if (interactionPrompt) observer.observe(interactionPrompt, { attributes: true, childList: true, subtree: true, characterData: true });
  syncMode();

  window.addEventListener('blur', () => {
    closeMenu();
    resetJoystick();
    [...activeKeys].forEach(code => emitKey(code, false));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      closeMenu();
      resetJoystick();
      [...activeKeys].forEach(code => emitKey(code, false));
    }
  });
})();
