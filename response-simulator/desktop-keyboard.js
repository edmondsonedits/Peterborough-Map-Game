/* Keep keyboard driving connected while the desktop toolbar has focus. */
(() => {
  'use strict';
  const frame = document.getElementById('simulator');
  if (!frame || !/\/response-simulator\/play\/(?:index\.html)?$/.test(location.pathname)) return;

  const codes = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
  const drivingKeys = new Set(['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const editable = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
  const held = new Set();

  function release() {
    held.clear();
    frame.contentWindow?.releaseDrivingInput?.();
  }

  function forward(event) {
    const key = codes[event.code] || (event.key?.length === 1 ? event.key.toLowerCase() : event.key);
    if (!drivingKeys.has(key)) return;
    if (document.querySelector('dialog[open]')) { release(); return; }
    const down = event.type === 'keydown';
    if (down && (event.ctrlKey || event.altKey || event.metaKey || event.target?.closest?.(editable))) return;
    if (!down && !held.has(key)) return;
    const game = frame.contentWindow;
    if (typeof game?.releaseDrivingInput !== 'function') return;
    event.preventDefault();
    if (down) held.add(key); else held.delete(key);
    game.dispatchEvent(new game.KeyboardEvent(event.type, {
      key, code: event.code, repeat: event.repeat, bubbles: true, cancelable: true,
    }));
  }

  window.addEventListener('keydown', forward);
  window.addEventListener('keyup', forward);
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  frame.addEventListener('load', () => held.clear());
})();
