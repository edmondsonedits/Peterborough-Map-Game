function keyState(event, down) {
  const key = event.key.toLowerCase();
  if (['arrowup', 'w'].includes(key)) keys.up = down;
  if (['arrowdown', 's'].includes(key)) keys.down = down;
  if (['arrowleft', 'a'].includes(key)) keys.left = down;
  if (['arrowright', 'd'].includes(key)) keys.right = down;
  if (key === 'shift') keys.boost = down;
  if (key === 'control') keys.brake = down;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e'].includes(key)) event.preventDefault();
  if ((key === 'e' || key === ' ') && down && !event.repeat) {
    keys.action = true;
    if (promptAction === 'work') interact(true);
    else interact(false);
  }
  if ((key === 'e' || key === ' ') && !down) {
    keys.action = false;
    actionHeld = false;
  }
}

function setupJoystick() {
  let pointer = null;
  const reset = () => {
    pointer = null;
    analog.x = 0;
    analog.y = 0;
    ui.stick.style.transform = 'translate(-50%, -50%)';
  };
  const move = event => {
    if (pointer !== event.pointerId) return;
    const rect = ui.joystick.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const limit = rect.width * .31;
    const magnitude = Math.hypot(x, y);
    const scale = magnitude > limit ? limit / magnitude : 1;
    const px = x * scale;
    const py = y * scale;
    analog.x = clamp(px / limit, -1, 1);
    analog.y = clamp(py / limit, -1, 1);
    ui.stick.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
  };
  ui.joystick.addEventListener('pointerdown', event => {
    event.preventDefault();
    pointer = event.pointerId;
    ui.joystick.setPointerCapture(pointer);
    move(event);
  });
  ui.joystick.addEventListener('pointermove', move);
  ui.joystick.addEventListener('pointerup', reset);
  ui.joystick.addEventListener('pointercancel', reset);
  ui.joystick.addEventListener('lostpointercapture', reset);

  const bindHold = (element, on, off) => {
    element.addEventListener('pointerdown', event => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      element.classList.add('active');
      on();
    });
    const end = () => { element.classList.remove('active'); off(); };
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
    element.addEventListener('lostpointercapture', end);
  };
  bindHold(ui.boost, () => { keys.boost = true; }, () => { keys.boost = false; });
  bindHold(ui.brake, () => { keys.brake = true; }, () => { keys.brake = false; });
  bindHold(ui.action, () => { promptAction === 'work' ? interact(true) : interact(false); }, () => { actionHeld = false; });
}

function releaseAllInputs() {
  Object.keys(keys).forEach(key => { keys[key] = false; });
  analog.x = 0;
  analog.y = 0;
  actionHeld = false;
  ui.stick.style.transform = 'translate(-50%, -50%)';
}

window.addEventListener('keydown', event => keyState(event, true), { passive: false });
window.addEventListener('keyup', event => keyState(event, false), { passive: false });
window.addEventListener('blur', releaseAllInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllInputs(); });
ui.startButton.addEventListener('click', startShift);
ui.next.addEventListener('click', returnStation);

setupJoystick();
initMap();
initRoads();
requestAnimationFrame(loop);
