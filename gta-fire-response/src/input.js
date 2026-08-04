import { clamp, normalizeVector } from './math.js';

export class InputController {
  constructor(elements) {
    this.elements = elements;
    this.keys = new Set();
    this.analog = { x: 0, y: 0 };
    this.actionPressed = false;
    this.actionHeld = false;
    this.brakeHeld = false;
    this.boostHeld = false;
    this.events = [];
    this.abortController = new AbortController();
    this.setupKeyboard();
    this.setupJoystick();
    this.setupButtons();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); }, { signal: this.abortController.signal });
    window.addEventListener('blur', () => this.releaseAll(), { signal: this.abortController.signal });
  }

  setupKeyboard() {
    const signal = this.abortController.signal;
    window.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'control'].includes(key)) event.preventDefault();
      this.keys.add(key);
      if ((key === 'e' || key === ' ') && !event.repeat) {
        this.actionPressed = true;
        this.actionHeld = true;
      }
      if (key === 'shift') this.boostHeld = true;
      if (key === 'control') this.brakeHeld = true;
      if (!event.repeat) {
        if (key === 'l') this.events.push('toggleLights');
        if (key === 'q') this.events.push('toggleSiren');
        if (key === 'r') this.events.push('cycleSiren');
        if (key === 'h') this.events.push('horn');
        if (key === 'escape' || key === 'p') this.events.push('pause');
      }
    }, { passive: false, signal });
    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (key === 'e' || key === ' ') this.actionHeld = false;
      if (key === 'shift') this.boostHeld = false;
      if (key === 'control') this.brakeHeld = false;
    }, { passive: false, signal });
  }

  setupJoystick() {
    const joystick = this.elements.joystick;
    const stick = this.elements.stick;
    if (!joystick || !stick) return;
    let pointerId = null;
    const reset = () => {
      pointerId = null;
      this.analog.x = 0;
      this.analog.y = 0;
      stick.style.transform = 'translate(-50%, -50%)';
    };
    const move = event => {
      if (pointerId !== event.pointerId) return;
      const rect = joystick.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const limit = rect.width * 0.31;
      const length = Math.hypot(dx, dy);
      const scale = length > limit ? limit / length : 1;
      const px = dx * scale;
      const py = dy * scale;
      this.analog.x = clamp(px / limit, -1, 1);
      this.analog.y = clamp(py / limit, -1, 1);
      stick.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    };
    joystick.addEventListener('pointerdown', event => {
      event.preventDefault();
      pointerId = event.pointerId;
      joystick.setPointerCapture(pointerId);
      move(event);
    }, { signal: this.abortController.signal });
    joystick.addEventListener('pointermove', move, { signal: this.abortController.signal });
    joystick.addEventListener('pointerup', reset, { signal: this.abortController.signal });
    joystick.addEventListener('pointercancel', reset, { signal: this.abortController.signal });
    joystick.addEventListener('lostpointercapture', reset, { signal: this.abortController.signal });
  }

  bindHold(element, onStart, onEnd) {
    if (!element) return;
    const end = () => { element.classList.remove('active'); onEnd(); };
    element.addEventListener('pointerdown', event => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      element.classList.add('active');
      onStart();
    }, { signal: this.abortController.signal });
    element.addEventListener('pointerup', end, { signal: this.abortController.signal });
    element.addEventListener('pointercancel', end, { signal: this.abortController.signal });
    element.addEventListener('lostpointercapture', end, { signal: this.abortController.signal });
  }

  setupButtons() {
    this.bindHold(this.elements.action, () => { this.actionPressed = true; this.actionHeld = true; }, () => { this.actionHeld = false; });
    this.bindHold(this.elements.brake, () => { this.brakeHeld = true; }, () => { this.brakeHeld = false; });
    this.bindHold(this.elements.boost, () => { this.boostHeld = true; }, () => { this.boostHeld = false; });
    const clickEvent = (element, eventName) => element?.addEventListener('click', event => {
      event.preventDefault();
      this.events.push(eventName);
    }, { signal: this.abortController.signal });
    clickEvent(this.elements.lights, 'toggleLights');
    clickEvent(this.elements.siren, 'toggleSiren');
    clickEvent(this.elements.sirenMode, 'cycleSiren');
    clickEvent(this.elements.horn, 'horn');
    clickEvent(this.elements.pause, 'pause');
  }

  movement() {
    const keyboardX = (this.keys.has('arrowright') || this.keys.has('d') ? 1 : 0) - (this.keys.has('arrowleft') || this.keys.has('a') ? 1 : 0);
    const keyboardY = (this.keys.has('arrowdown') || this.keys.has('s') ? 1 : 0) - (this.keys.has('arrowup') || this.keys.has('w') ? 1 : 0);
    return normalizeVector(this.analog.x + keyboardX, this.analog.y + keyboardY);
  }

  consumeActionPressed() { const value = this.actionPressed; this.actionPressed = false; return value; }
  consumeEvents() { return this.events.splice(0, this.events.length); }

  releaseAll() {
    this.keys.clear();
    this.analog.x = 0;
    this.analog.y = 0;
    this.actionPressed = false;
    this.actionHeld = false;
    this.brakeHeld = false;
    this.boostHeld = false;
    if (this.elements.stick) this.elements.stick.style.transform = 'translate(-50%, -50%)';
  }

  destroy() { this.abortController.abort(); this.releaseAll(); }
}
