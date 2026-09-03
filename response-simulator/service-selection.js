/* Wrapper Fire/EMS chooser. City-specific service data is provided by the active
   package inside the simulator iframe. */
(() => {
  'use strict';
  let dialog = null;
  function ready(game) {
    if (game.PTBO_SATELLITE_MAP_READY) return game.PTBO_SATELLITE_MAP_READY.catch(() => {});
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        game.removeEventListener('ptbo-satellite-map-ready',finish);
        game.removeEventListener('ptbo-satellite-map-error',finish);
        resolve();
      };
      const timer = setTimeout(finish,12000);
      game.addEventListener('ptbo-satellite-map-ready',finish,{once:true});
      game.addEventListener('ptbo-satellite-map-error',finish,{once:true});
    });
  }
  function open(game) {
    if (dialog?.open || game.PTBO_SERVICE?.state.selected) return;
    if (!game.PTBO_SERVICE) throw new Error('Fire / EMS controls did not load.');
    const cityName = game.PTBO_CITY_PACKAGE?.name || window.PTBO_CITY_PACKAGE?.name || 'Selected City';
    const style = document.createElement('style');
    style.textContent = `
      #service-choice{box-sizing:border-box;width:min(600px,calc(100vw - 28px));max-height:calc(100dvh - 32px);overflow:auto;margin:auto;padding:28px;border:1px solid #ffffff2b;border-radius:22px;background:#101b2bf5;color:#f8fafc;box-shadow:0 28px 100px #0009;font-family:Inter,system-ui,sans-serif}
      #service-choice::backdrop{background:#030b1859;backdrop-filter:blur(2px)}
      #service-choice h1{font-size:clamp(24px,5vw,32px);margin:5px 0 10px;letter-spacing:-.035em}
      #service-choice p{color:#cbd5e1;line-height:1.5;margin:0 0 22px;font-size:14px}
      #service-choice .service-eyebrow{color:#8eacc9;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
      #service-choice .service-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      #service-choice button{min-height:148px;padding:20px;text-align:left;border:1px solid #ffffff30;border-radius:16px;color:#fff;background:#213248;font:inherit;cursor:pointer;touch-action:manipulation}
      #service-choice button[data-service=fire]{background:linear-gradient(140deg,#5b2630,#251c2c)}
      #service-choice button[data-service=ems]{background:linear-gradient(140deg,#164b66,#142737)}
      #service-choice button:focus-visible{outline:3px solid #facc15;outline-offset:3px}
      #service-choice button:hover{border-color:#ffffffa0}
      #service-choice button strong{display:block;font-size:26px;margin:8px 0}
      #service-choice button span{display:block;color:#e2e8f0;font-size:12px;line-height:1.55}
      #service-choice .service-footnote{margin:20px 0 0;font-size:12px;color:#9eb1c5}
      .station-button[hidden]{display:none!important}
      html[data-service=ems] .station-button.active{border-color:#38bdf8;background:#075985}
      @media(max-width:380px){#service-choice{padding:20px}#service-choice button{padding:14px}}
      @media(max-height:420px){#service-choice{padding:18px}#service-choice button{min-height:100px;padding:12px}#service-choice p{margin-bottom:10px}#service-choice .service-footnote{margin-top:10px}}
    `;
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.id = 'service-choice';
    dialog.setAttribute('aria-labelledby','service-choice-title');
    dialog.setAttribute('aria-describedby','service-choice-description');
    dialog.innerHTML = `<div class="service-eyebrow">${cityName} Dispatch Simulator</div>
      <h1 id="service-choice-title">Choose your service</h1>
      <p id="service-choice-description">Your vehicle. Your base. Your next call.</p>
      <div class="service-choices">
        <button type="button" data-service="fire" aria-label="Fire"><strong>Fire</strong><span>Fire truck · ${game.PTBO_BASE_STORE?.getBases('fire').length || game.PTBO_SERVICE.getBases?.().length || 0} stations<br>Respond to the scene</span></button>
        <button type="button" data-service="ems" aria-label="EMS"><strong>EMS</strong><span>Ambulance · ${game.PTBO_BASE_STORE?.getBases('ems').length || 0} bases<br>Scene → hospital</span></button>
      </div><p class="service-footnote">You can change services in Options at any time.</p>`;
    dialog.addEventListener('cancel',event => event.preventDefault());
    dialog.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click',() => {
      if (!game.PTBO_SERVICE.select(button.dataset.service)) return;
      dialog.close();
      dialog.remove();
      document.getElementById('simulator')?.focus();
    }));
    document.body.appendChild(dialog);
    dialog.showModal();
  }
  window.PTBO_SERVICE_SELECTION = Object.freeze({open,ready});
})();
