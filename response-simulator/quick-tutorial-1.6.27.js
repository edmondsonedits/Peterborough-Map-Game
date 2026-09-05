/* Emergency Response Simulator quick tutorial — v1.6.27. */
(() => {
  'use strict';

  const VERSION = '1.6.27';
  const STORAGE_KEY = 'ptboResponseQuickTutorialSeenV1';
  if (window.PTBO_QUICK_TUTORIAL?.version === VERSION) return;

  const state = {
    open: false,
    step: 0,
    steps: [],
    autoStarted: false,
    lastFocus: null,
  };

  function hostWindow() {
    try {
      if (window.parent !== window && window.parent.document?.getElementById('simulator')) return window.parent;
    } catch (_) {}
    return window;
  }

  function hostDocument() {
    return hostWindow().document;
  }

  function isMobile() {
    try {
      return Boolean(hostDocument().querySelector('.mobile-controls'));
    } catch (_) {
      return false;
    }
  }

  function cityInfo() {
    const city = window.PTBO_CITY_PACKAGE || window.PTBO_SERVICE?.city || {};
    return {
      id: city.id || 'peterborough',
      name: city.name || 'Peterborough',
      baseTraining: Boolean(city.features?.baseTraining || city.dispatch?.available === false),
    };
  }

  function serviceInfo() {
    const mode = window.PTBO_SERVICE?.state?.mode === 'ems' ? 'ems' : 'fire';
    const profile = window.PTBO_SERVICE?.getProfile?.();
    return {
      mode,
      label: profile?.label || (mode === 'ems' ? 'EMS' : 'Fire'),
      vehicle: mode === 'ems' ? 'ambulance' : 'fire truck',
    };
  }

  function icon(name) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths = {
      welcome: '<path d="M4 18V9l8-5 8 5v9"/><path d="M2 20h20M9 20v-6h6v6M8 9h8"/>',
      service: '<path d="M4 17h16M6 17V9h12v8M8 9V6h8v3"/><path d="M12 7v5M9.5 9.5h5"/>',
      drive: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M4.6 10h14.8M12 14v6"/>',
      camera: '<path d="M3 7h4l2-2h6l2 2h4v12H3Z"/><circle cx="12" cy="13" r="4"/>',
      dispatch: '<path d="M6 18h12M8 18v-5a4 4 0 0 1 8 0v5M10 9V6h4v3"/><path d="m4 9-2-1m18 1 2-1M12 4V2"/>',
      fire: '<path d="M13 3s1 4-2 6c-2 1-3 3-3 5a4 4 0 0 0 8 0c0-2-1-4-3-5 0 2-1 3-2 3"/>',
      ems: '<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/>',
      route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5 16.5 7.5M6 8v4m0-8v1"/>',
      ready: '<path d="m5 12 4 4L19 6"/>',
    };
    return `<svg ${common}>${paths[name] || paths.ready}</svg>`;
  }

  function desktopDriveCopy() {
    return `
      <p><strong>W / ↑</strong> accelerates, <strong>S / ↓</strong> reverses, and <strong>A/D or ←/→</strong> steers.</p>
      <ul><li>The speedometer shows your current speed.</li><li>Release the controls before opening a menu or leaving the page.</li></ul>`;
  }

  function mobileDriveCopy() {
    return `
      <p><strong>Directional mode:</strong> point and hold the thumbstick where you want the vehicle to face. It steers and drives together; releasing it stops acceleration and keeps the exact heading.</p>
      <ul><li>Tap the red gear button to shift up and <strong>Down</strong> to shift down.</li><li>Gears 1–5 limit speed to 50, 100, 150, 200, and 250 km/h. Gear 6 builds toward 999 km/h.</li><li>Hold <strong>Reverse</strong> to back up. Standard steering and a separate Gas pedal remain available in Options.</li></ul>`;
  }

  function buildSteps() {
    const city = cityInfo();
    const service = serviceInfo();
    const mobile = isMobile();
    const steps = [
      {
        icon: 'welcome',
        eyebrow: `${city.name} · ${city.baseTraining ? 'Base Training' : 'Dispatch Simulator'}`,
        title: `You are driving the ${service.vehicle}`,
        body: city.baseTraining
          ? `<p>Use the full Peterborough driving system to practise leaving ${city.name} Fire and EMS bases and learning the city.</p><div class="ptbo-tutorial-note">Dispatch calls are not available in ${city.name} yet, so this tour focuses on free driving and controls.</div>`
          : '<p>Choose a base, receive an emergency call, drive to the marked location, and review your route when the assignment is complete.</p><div class="ptbo-tutorial-note">This is a training game, not a real emergency-navigation tool.</div>',
      },
      {
        icon: 'service',
        eyebrow: 'Service & deployment',
        title: 'Choose Fire, EMS, and a base',
        body: `<p>The buttons across the top move you directly to a Fire station or paramedic base. Open <strong>Options</strong> to change service or see every available base.</p><ul><li>Fire uses the fire truck.</li><li>EMS uses the ambulance.</li><li>Changing service or base ends an active assignment and returns you to the selected base.</li></ul>`,
      },
      {
        icon: 'drive',
        eyebrow: mobile ? 'Phone controls' : 'Keyboard controls',
        title: mobile ? 'Point, drive, and shift' : 'Steer with WASD or the arrows',
        body: mobile ? mobileDriveCopy() : desktopDriveCopy(),
      },
      {
        icon: 'camera',
        eyebrow: 'Map & vehicle tools',
        title: 'Keep the vehicle and route in view',
        body: `<p>The map stays north-up and normally follows the vehicle. Use <strong>Recenter</strong> whenever you pan away.</p><ul><li><strong>Satellite / Normal Map</strong> changes the map layer.</li><li><strong>Emergency lights</strong> changes the vehicle lighting.</li><li><strong>Dispatch voice</strong> can be muted with the speaker button.</li><li>The camera widens automatically at very high speed and returns closer as you slow down.</li></ul>`,
      },
    ];

    if (!city.baseTraining) {
      steps.push(
        {
          icon: 'dispatch',
          eyebrow: 'Starting an assignment',
          title: 'Press Start Call and follow the dispatch',
          body: '<p>The call card shows the incident type, location, address, and response timer. Drive to the coloured arrival circle.</p><ul><li>Arrival is automatic when the vehicle enters the circle.</li><li>Road boundaries keep the vehicle on mapped roads and inside drivable station/base yards.</li><li>Use Options to choose which incident types may be dispatched.</li></ul>',
        },
        {
          icon: 'fire',
          eyebrow: 'Fire assignments',
          title: 'Respond, arrive, and return available',
          body: '<p>For Fire, reach the call marker. The simulator records your response time, briefly shows the crew working on scene, and then enables <strong>Next Call</strong>.</p>',
        },
        {
          icon: 'ems',
          eyebrow: 'EMS assignments',
          title: 'Scene first, then hospital',
          body: '<p>For EMS, reach the patient first. After the automatic pickup, a new blue destination appears for the hospital.</p><ul><li>The response and transport legs have separate timers.</li><li>The call is complete only after the ambulance reaches the hospital arrival point and finishes handover.</li></ul>',
        },
        {
          icon: 'route',
          eyebrow: 'After-action review',
          title: 'Compare the route you drove',
          body: '<p>After the assignment, open <strong>Compare Routes</strong> before starting the next call.</p><ul><li><span class="ptbo-route-dot blue"></span>Blue: your route to the call</li><li><span class="ptbo-route-dot green"></span>Green: recommended route to the call</li><li><span class="ptbo-route-dot orange"></span>Orange: your EMS route to hospital</li><li><span class="ptbo-route-dot purple"></span>Purple: recommended EMS route to hospital</li></ul>',
        },
      );
    }

    steps.push({
      icon: 'ready',
      eyebrow: 'Options & replay',
      title: city.baseTraining ? 'You are ready to explore' : 'You are ready for the next call',
      body: `<p>Options also contains vehicle size, ${mobile ? 'steering mode, ' : ''}acceleration, incident filters, base selection, map settings, and telemetry.</p><div class="ptbo-tutorial-note">Open Options and choose <strong>Replay Quick Tutorial</strong> whenever you need this guide again.</div>`,
    });
    return steps;
  }

  function installStyles() {
    const doc = hostDocument();
    if (doc.getElementById('ptbo-quick-tutorial-style')) return;
    const style = doc.createElement('style');
    style.id = 'ptbo-quick-tutorial-style';
    style.textContent = `
      #ptbo-quick-tutorial{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(2,8,18,.78);backdrop-filter:blur(8px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #ptbo-quick-tutorial[hidden]{display:none!important}
      #ptbo-quick-tutorial *{box-sizing:border-box}
      .ptbo-tutorial-card{position:relative;width:min(620px,100%);max-height:min(720px,calc(100dvh - 36px));display:flex;flex-direction:column;overflow:hidden;color:#f8fafc;border:1px solid rgba(255,255,255,.18);border-radius:24px;background:linear-gradient(155deg,rgba(18,32,51,.99),rgba(8,15,28,.99));box-shadow:0 28px 90px rgba(0,0,0,.58)}
      .ptbo-tutorial-accent{height:5px;flex:0 0 auto;background:linear-gradient(90deg,#ef4444 0 42%,#38bdf8 42% 72%,#facc15 72%)}
      .ptbo-tutorial-progress{height:3px;flex:0 0 auto;background:rgba(255,255,255,.08)}
      .ptbo-tutorial-progress span{display:block;height:100%;background:#facc15;transition:width .22s ease}
      .ptbo-tutorial-main{padding:clamp(22px,5vw,36px);overflow:auto;overscroll-behavior:contain}
      .ptbo-tutorial-top{display:flex;align-items:flex-start;gap:16px}
      .ptbo-tutorial-icon{width:54px;height:54px;flex:0 0 auto;display:grid;place-items:center;color:#f8fafc;border:1px solid rgba(125,211,252,.42);border-radius:16px;background:linear-gradient(145deg,#0c4a6e,#172033);box-shadow:inset 0 1px rgba(255,255,255,.12)}
      .ptbo-tutorial-icon svg{width:29px;height:29px}
      .ptbo-tutorial-eyebrow{margin:2px 0 6px;color:#93c5fd;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
      .ptbo-tutorial-card h2{margin:0;color:#fff;font-size:clamp(23px,4.5vw,32px);line-height:1.08;letter-spacing:-.035em}
      .ptbo-tutorial-body{margin-top:22px;color:#dbe6f2;font-size:14px;line-height:1.58}
      .ptbo-tutorial-body p{margin:0 0 14px}.ptbo-tutorial-body p:last-child{margin-bottom:0}
      .ptbo-tutorial-body ul{display:grid;gap:8px;margin:12px 0 0;padding-left:20px}
      .ptbo-tutorial-body strong{color:#fff}
      .ptbo-tutorial-note{margin-top:14px;padding:11px 13px;color:#fde68a;border:1px solid rgba(250,204,21,.25);border-radius:11px;background:rgba(113,63,18,.18);font-size:12px;font-weight:700;line-height:1.5}
      .ptbo-route-dot{display:inline-block;width:10px;height:10px;margin-right:8px;border:1px solid #fff;border-radius:50%;vertical-align:-1px}.ptbo-route-dot.blue{background:#2563eb}.ptbo-route-dot.green{background:#22c55e}.ptbo-route-dot.orange{background:#f97316}.ptbo-route-dot.purple{background:#c084fc}
      .ptbo-tutorial-footer{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:16px clamp(20px,5vw,34px) calc(16px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.1);background:rgba(3,9,18,.54)}
      .ptbo-tutorial-count{color:#a9bacb;font-size:11px;font-weight:850;letter-spacing:.08em;white-space:nowrap}
      .ptbo-tutorial-actions{display:flex;justify-content:flex-end;gap:8px}
      .ptbo-tutorial-button{min-height:42px;padding:0 16px;color:#f8fafc;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:#233247;font:inherit;font-size:12px;font-weight:850;cursor:pointer;touch-action:manipulation}
      .ptbo-tutorial-button:hover{background:#30435e}.ptbo-tutorial-button:active{transform:scale(.97)}.ptbo-tutorial-button:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px}
      .ptbo-tutorial-button.primary{color:#111827;border-color:#fde047;background:#facc15}.ptbo-tutorial-button.primary:hover{background:#fde047}
      .ptbo-tutorial-button.skip{padding:0;border:0;background:transparent;color:#a9bacb}.ptbo-tutorial-button.skip:hover{color:#fff;background:transparent}
      @media(max-width:600px){#ptbo-quick-tutorial{place-items:end center;padding:0}.ptbo-tutorial-card{width:100%;max-height:min(84dvh,760px);border-width:1px 0 0;border-radius:24px 24px 0 0}.ptbo-tutorial-main{padding:23px 21px 20px}.ptbo-tutorial-icon{width:47px;height:47px;border-radius:14px}.ptbo-tutorial-icon svg{width:25px;height:25px}.ptbo-tutorial-body{margin-top:18px;font-size:13px}.ptbo-tutorial-footer{grid-template-columns:auto 1fr;padding:12px 16px calc(12px + env(safe-area-inset-bottom))}.ptbo-tutorial-footer>.ptbo-tutorial-button.skip{grid-column:1}.ptbo-tutorial-count{display:none}.ptbo-tutorial-actions{grid-column:2}}
      @media(max-height:520px) and (orientation:landscape){#ptbo-quick-tutorial{padding:8px}.ptbo-tutorial-card{width:min(760px,100%);max-height:calc(100dvh - 16px);border:1px solid rgba(255,255,255,.18);border-radius:18px}.ptbo-tutorial-main{padding:16px 22px}.ptbo-tutorial-top{gap:12px}.ptbo-tutorial-icon{width:42px;height:42px}.ptbo-tutorial-card h2{font-size:22px}.ptbo-tutorial-body{margin-top:12px;font-size:12px;line-height:1.42}.ptbo-tutorial-body ul{grid-template-columns:1fr 1fr;gap:5px 22px}.ptbo-tutorial-footer{padding:9px 18px}.ptbo-tutorial-button{min-height:36px}}
      @media(prefers-reduced-motion:reduce){.ptbo-tutorial-progress span,.ptbo-tutorial-button{transition:none}}
    `;
    doc.head.appendChild(style);
  }

  function installOverlay() {
    const doc = hostDocument();
    installStyles();
    let overlay = doc.getElementById('ptbo-quick-tutorial');
    if (overlay) return overlay;
    overlay = doc.createElement('section');
    overlay.id = 'ptbo-quick-tutorial';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ptbo-tutorial-title');
    overlay.innerHTML = `
      <div class="ptbo-tutorial-card">
        <div class="ptbo-tutorial-accent"></div>
        <div class="ptbo-tutorial-progress"><span></span></div>
        <div class="ptbo-tutorial-main">
          <div class="ptbo-tutorial-top">
            <div class="ptbo-tutorial-icon"></div>
            <div><div class="ptbo-tutorial-eyebrow"></div><h2 id="ptbo-tutorial-title"></h2></div>
          </div>
          <div class="ptbo-tutorial-body"></div>
        </div>
        <div class="ptbo-tutorial-footer">
          <button class="ptbo-tutorial-button skip" type="button" data-tutorial="skip">Skip tutorial</button>
          <span class="ptbo-tutorial-count" aria-live="polite"></span>
          <div class="ptbo-tutorial-actions"><button class="ptbo-tutorial-button" type="button" data-tutorial="back">Back</button><button class="ptbo-tutorial-button primary" type="button" data-tutorial="next">Next</button></div>
        </div>
      </div>`;
    overlay.addEventListener('click', event => {
      const action = event.target.closest?.('[data-tutorial]')?.dataset.tutorial;
      if (action === 'skip') close(true);
      if (action === 'back') previous();
      if (action === 'next') next();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      } else if (event.key === 'Tab') {
        const controls = [...overlay.querySelectorAll('button:not([hidden]):not(:disabled)')];
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    doc.body.appendChild(overlay);
    return overlay;
  }

  function render() {
    const overlay = installOverlay();
    const step = state.steps[state.step];
    if (!step) return;
    overlay.querySelector('.ptbo-tutorial-icon').innerHTML = icon(step.icon);
    overlay.querySelector('.ptbo-tutorial-eyebrow').textContent = step.eyebrow;
    overlay.querySelector('#ptbo-tutorial-title').textContent = step.title;
    overlay.querySelector('.ptbo-tutorial-body').innerHTML = step.body;
    overlay.querySelector('.ptbo-tutorial-progress span').style.width = `${((state.step + 1) / state.steps.length) * 100}%`;
    overlay.querySelector('.ptbo-tutorial-count').textContent = `${state.step + 1} of ${state.steps.length}`;
    const back = overlay.querySelector('[data-tutorial="back"]');
    const nextButton = overlay.querySelector('[data-tutorial="next"]');
    back.hidden = state.step === 0;
    nextButton.textContent = state.step === state.steps.length - 1 ? 'Start Driving' : 'Next';
    overlay.querySelector('.ptbo-tutorial-main').scrollTop = 0;
    nextButton.focus();
  }

  function open({ force = false } = {}) {
    if (state.open) return true;
    if (!force) {
      try { if (localStorage.getItem(STORAGE_KEY) === '1') return false; } catch (_) {}
    }
    const serviceSelected = Boolean(window.PTBO_SERVICE?.state?.selected);
    if (!force && !serviceSelected) return false;
    state.steps = buildSteps();
    state.step = 0;
    state.open = true;
    state.lastFocus = hostDocument().activeElement;
    const overlay = installOverlay();
    overlay.hidden = false;
    hostDocument().documentElement.classList.add('ptbo-tutorial-open');
    try { hostWindow().dispatchEvent(new hostWindow().Event('blur')); } catch (_) {}
    render();
    return true;
  }

  function close(markSeen = true) {
    const overlay = hostDocument().getElementById('ptbo-quick-tutorial');
    if (overlay) overlay.hidden = true;
    hostDocument().documentElement.classList.remove('ptbo-tutorial-open');
    state.open = false;
    if (markSeen) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
    }
    try { state.lastFocus?.focus?.(); } catch (_) {}
    state.lastFocus = null;
  }

  function next() {
    if (!state.open) return;
    if (state.step >= state.steps.length - 1) {
      close(true);
      return;
    }
    state.step += 1;
    render();
  }

  function previous() {
    if (!state.open || state.step === 0) return;
    state.step -= 1;
    render();
  }

  function installReplayButton() {
    if (document.getElementById('ptbo-replay-tutorial')) return true;
    const panel = document.querySelector('#control-panel .panel-scroll');
    if (!panel) return false;
    const button = document.createElement('button');
    button.id = 'ptbo-replay-tutorial';
    button.className = 'station-spawn-box';
    button.type = 'button';
    button.textContent = 'Replay Quick Tutorial';
    button.style.borderColor = '#38bdf8';
    button.addEventListener('click', () => {
      if (!document.getElementById('control-panel')?.classList.contains('minimized')) window.togglePanel?.();
      setTimeout(() => open({ force: true }), 180);
    });
    const subtitle = panel.querySelector('.subtitle');
    if (subtitle) subtitle.insertAdjacentElement('afterend', button);
    else panel.prepend(button);
    return true;
  }

  function autoStart() {
    installReplayButton();
    if (state.autoStarted) return;
    try { if (localStorage.getItem(STORAGE_KEY) === '1') return; } catch (_) {}
    if (!window.PTBO_SERVICE?.state?.selected) return;
    state.autoStarted = true;
    setTimeout(() => open(), 420);
  }

  window.PTBO_QUICK_TUTORIAL = Object.freeze({
    version: VERSION,
    state,
    open,
    close,
    next,
    previous,
    buildSteps,
  });

  window.addEventListener('ptbo-service-change', autoStart);
  [0, 250, 800, 1800, 4000].forEach(delay => setTimeout(() => {
    installReplayButton();
    autoStart();
  }, delay));
})();
