/* Homepage interaction layer. Gameplay, service selection and city data stay in their existing modules. */
(() => {
  'use strict';
  if (window.PTBO_HOMEPAGE) return;

  const CITY_KEY = 'ptboSelectedCity';
  const MOTION_KEY = 'ptboHomepageMotion';
  const MODES = Object.freeze({ geo: 'Geo Guesser', route: 'Route Mapping', dispatch: 'Dispatch Simulator', explorer: 'Explore 3D' });
  let state = null;

  const read = key => { try { return localStorage.getItem(key); } catch (_) { return undefined; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };

  function init({ cities = [] } = {}) {
    if (state) { sync(); return true; }
    if (document.body?.dataset.homepage !== 'cinematic') return false;
    const select = document.getElementById('home-city-select');
    const dispatchLink = document.getElementById('dispatch-game-link');
    const cityMap = new Map(cities.filter(city => city?.id && city.name).map(city => [city.id, city]));
    if (!select || !dispatchLink || !cityMap.has('peterborough')) return false;
    select.textContent = '';
    cityMap.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = `${city.name}, ON`;
      select.appendChild(option);
    });

    let media = null;
    try { media = window.matchMedia?.('(prefers-reduced-motion: reduce)'); } catch (_) {}
    state = {
      select, dispatchLink, cityMap, media,
      city: null, preview: 'geo', manualMotionOff: read(MOTION_KEY) === 'off',
      status: document.getElementById('home-city-status'),
      motionButton: document.getElementById('home-motion-toggle'),
      choices: [...document.querySelectorAll('[data-preview]')],
      panels: [...document.querySelectorAll('[data-preview-panel]')],
      launches: [...document.querySelectorAll('[data-preview-launch]')],
      cards: [...document.querySelectorAll('[data-demo-card]')],
      explorerLink: document.getElementById('city-explorer-link'),
      dialog: document.getElementById('home-demo-dialog'),
      requestCity: document.getElementById('home-demo-city'),
      requestMode: document.getElementById('home-demo-mode'),
      requestStatus: document.getElementById('home-demo-status'),
      requestButton: document.getElementById('home-demo-submit'),
      request: null, pendingRequests: new Map(),
    };

    select.addEventListener('change', event => {
      if (!cityMap.has(select.value)) { select.value = state.city.id; return; }
      setCity(select.value, true);
      // Preserve the existing city-select analytics without counting restores or synthetic events.
      if (event.isTrusted) {
        try {
          const analytics = window.PTBO_SITE_ANALYTICS;
          if (analytics?.trackingAllowed?.() !== false) {
            analytics?.recordCity?.(state.city.id)?.catch?.(() => {});
          }
        } catch (_) { /* Analytics must never interrupt choosing a city. */ }
      }
    });
    state.choices.forEach(link => {
      const preview = () => showPreview(link.dataset.preview);
      link.addEventListener('mouseenter', preview);
      link.addEventListener('focus', preview);
    });
    // Ready modes have real links before any interaction, preserving modified clicks.
    // Unavailable modes are keyboard reachable actions without a redirect destination.
    [...state.choices, ...state.launches, state.explorerLink].filter(Boolean).forEach(link => {
      link.addEventListener('pointerdown', updateLinks);
      link.addEventListener('click', event => {
        const mode = modeForLink(link);
        if (available(mode)) { updateLinks(); return; }
        event.preventDefault();
        openRequest(mode, link);
      });
      link.addEventListener('keydown', event => {
        if (available(modeForLink(link)) || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openRequest(modeForLink(link), link);
      });
    });
    document.getElementById('home-demo-close')?.addEventListener('click', closeRequest);
    state.requestButton?.addEventListener('click', submitRequest);
    document.getElementById('home-demo-conversation')?.addEventListener('click', openRequestConversation);
    window.addEventListener('ptbo-feedback-account-change', event => {
      if (event.detail?.replaced) state.pendingRequests.clear();
      renderRequest();
    });
    state.dialog?.addEventListener('cancel', event => { event.preventDefault(); closeRequest(); });
    state.dialog?.addEventListener('close', () => {
      if(state.dialog.open)return; // An earlier close event may arrive after a new showModal().
      const opener = state.request?.opener;
      state.request = null;
      opener?.focus();
    });
    state.dialog?.addEventListener('click', event => {
      if (event.target !== state.dialog) return;
      const rect = state.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeRequest();
    });
    state.motionButton?.addEventListener('click', () => {
      if (state.media?.matches) return;
      state.manualMotionOff = !state.manualMotionOff;
      write(MOTION_KEY, state.manualMotionOff ? 'off' : 'on');
      syncMotion();
    });
    document.addEventListener('visibilitychange', syncMotion);
    if (media?.addEventListener) media.addEventListener('change', syncMotion);
    else media?.addListener?.(syncMotion);
    window.addEventListener('pageshow', sync);
    window.addEventListener('storage', event => {
      if (event.key === CITY_KEY && cityMap.has(event.newValue)) setCity(event.newValue, false);
      if (event.key === MOTION_KEY) {
        state.manualMotionOff = event.newValue === 'off';
        syncMotion();
      }
    });

    const requested = String(new URLSearchParams(location.search).get('city') || '').toLowerCase();
    const stored = read(CITY_KEY);
    const preferred = cityMap.has(requested) ? requested : cityMap.has(stored) ? stored : 'peterborough';
    setCity(preferred, cityMap.has(requested));
    syncMotion();
    return true;
  }

  function setCity(id, persist) {
    const city = state.cityMap.get(id);
    if (!city) return;
    const changed = state.city?.id !== city.id;
    state.city = city;
    state.select.value = city.id;
    document.body.dataset.homeCity = city.id;
    const fullDispatch = city.id === 'peterborough';
    const freeDriving = !fullDispatch && available('dispatch');
    document.body.dataset.homeAvailability = fullDispatch ? 'full' : 'demo';
    if (persist) write(CITY_KEY, city.id);
    document.querySelectorAll('[data-selected-city-name]').forEach(node => { node.textContent = city.name; });
    document.querySelectorAll('[data-dispatch-city]').forEach(node => { node.textContent = city.name; });
    document.querySelectorAll('[data-preview-city-name]').forEach(node => { node.textContent = city.name; });
    document.querySelectorAll('[data-peterborough-only]').forEach(node => { node.hidden = true; });
    document.querySelectorAll('[data-demo-label]').forEach(node => { node.hidden = fullDispatch; });
    state.cards.forEach(card => { card.dataset.homeDemo = String(!fullDispatch); });
    const title = document.getElementById('home-dispatch-title');
    const description = document.getElementById('home-dispatch-description');
    if (title) title.textContent = freeDriving ? 'Free Driving' : 'Dispatch Simulator';
    if (description) description.textContent = fullDispatch
      ? 'Drive Fire & EMS responses.'
      : freeDriving ? `Drive Fire & EMS in ${city.name}.` : `Request a ${city.name} driving demo.`;
    document.querySelectorAll('[data-dispatch-mode-label]').forEach(node => {
      node.textContent = freeDriving ? 'Free Driving' : 'Dispatch Simulator';
    });
    document.querySelectorAll('[data-dispatch-preview-title]').forEach(node => {
      node.textContent = freeDriving ? 'Get to know the streets.' : 'Take the next call.';
    });
    document.querySelectorAll('[data-dispatch-preview-description]').forEach(node => {
      node.textContent = fullDispatch
        ? 'Choose Fire or EMS and practise your response.'
        : freeDriving ? 'Choose Fire or EMS for free driving.' : 'Request this training mode for your city.';
    });
    state.launches.filter(link => link.dataset.previewLaunch === 'dispatch').forEach(link => {
      const label = link.querySelector('[data-launch-label]');
      if (label) label.textContent = freeDriving ? 'Start free driving' : available('dispatch') ? 'Play Dispatch Simulator' : 'Request a demo';
    });
    const explorerDescription = document.getElementById('home-explorer-description');
    if (explorerDescription) explorerDescription.textContent = available('explorer') ? `Drive through ${city.name} streets.` : `Request a ${city.name} 3D demo.`;
    if (state.status) state.status.textContent = fullDispatch
      ? 'All training modes available in Peterborough.'
      : `${city.name} demos · ${available('geo') ? 'Geo Guesser ready' : 'Geo Guesser on request'}${available('route') ? ' · Route Mapping ready' : ''}${freeDriving ? ' · Free driving ready' : ''}. Request other modes below.`;
    updateLinks();
    if (changed) {
      // A background storage update must not hide the preview link someone is using.
      const focusedPanel = state.panels.find(panel => panel.contains(document.activeElement));
      showPreview(focusedPanel?.dataset.previewPanel || (available('geo') ? 'geo' : freeDriving ? 'dispatch' : 'geo'));
    }
  }

  function updateLinks() {
    if (!state?.city) return;
    const mobile = window.PTBO_DEVICE_SURFACE?.isMobile?.() === true;
    const version = window.PTBO_BUILD?.version || document.documentElement?.dataset.ptboBuild;
    const editor=document.getElementById('dispatch-editor-link');
    if(editor){
      const editorCity=state.city;
      const url=new URL('dispatch-editor/',location.href);url.searchParams.set('city',editorCity.id);
      if(version)url.searchParams.set('v',version);editor.href=url.href;
      editor.setAttribute('aria-label',`Open ${editorCity.name} Dispatch Editor`);
      const label=document.getElementById('home-editor-name'),description=document.getElementById('home-editor-description');
      if(label)label.textContent='Dispatch Editor';
      if(description)description.textContent=`Edit ${editorCity.name} locations.`;
    }
    const routes = {
      geo: `geo-guesser/${mobile ? 'mobile' : 'desktop'}/`,
      route: 'route-mapping/',
      dispatch: mobile ? state.city.dispatch?.mobile : state.city.dispatch?.desktop,
      explorer: 'city-explorer/?release=v1.5.6&accuracy=district1',
    };
    [...state.choices, ...state.launches, state.explorerLink].filter(Boolean).forEach(link => {
      const mode = modeForLink(link);
      const ready = available(mode) && Boolean(routes[mode]);
      link.dataset.modeAvailable = String(ready);
      link.setAttribute('aria-label', ready
        ? mode === 'dispatch' && state.city.id !== 'peterborough' ? `Open Fire & EMS free driving in ${state.city.name}` : `Open ${state.city.name} ${MODES[mode]}`
        : `Request a ${state.city.name} ${MODES[mode]} demo`);
      if (ready) {
        const url = new URL(routes[mode], location.href);
        url.searchParams.set('city', state.city.id);
        if (version) url.searchParams.set('v', version);
        if (mode === 'dispatch') {
          url.searchParams.set('surface', mobile ? 'mobile' : 'desktop');
          url.searchParams.set('fresh', String(Date.now()));
        }
        link.href = url.href;
        ['role', 'tabindex', 'aria-haspopup', 'aria-controls'].forEach(name => link.removeAttribute(name));
      } else {
        link.removeAttribute('href');
        link.setAttribute('role', 'button');
        link.setAttribute('tabindex', '0');
        link.setAttribute('aria-haspopup', 'dialog');
        link.setAttribute('aria-controls', 'home-demo-dialog');
      }
      if (mode !== 'dispatch' && link.dataset.previewLaunch) {
        const label = link.querySelector('[data-launch-label]');
        if (label) label.textContent = ready ? `Play ${MODES[mode]}` : 'Request a demo';
      }
    });
  }

  function modeForLink(link) { return link.dataset.preview || link.dataset.previewLaunch || 'explorer'; }
  function available(mode) { return state?.city?.modes?.[mode] === true; }

  function openRequest(mode, opener) {
    if (!MODES[mode] || !state.dialog || state.dialog.open) return;
    // Keep the requested city fixed even if another tab changes the selected city.
    state.request = { cityId: state.city.id, cityName: state.city.name, mode, opener };
    state.requestCity.textContent = state.request.cityName;
    state.requestMode.textContent = MODES[mode];
    renderRequest();
    state.dialog.showModal();
  }

  function closeRequest() {
    const opener=state.request?.opener;
    state.request=null;state.dialog?.close();opener?.focus();
  }

  function renderRequest(message = '') {
    const request = state.request;
    if (!request) return;
    const key = `${request.cityId}:${request.mode}`;
    const sent = window.PTBO_DEMO_REQUESTS?.requestStatus?.(request.cityId, request.mode)?.remoteSaved === true;
    const pending = state.pendingRequests.has(key);
    state.requestStatus.textContent = sent
      ? 'Request sent to the developer. You can follow up in Feedback.'
      : pending ? 'Sending your request…' : message;
    state.requestButton.disabled = sent || pending;
    state.requestButton.textContent = sent ? 'Request sent' : pending ? 'Sending…' : message ? 'Try again' : 'Request this demo';
    const conversation = document.getElementById('home-demo-conversation');
    if (conversation) conversation.hidden = !sent;
  }

  async function submitRequest() {
    const request = state.request;
    if (!request) return;
    const key = `${request.cityId}:${request.mode}`;
    const adapter = window.PTBO_DEMO_REQUESTS;
    if (adapter?.requestStatus?.(request.cityId, request.mode)?.remoteSaved || state.pendingRequests.has(key)) return;
    const operation = {};
    state.pendingRequests.set(key, operation);
    renderRequest();
    let saved = false;
    try { saved = await adapter?.recordDemoRequest?.(request.cityId, request.mode) === true; } catch (_) {}
    if (state.pendingRequests.get(key) !== operation) return;
    state.pendingRequests.delete(key);
    if (state.request?.cityId === request.cityId && state.request?.mode === request.mode)
      renderRequest(saved ? '' : 'Your request could not be sent. Please try again.');
  }

  async function openRequestConversation() {
    const request = state.request;
    if (!request) return;
    closeRequest();
    try { await window.PTBO_DEMO_REQUESTS.openConversation(request.cityId, request.mode); }
    catch (_) { openRequest(request.mode, request.opener); renderRequest('Could not open Feedback. Please try again.'); }
  }

  function showPreview(mode) {
    if (!state || !state.panels.some(panel => panel.dataset.previewPanel === mode)) return;
    state.preview = mode;
    state.choices.forEach(link => { link.classList.toggle('is-active', link.dataset.preview === mode); });
    state.panels.forEach(panel => {
      const active = panel.dataset.previewPanel === mode;
      panel.hidden = !active;
      panel.inert = !active;
      if (active) panel.removeAttribute('inert');
      else panel.setAttribute('inert', '');
    });
    const preview = document.getElementById('home-preview');
    if (preview) preview.dataset.activePreview = mode;
  }

  function syncMotion() {
    if (!state) return;
    const reduced = state.media?.matches === true;
    const paused = reduced || state.manualMotionOff || document.hidden;
    document.body.dataset.homeMotion = paused ? 'off' : 'on';
    const button = state.motionButton;
    if (button) {
      button.setAttribute('aria-pressed', paused ? 'true' : 'false');
      button.setAttribute('aria-label', reduced ? 'Motion paused by your device preference' : paused ? 'Enable motion' : 'Pause motion');
      button.disabled = reduced;
      const label = button.querySelector('[data-motion-label]');
      if (label) label.textContent = paused ? 'Motion off' : 'Motion on';
    }
  }

  function sync() {
    if (!state) return;
    // A restored page may have missed storage events while it was in the back/forward cache.
    const storedCity = read(CITY_KEY);
    if (state.cityMap.has(storedCity) && storedCity !== state.city.id) setCity(storedCity, false);
    const storedMotion = read(MOTION_KEY);
    if (storedMotion !== undefined) state.manualMotionOff = storedMotion === 'off';
    updateLinks();
    syncMotion();
  }

  window.PTBO_HOMEPAGE = Object.freeze({ init, sync });
})();
