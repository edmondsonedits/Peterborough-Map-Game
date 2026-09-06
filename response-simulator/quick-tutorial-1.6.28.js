/* Visual Emergency Response Simulator tutorial — v1.6.28. */
(() => {
  'use strict';

  const VERSION = '1.6.28';
  const STORAGE_KEY = 'ptboResponseVisualTutorialSeenV1';
  const STAGE_CLASSES = ['bases', 'driving', 'dispatch', 'finish', 'tools'];
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

  const hostDocument = () => hostWindow().document;

  function isMobile() {
    try { return Boolean(hostDocument().querySelector('.mobile-controls')); }
    catch (_) { return false; }
  }

  function cityInfo() {
    const city = window.PTBO_CITY_PACKAGE || window.PTBO_SERVICE?.city || {};
    return {
      name: city.name || 'Peterborough',
      baseTraining: Boolean(city.features?.baseTraining || city.dispatch?.available === false),
    };
  }

  function serviceInfo() {
    const ems = window.PTBO_SERVICE?.state?.mode === 'ems';
    return { ems, label: ems ? 'EMS' : 'Fire', vehicle: ems ? 'ambulance' : 'fire truck' };
  }

  function icon(path) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  const ICONS = Object.freeze({
    bases: icon('<path d="M4 17h16M6 17V9h12v8M8 9V6h8v3"/><path d="M12 7v5M9.5 9.5h5"/>'),
    driving: icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M4.6 10h14.8M12 14v6"/>'),
    dispatch: icon('<path d="M6 18h12M8 18v-5a4 4 0 0 1 8 0v5M10 9V6h4v3"/><path d="m4 9-2-1m18 1 2-1M12 4V2"/>'),
    finish: icon('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5 16.5 7.5"/>'),
    tools: icon('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  });

  function toolRow() {
    return `<div class="ptbo-demo-tools" aria-label="Map and vehicle controls">
      <div>${icon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6"/>')}<span>Voice</span></div>
      <div>${icon('<path d="M7 14V9a5 5 0 0 1 10 0v5M5 18h14M8 14h8l1 4H7l1-4Z"/>')}<span>Lights</span></div>
      <div>${ICONS.tools}<span>Recenter</span></div>
      <div>${icon('<path d="M4 6h16v12H4Z"/><path d="m4 14 4-4 3 3 3-2 6 5"/>')}<span>Map</span></div>
      <div>${icon('<path d="M4 7h10M18 7h2M14 5v4M4 17h2M10 17h10M6 15v4"/>')}<span>Options</span></div>
    </div>`;
  }

  function baseExample(city, service) {
    const exactBases = window.PTBO_SERVICE?.getBases?.() || [];
    const fallbackBases = service.ems ? ['Base 1', 'Base 2'] : ['Station 1', 'Station 2', 'Station 3'];
    const baseLabels = exactBases.length
      ? exactBases.map(base => base.shortName || base.name)
      : fallbackBases;
    const baseButtons = baseLabels.map((label, index) =>
      `<span class="${index === 0 ? 'active' : ''}">${escapeHtml(label)}</span>`
    ).join('');
    return `<div class="ptbo-demo-surface">
      <div class="ptbo-demo-caption">What you see across the top</div>
      <div class="ptbo-demo-bases">${baseButtons}</div>
      <div class="ptbo-demo-choice"><strong>${escapeHtml(service.label)}</strong><span>${escapeHtml(service.vehicle)} · ${escapeHtml(city.name)}</span><b>Change in Options</b></div>
      ${toolRow()}
    </div>`;
  }

  function desktopDriveExample() {
    return `<div class="ptbo-demo-surface ptbo-demo-driving">
      <div class="ptbo-demo-caption">Your keyboard controls</div>
      <div class="ptbo-keyboard">
        <div class="ptbo-key-stack"><kbd>W<small>Gas</small></kbd><div><kbd>A<small>Left</small></kbd><kbd>S<small>Reverse</small></kbd><kbd>D<small>Right</small></kbd></div></div>
        <span>or</span>
        <div class="ptbo-key-stack"><kbd>↑<small>Gas</small></kbd><div><kbd>←<small>Left</small></kbd><kbd>↓<small>Reverse</small></kbd><kbd>→<small>Right</small></kbd></div></div>
      </div>
      <div class="ptbo-speed-demo"><strong>42</strong><span>km/h</span><i>Speedometer</i></div>
    </div>`;
  }

  function dispatchExample(service) {
    const ems = service.ems;
    return `<div class="ptbo-demo-dispatch ${ems ? 'ems' : 'fire'}" aria-label="Example active dispatch call">
      <div class="ptbo-demo-dispatch-main">
        <div class="ptbo-demo-dispatch-title">ACTIVE ENROUTE DISPATCH: ${ems ? 'DIFFICULTY BREATHING' : 'STRUCTURE FIRE'}</div>
        <strong>${ems ? 'Peterborough Public Library' : 'Lansdowne Place Mall'}</strong>
        <span>Address: ${ems ? '345 Aylmer St N' : '645 Lansdowne St W'}</span>
      </div>
      <div class="ptbo-demo-clock"><b>00:08.4</b><span>Responding…</span></div>
    </div>
    <div class="ptbo-arrival-example"><span class="ptbo-arrival-ring"></span><div><strong>Drive into the coloured circle</strong><small>The game detects your arrival automatically.</small></div></div>`;
  }

  function finishExample() {
    return `<div class="ptbo-response-flows">
      <div><strong>Fire</strong><span>Call</span><i>→</i><span>Scene</span><i>→</i><span>Available</span></div>
      <div class="ems"><strong>EMS</strong><span>Call</span><i>→</i><span>Scene</span><i>→</i><span>Hospital</span><i>→</i><span>Available</span></div>
    </div>
    <div class="ptbo-route-example">
      <div class="ptbo-route-map" aria-label="Example route comparison map">
        <svg viewBox="0 0 360 126" preserveAspectRatio="none" aria-hidden="true">
          <path class="road" d="M-10 95 C58 83 55 25 130 35 S222 112 370 45"/>
          <path class="road" d="M35 -8 C80 30 103 62 150 136M245 -8 C220 38 246 83 315 136"/>
          <path class="player" d="M18 102 C68 92 76 42 134 45"/>
          <path class="recommended" d="M18 102 C48 70 82 52 134 45"/>
          <path class="hospital-player" d="M134 45 C195 80 225 105 330 67"/>
          <path class="hospital-recommended" d="M134 45 C210 52 250 74 330 67"/>
        </svg>
        <b class="marker start">S</b><b class="marker call">C</b><b class="marker hospital">H</b>
      </div>
      <div class="ptbo-route-legend"><span><i class="blue"></i>Your drive</span><span><i class="green"></i>Recommended</span><span><i class="orange"></i>EMS to hospital</span><span><i class="purple"></i>Recommended to hospital</span></div>
    </div>`;
  }

  function buildSteps() {
    const city = cityInfo();
    const service = serviceInfo();
    const mobile = isMobile();
    const steps = [
      {
        stage: 'bases', icon: ICONS.bases, eyebrow: `${city.name} · ${service.label}`,
        title: 'Choose where you start',
        copy: `Tap a base button to spawn there. Options changes Fire or EMS and swaps the ${service.vehicle}.`,
        visual: baseExample(city, service),
      },
      {
        stage: 'driving', icon: ICONS.driving, eyebrow: mobile ? 'Your live phone controls' : 'Keyboard driving',
        title: mobile ? 'Point, hold, and drive' : 'Drive with WASD or the arrows',
        copy: mobile
          ? 'Point and hold the wheel to face and drive. Tap the red Gear button for more speed; Down shifts lower; Reverse backs up.'
          : 'Hold Gas or Reverse and steer at the same time. If you pan away, Recenter returns to the truck and resumes following it.',
        visual: mobile ? '' : desktopDriveExample(),
      },
    ];

    if (!city.baseTraining) {
      steps.push(
        {
          stage: 'dispatch', icon: ICONS.dispatch, eyebrow: 'A real call looks like this',
          title: 'Read the call, then respond',
          copy: 'Start Call shows the incident, exact address, and timer. Drive to the marked arrival circle.',
          visual: dispatchExample(service),
        },
        {
          stage: 'finish', icon: ICONS.finish, eyebrow: 'Arrival & route review',
          title: 'Finish the call and learn your route',
          copy: 'Fire finishes at the scene. EMS adds a hospital trip. Afterward, Compare Routes shows exactly where you drove beside the recommended route.',
          visual: finishExample(),
        },
      );
    } else {
      steps.push({
        stage: 'tools', icon: ICONS.tools, eyebrow: `${city.name} base training`,
        title: 'Explore with the same vehicle tools',
        copy: `Use Recenter, map layers, lights, voice, and Options while practising. Dispatch calls are not available in ${city.name} yet.`,
        visual: toolRow(),
      });
    }
    return steps;
  }

  function installStyles() {
    const doc = hostDocument();
    if (doc.getElementById('ptbo-quick-tutorial-style')) return;
    const style = doc.createElement('style');
    style.id = 'ptbo-quick-tutorial-style';
    style.textContent = `
      #ptbo-quick-tutorial{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));background:rgba(2,8,18,.78);backdrop-filter:blur(7px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #ptbo-quick-tutorial[hidden]{display:none!important}#ptbo-quick-tutorial *{box-sizing:border-box}
      .ptbo-tutorial-card{width:min(650px,100%);max-height:calc(100dvh - 28px);display:flex;flex-direction:column;overflow:hidden;color:#f8fafc;border:1px solid rgba(255,255,255,.19);border-radius:22px;background:linear-gradient(155deg,rgba(18,32,51,.99),rgba(8,15,28,.99));box-shadow:0 28px 90px rgba(0,0,0,.58)}
      .ptbo-tutorial-accent{height:5px;flex:0 0 auto;background:linear-gradient(90deg,#ef4444 0 42%,#38bdf8 42% 72%,#facc15 72%)}
      .ptbo-tutorial-progress{height:3px;flex:0 0 auto;background:#ffffff14}.ptbo-tutorial-progress span{display:block;height:100%;background:#facc15;transition:width .2s}
      .ptbo-tutorial-main{padding:clamp(20px,4vw,30px);overflow:auto;overscroll-behavior:contain}.ptbo-tutorial-heading{display:flex;gap:14px;align-items:center}
      .ptbo-tutorial-icon{width:48px;height:48px;flex:0 0 auto;display:grid;place-items:center;color:#fff;border:1px solid #7dd3fc70;border-radius:14px;background:linear-gradient(145deg,#075985,#172033)}.ptbo-tutorial-icon svg{width:26px;height:26px}
      .ptbo-tutorial-eyebrow{margin:0 0 4px;color:#93c5fd;font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.ptbo-tutorial-card h2{margin:0;color:#fff;font-size:clamp(22px,4vw,29px);line-height:1.08;letter-spacing:-.035em}
      .ptbo-tutorial-copy{margin:15px 0 0;color:#dbe6f2;font-size:14px;font-weight:650;line-height:1.5}.ptbo-tutorial-visual{margin-top:17px}
      .ptbo-demo-surface{padding:12px;border:1px solid #ffffff1f;border-radius:14px;background:#070f1de8}.ptbo-demo-caption{margin-bottom:8px;color:#94a3b8;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      .ptbo-demo-bases{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:6px}.ptbo-demo-bases span{padding:9px 5px;color:#e5e7eb;border:1px solid #ffffff2f;border-radius:9px;background:#111827;text-align:center;font-size:10px;font-weight:850}.ptbo-demo-bases .active{border-color:#ef4444;background:#991b1b}
      .ptbo-demo-choice{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;margin-top:8px;padding:9px 10px;border-radius:10px;background:#17243a}.ptbo-demo-choice strong{color:#fff}.ptbo-demo-choice span{color:#cbd5e1;font-size:11px}.ptbo-demo-choice b{color:#7dd3fc;font-size:9px;text-transform:uppercase}
      .ptbo-demo-tools{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:9px}.ptbo-demo-tools>div{min-width:0;display:grid;justify-items:center;gap:4px;padding:7px 2px;color:#dbeafe;border:1px solid #ffffff20;border-radius:9px;background:#111827}.ptbo-demo-tools svg{width:18px;height:18px}.ptbo-demo-tools span{font-size:8px;font-weight:800}
      .ptbo-keyboard{display:flex;align-items:center;justify-content:center;gap:14px}.ptbo-keyboard>span{color:#64748b;font-size:11px;font-weight:900}.ptbo-key-stack{display:grid;justify-items:center;gap:4px}.ptbo-key-stack>div{display:flex;gap:4px}.ptbo-keyboard kbd{width:56px;height:49px;display:grid;place-items:center;padding:5px;color:#fff;border:1px solid #64748b;border-bottom-width:3px;border-radius:8px;background:#1e293b;font:900 15px/1 system-ui}.ptbo-keyboard kbd small{color:#94a3b8;font-size:7px;text-transform:uppercase}.ptbo-speed-demo{width:max-content;display:flex;align-items:baseline;gap:4px;margin:11px auto 0;padding:7px 11px;border:1px solid #ffffff2b;border-radius:9px;background:#080d18}.ptbo-speed-demo strong{font:900 21px/1 ui-monospace,monospace}.ptbo-speed-demo span{color:#cbd5e1;font-size:7px}.ptbo-speed-demo i{margin-left:7px;color:#64748b;font-size:8px;font-style:normal;text-transform:uppercase}
      .ptbo-demo-dispatch{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:12px;padding:13px 14px;border:1px solid #ffffff28;border-left:5px solid #f0ad4e;border-radius:6px;background:rgba(25,22,15,.97);box-shadow:0 8px 22px #0006}.ptbo-demo-dispatch.ems{border-left-color:#38bdf8;background:rgba(7,31,48,.97)}.ptbo-demo-dispatch-main{min-width:0}.ptbo-demo-dispatch-title{overflow:hidden;color:#b0b0b0;font-size:8px;font-weight:800;letter-spacing:.08em;text-overflow:ellipsis;white-space:nowrap}.ptbo-demo-dispatch-main strong{display:block;margin-top:4px;color:#fff;font-size:14px}.ptbo-demo-dispatch-main span{display:block;margin-top:4px;color:#ccc;font-size:10px}.ptbo-demo-clock{display:grid;align-content:center;gap:6px;text-align:center}.ptbo-demo-clock b{color:#ffcc00;font:900 20px/1 ui-monospace,monospace}.ptbo-demo-clock span{padding:6px 5px;border-radius:4px;background:#d9534f;color:#fff;font-size:9px;font-weight:850}
      .ptbo-arrival-example{display:flex;align-items:center;gap:12px;margin-top:10px;padding:9px 12px;border:1px solid #ffffff1f;border-radius:11px;background:#0b1627}.ptbo-arrival-ring{width:39px;height:39px;flex:0 0 auto;border:4px solid #f0ad4e;border-radius:50%;background:#f0ad4e38;box-shadow:0 0 0 5px #f0ad4e1c}.ptbo-arrival-example strong,.ptbo-arrival-example small{display:block}.ptbo-arrival-example strong{font-size:11px}.ptbo-arrival-example small{margin-top:3px;color:#94a3b8;font-size:9px}
      .ptbo-response-flows{display:grid;gap:7px}.ptbo-response-flows>div{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid #fb718542;border-radius:10px;background:#3b15203d}.ptbo-response-flows>div.ems{border-color:#38bdf842;background:#06354a52}.ptbo-response-flows strong{width:34px;font-size:10px}.ptbo-response-flows span{padding:5px 7px;border-radius:7px;background:#ffffff12;font-size:9px;font-weight:800}.ptbo-response-flows i{color:#94a3b8;font-size:10px;font-style:normal}
      .ptbo-route-example{display:grid;grid-template-columns:minmax(0,1fr) 145px;gap:10px;margin-top:10px}.ptbo-route-map{position:relative;min-height:126px;overflow:hidden;border:1px solid #ffffff24;border-radius:12px;background-color:#233044;background-image:linear-gradient(#ffffff0a 1px,transparent 1px),linear-gradient(90deg,#ffffff0a 1px,transparent 1px);background-size:19px 19px}.ptbo-route-map svg{position:absolute;inset:0;width:100%;height:100%}.ptbo-route-map path{fill:none;stroke-width:7;stroke-linecap:round;opacity:.78}.ptbo-route-map .road{stroke:#64748b;stroke-width:13;opacity:.33}.ptbo-route-map .player{stroke:#2563eb}.ptbo-route-map .recommended{stroke:#22c55e}.ptbo-route-map .hospital-player{stroke:#f97316}.ptbo-route-map .hospital-recommended{stroke:#c084fc}.ptbo-route-map .marker{position:absolute;width:20px;height:20px;display:grid;place-items:center;border:2px solid white;border-radius:50%;color:#fff;font-size:8px}.ptbo-route-map .start{left:3%;bottom:8%;background:#0f172a}.ptbo-route-map .call{left:35%;top:27%;background:#dc2626}.ptbo-route-map .hospital{right:4%;top:43%;background:#f97316}.ptbo-route-legend{display:grid;align-content:center;gap:7px;padding:8px;border:1px solid #ffffff20;border-radius:11px;background:#09111f}.ptbo-route-legend span{display:flex;align-items:center;color:#cbd5e1;font-size:8px;font-weight:750}.ptbo-route-legend i{width:21px;height:4px;flex:0 0 auto;margin-right:6px;border-radius:9px}.ptbo-route-legend .blue{background:#2563eb}.ptbo-route-legend .green{background:#22c55e}.ptbo-route-legend .orange{background:#f97316}.ptbo-route-legend .purple{background:#c084fc}
      .ptbo-tutorial-footer{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:13px clamp(18px,4vw,28px) calc(13px + env(safe-area-inset-bottom));border-top:1px solid #ffffff16;background:#0309128a}.ptbo-tutorial-count{justify-self:center;color:#94a3b8;font-size:10px;font-weight:850}.ptbo-tutorial-actions{display:flex;gap:7px}.ptbo-tutorial-button{min-height:40px;padding:0 14px;color:#fff;border:1px solid #ffffff30;border-radius:10px;background:#233247;font:850 11px system-ui;cursor:pointer;touch-action:manipulation}.ptbo-tutorial-button.primary{color:#111827;border-color:#fde047;background:#facc15}.ptbo-tutorial-button.skip{padding:0;border:0;background:transparent;color:#94a3b8}.ptbo-tutorial-button:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px}.ptbo-tutorial-button:active{transform:scale(.97)}
      .ptbo-live-labels{display:none;position:fixed;left:8px;right:8px;bottom:calc(184px + env(safe-area-inset-bottom));z-index:2147483590;grid-template-columns:1fr auto 1fr;gap:6px;pointer-events:none}.ptbo-live-labels span{padding:7px 8px;color:#fff;border:1px solid #7dd3fc6b;border-radius:999px;background:#075985f2;box-shadow:0 5px 15px #0007;font-size:8px;font-weight:900;text-align:center}.ptbo-live-labels span:nth-child(2){background:#334155f2}.ptbo-live-labels span:last-child{background:#991b1bf2}
      html.ptbo-tutorial-open.ptbo-tutorial-stage-bases .mobile-topbar,html.ptbo-tutorial-open.ptbo-tutorial-stage-bases .station-shortcuts,html.ptbo-tutorial-open.ptbo-tutorial-stage-bases .desktop-action{z-index:2147483591!important;pointer-events:none!important;filter:drop-shadow(0 0 9px #38bdf8)}
      html.ptbo-tutorial-open.ptbo-tutorial-stage-driving .mobile-controls{z-index:2147483591!important;pointer-events:none!important;filter:drop-shadow(0 0 12px #38bdf8)}
      @media(max-width:600px){#ptbo-quick-tutorial{place-items:end center;padding:0}.ptbo-tutorial-card{width:100%;max-height:82dvh;border-width:1px 0 0;border-radius:22px 22px 0 0}.ptbo-tutorial-main{padding:18px 18px 16px}.ptbo-tutorial-copy{margin-top:12px;font-size:12px;line-height:1.42}.ptbo-tutorial-visual{margin-top:13px}.ptbo-tutorial-footer{grid-template-columns:auto 1fr;padding:10px 14px calc(10px + env(safe-area-inset-bottom))}.ptbo-tutorial-count{display:none}.ptbo-tutorial-actions{justify-self:end}.ptbo-demo-choice{grid-template-columns:auto 1fr}.ptbo-demo-choice b{display:none}.ptbo-keyboard kbd{width:43px}.ptbo-route-example{grid-template-columns:1fr}.ptbo-route-map{min-height:104px}.ptbo-route-legend{grid-template-columns:1fr 1fr}.ptbo-response-flows>div{gap:4px;overflow:hidden}.ptbo-response-flows span{padding:4px 5px;font-size:8px}html.ptbo-tutorial-stage-driving #ptbo-quick-tutorial{place-items:start center;padding:calc(66px + env(safe-area-inset-top)) 10px calc(204px + env(safe-area-inset-bottom))}html.ptbo-tutorial-stage-driving .ptbo-tutorial-card{width:min(460px,100%);max-height:calc(100dvh - 276px);border:1px solid #ffffff30;border-radius:17px}html.ptbo-tutorial-stage-driving .ptbo-tutorial-main{padding:15px 17px 12px}html.ptbo-tutorial-stage-driving .ptbo-tutorial-icon{width:40px;height:40px}html.ptbo-tutorial-stage-driving .ptbo-tutorial-copy{margin-top:9px}html.ptbo-tutorial-stage-driving .ptbo-tutorial-visual{display:none}html.ptbo-tutorial-stage-driving .ptbo-tutorial-footer{padding:8px 12px}.ptbo-live-labels.show{display:grid}}
      @media(max-width:380px){.ptbo-demo-dispatch{grid-template-columns:minmax(0,1fr) 80px;padding:10px}.ptbo-demo-dispatch-main strong{font-size:12px}.ptbo-demo-clock b{font-size:16px}.ptbo-demo-tools span{font-size:7px}.ptbo-live-labels{bottom:calc(177px + env(safe-area-inset-bottom))}.ptbo-live-labels span{padding:6px 4px;font-size:7px}}
      @media(max-height:520px) and (orientation:landscape){#ptbo-quick-tutorial{padding:7px}.ptbo-tutorial-card{width:min(760px,100%);max-height:calc(100dvh - 14px);border:1px solid #ffffff30;border-radius:16px}.ptbo-tutorial-main{padding:13px 17px}.ptbo-tutorial-heading{gap:10px}.ptbo-tutorial-icon{width:38px;height:38px}.ptbo-tutorial-card h2{font-size:20px}.ptbo-tutorial-copy{margin-top:8px;font-size:11px}.ptbo-tutorial-visual{margin-top:9px}.ptbo-tutorial-footer{padding:7px 14px}.ptbo-demo-surface{padding:8px}.ptbo-route-map{min-height:90px}html.ptbo-tutorial-stage-driving #ptbo-quick-tutorial{place-items:start center;padding:7px 44vw 150px 7px}html.ptbo-tutorial-stage-driving .ptbo-tutorial-card{width:100%;max-height:calc(100dvh - 157px)}.ptbo-live-labels{left:auto;width:52vw;bottom:143px}}
      @media(prefers-reduced-motion:reduce){.ptbo-tutorial-progress span{transition:none}}
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
    overlay.innerHTML = `<div class="ptbo-tutorial-card">
      <div class="ptbo-tutorial-accent"></div><div class="ptbo-tutorial-progress"><span></span></div>
      <div class="ptbo-tutorial-main"><div class="ptbo-tutorial-heading"><div class="ptbo-tutorial-icon"></div><div><div class="ptbo-tutorial-eyebrow"></div><h2 id="ptbo-tutorial-title"></h2></div></div><p class="ptbo-tutorial-copy"></p><div class="ptbo-tutorial-visual"></div></div>
      <div class="ptbo-tutorial-footer"><button class="ptbo-tutorial-button skip" type="button" data-tutorial="skip">Skip</button><span class="ptbo-tutorial-count" aria-live="polite"></span><div class="ptbo-tutorial-actions"><button class="ptbo-tutorial-button" type="button" data-tutorial="back">Back</button><button class="ptbo-tutorial-button primary" type="button" data-tutorial="next">Next</button></div></div>
    </div><div class="ptbo-live-labels"><span>Point + hold<br>Steer & drive</span><span>Lights<br>Recenter</span><span>Gear + Down<br>Reverse</span></div>`;
    overlay.addEventListener('click', event => {
      const action = event.target.closest?.('[data-tutorial]')?.dataset.tutorial;
      if (action === 'skip') close(true);
      if (action === 'back') previous();
      if (action === 'next') next();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
      if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button:not([hidden]):not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    doc.body.appendChild(overlay);
    return overlay;
  }

  function setStage(stage) {
    const root = hostDocument().documentElement;
    STAGE_CLASSES.forEach(name => root.classList.remove(`ptbo-tutorial-stage-${name}`));
    root.classList.add(`ptbo-tutorial-stage-${stage}`);
  }

  function clearStage() {
    const root = hostDocument().documentElement;
    STAGE_CLASSES.forEach(name => root.classList.remove(`ptbo-tutorial-stage-${name}`));
  }

  function render() {
    const overlay = installOverlay();
    const step = state.steps[state.step];
    if (!step) return;
    setStage(step.stage);
    overlay.querySelector('.ptbo-tutorial-icon').innerHTML = step.icon;
    overlay.querySelector('.ptbo-tutorial-eyebrow').textContent = step.eyebrow;
    overlay.querySelector('#ptbo-tutorial-title').textContent = step.title;
    overlay.querySelector('.ptbo-tutorial-copy').textContent = step.copy;
    overlay.querySelector('.ptbo-tutorial-visual').innerHTML = step.visual;
    overlay.querySelector('.ptbo-tutorial-progress span').style.width = `${((state.step + 1) / state.steps.length) * 100}%`;
    overlay.querySelector('.ptbo-tutorial-count').textContent = `${state.step + 1} of ${state.steps.length}`;
    overlay.querySelector('.ptbo-live-labels').classList.toggle('show', step.stage === 'driving' && isMobile());
    const back = overlay.querySelector('[data-tutorial="back"]');
    const nextButton = overlay.querySelector('[data-tutorial="next"]');
    back.hidden = state.step === 0;
    nextButton.textContent = state.step === state.steps.length - 1 ? (cityInfo().baseTraining ? 'Explore' : 'Start Driving') : 'Next';
    overlay.querySelector('.ptbo-tutorial-main').scrollTop = 0;
    nextButton.focus();
  }

  function open({ force = false } = {}) {
    if (state.open) return true;
    if (!force) {
      try { if (localStorage.getItem(STORAGE_KEY) === '1') return false; } catch (_) {}
      if (!window.PTBO_SERVICE?.state?.selected) return false;
    }
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
    clearStage();
    state.open = false;
    if (markSeen) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
    }
    try { state.lastFocus?.focus?.(); } catch (_) {}
    state.lastFocus = null;
  }

  function next() {
    if (!state.open) return;
    if (state.step >= state.steps.length - 1) { close(true); return; }
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
    button.textContent = 'Replay Visual Tutorial';
    button.style.borderColor = '#38bdf8';
    button.addEventListener('click', () => {
      if (!document.getElementById('control-panel')?.classList.contains('minimized')) window.togglePanel?.();
      setTimeout(() => open({ force: true }), 180);
    });
    const subtitle = panel.querySelector('.subtitle');
    if (subtitle) subtitle.insertAdjacentElement('afterend', button); else panel.prepend(button);
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

  window.PTBO_QUICK_TUTORIAL = Object.freeze({version:VERSION,state,open,close,next,previous,buildSteps});
  window.addEventListener('ptbo-service-change', autoStart);
  [0, 250, 800, 1800, 4000].forEach(delay => setTimeout(autoStart, delay));
})();
