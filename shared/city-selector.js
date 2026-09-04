/* Dispatch launcher city selector. Preview cities can be used for Fire/EMS base training while calls are built. */
(() => {
  'use strict';
  const VERSION = '1.6.10';
  if (window.PTBO_CITY_SELECTOR?.version === VERSION) return;

  const dispatchLink = document.getElementById('dispatch-game-link');
  const cities = window.PTBO_CITIES || [];
  if (!dispatchLink || !cities.length) return;

  const touchMobile = window.innerWidth <= 900 && (
    matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || navigator.userAgentData?.mobile === true || 'ontouchstart' in window
  );

  const style = document.createElement('style');
  style.id = 'ptbo-city-selector-style';
  style.textContent = `
    #ptbo-city-dialog{box-sizing:border-box;width:min(680px,calc(100vw - 28px));max-height:calc(100dvh - 30px);overflow:auto;margin:auto;padding:26px;border:1px solid rgba(255,255,255,.18);border-radius:22px;background:rgba(10,20,36,.98);color:#f8fafc;box-shadow:0 28px 100px rgba(0,0,0,.62);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #ptbo-city-dialog::backdrop{background:rgba(2,8,18,.72);backdrop-filter:blur(4px)}
    #ptbo-city-dialog .city-kicker{margin:0 0 6px;color:#7dd3fc;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    #ptbo-city-dialog h2{margin:0;font-size:clamp(25px,5vw,34px);letter-spacing:-.035em}
    #ptbo-city-dialog .city-intro{margin:8px 0 20px;color:#cbd5e1;font-size:14px;line-height:1.5}
    #ptbo-city-dialog .city-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #ptbo-city-dialog .city-option{min-height:104px;padding:15px;text-align:left;border:1px solid rgba(255,255,255,.18);border-radius:15px;background:linear-gradient(145deg,#20334d,#172538);color:#f8fafc;font:inherit;cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
    #ptbo-city-dialog .city-option:hover{transform:translateY(-2px);border-color:#7dd3fc;background:linear-gradient(145deg,#284461,#1a2d44)}
    #ptbo-city-dialog .city-option:focus-visible,#ptbo-city-dialog .city-close:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px}
    #ptbo-city-dialog .city-option strong{display:block;font-size:18px;margin-bottom:3px}
    #ptbo-city-dialog .city-option .province{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    #ptbo-city-dialog .city-option .status{display:block;margin-top:11px;color:#86efac;font-size:12px;font-weight:800}
    #ptbo-city-dialog .city-option[data-status="base-training"] .status{color:#fde68a}
    #ptbo-city-dialog .city-foot{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.11)}
    #ptbo-city-dialog .city-foot span{color:#94a3b8;font-size:12px;line-height:1.4}
    #ptbo-city-dialog .city-close{flex:0 0 auto;padding:9px 14px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:#243246;color:#f8fafc;font:inherit;font-weight:800;cursor:pointer}
    @media(max-width:520px){#ptbo-city-dialog{padding:20px}#ptbo-city-dialog .city-grid{grid-template-columns:1fr}#ptbo-city-dialog .city-option{min-height:88px}#ptbo-city-dialog .city-foot{align-items:flex-start;flex-direction:column-reverse}.city-close{width:100%}}
  `;
  document.head.appendChild(style);

  const dialog = document.createElement('dialog');
  dialog.id = 'ptbo-city-dialog';
  dialog.setAttribute('aria-labelledby','ptbo-city-title');
  dialog.innerHTML = `
    <p class="city-kicker">Emergency Response Simulator</p>
    <h2 id="ptbo-city-title">Choose a city</h2>
    <p class="city-intro">Peterborough includes full dispatch calls. The other cities currently include Fire and EMS base spawning with free-driving practice while their call databases and road-boundary packages are being built.</p>
    <div class="city-grid"></div>
    <div class="city-foot"><span>“Calls unavailable” cities are still playable for station/base familiarization and driving practice.</span><button class="city-close" type="button">Cancel</button></div>`;

  const grid = dialog.querySelector('.city-grid');
  cities.forEach(city => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-option';
    button.dataset.city = city.id;
    button.dataset.status = city.status || '';
    button.setAttribute('aria-label', `Open ${city.name} ${city.status==='base-training'?'base training':'Dispatch Simulator'}`);
    button.innerHTML = `<strong>${city.name}</strong><span class="province">${city.province || ''}</span><span class="status">${city.note || 'Available'}</span>`;
    button.addEventListener('click', () => launch(city));
    grid.appendChild(button);
  });

  function launch(city) {
    const route = touchMobile ? city.dispatch?.mobile : city.dispatch?.desktop;
    if (!route) return;
    try { localStorage.setItem('ptboSelectedCity', city.id); } catch (_) {}
    dialog.close();
    const url = new URL(route, location.href);
    url.searchParams.set('city', city.id);
    url.searchParams.set('v', VERSION);
    url.searchParams.set('fresh', String(Date.now()));
    location.href = url.href;
  }

  dialog.querySelector('.city-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.body.appendChild(dialog);

  document.addEventListener('click', event => {
    const link = event.target.closest?.('#dispatch-game-link');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!dialog.open) dialog.showModal();
  }, true);

  window.PTBO_CITY_SELECTOR = Object.freeze({version: VERSION,open: () => { if (!dialog.open) dialog.showModal(); },cities});
})();