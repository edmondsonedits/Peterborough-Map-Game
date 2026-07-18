(() => {
  'use strict';

  if (window.PTBO_MAX_SPEED_TRACKER) return;

  const state = {
    maxSpeedKmh: 0,
    displayedMaxKmh: 0,
  };

  let maxSpeedNode = null;

  function installTracker() {
    const speedometer = document.getElementById('ptbo-speedometer');
    if (!speedometer) return false;

    if (!document.getElementById('ptbo-max-speed-style')) {
      const style = document.createElement('style');
      style.id = 'ptbo-max-speed-style';
      style.textContent = `
        #ptbo-speedometer {
          display:grid !important;
          grid-template-columns:auto auto;
          grid-template-areas:
            "speed unit"
            "maximum maximum";
          align-items:baseline;
          column-gap:4px;
          row-gap:2px;
        }
        #ptbo-speedometer-value { grid-area:speed; }
        #ptbo-speedometer-unit { grid-area:unit; }
        #ptbo-max-speed {
          grid-area:maximum;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:4px;
          padding-top:3px;
          color:#94a3b8;
          border-top:1px solid rgba(255,255,255,.12);
          font-family:"SFMono-Regular",Consolas,monospace;
          font-size:7px;
          font-weight:850;
          line-height:1;
          letter-spacing:.08em;
          text-transform:uppercase;
          font-variant-numeric:tabular-nums;
        }
        #ptbo-max-speed-value {
          min-width:2.2ch;
          color:#fbbf24;
          font-size:9px;
          font-weight:950;
          letter-spacing:-.02em;
          text-align:right;
        }
        @media (max-width:900px), (pointer:coarse) {
          #ptbo-max-speed { font-size:6px; }
          #ptbo-max-speed-value { font-size:8px; }
        }
      `;
      document.head.appendChild(style);
    }

    maxSpeedNode = document.getElementById('ptbo-max-speed-value');
    if (!maxSpeedNode) {
      const maxRow = document.createElement('span');
      maxRow.id = 'ptbo-max-speed';
      maxRow.innerHTML = 'MAX <strong id="ptbo-max-speed-value">0</strong>';
      maxRow.title = 'Highest speed reached during this play session';
      speedometer.appendChild(maxRow);
      maxSpeedNode = maxRow.querySelector('#ptbo-max-speed-value');
    }
    return Boolean(maxSpeedNode);
  }

  function render() {
    if (!maxSpeedNode?.isConnected && !installTracker()) return;
    const displayed = Math.max(0, Math.min(999, Math.round(state.maxSpeedKmh)));
    if (displayed === state.displayedMaxKmh && maxSpeedNode.textContent === String(displayed)) return;
    state.displayedMaxKmh = displayed;
    maxSpeedNode.textContent = String(displayed);
  }

  function tick() {
    if (!maxSpeedNode?.isConnected) installTracker();
    const currentSpeed = Number(window.PTBO_VEHICLE_INSTRUMENTS?.state?.speedKmh) || 0;
    if (Number.isFinite(currentSpeed) && currentSpeed > state.maxSpeedKmh) {
      state.maxSpeedKmh = currentSpeed;
      render();
    }
    requestAnimationFrame(tick);
  }

  window.PTBO_MAX_SPEED_TRACKER = Object.freeze({
    state,
    reset() {
      state.maxSpeedKmh = 0;
      state.displayedMaxKmh = -1;
      render();
    },
  });

  installTracker();
  render();
  requestAnimationFrame(tick);
})();
