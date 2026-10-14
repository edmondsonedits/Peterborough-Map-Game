/* Homepage interaction layer. Gameplay, service selection and city data stay in their existing modules. */
(() => {
  'use strict';
  if (window.PTBO_HOMEPAGE) return;

  const CITY_KEY = 'ptboSelectedCity';
  const MOTION_KEY = 'ptboHomepageMotion';
  let state = null;

  const read = key => { try { return localStorage.getItem(key); } catch (_) { return undefined; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };

  function init({ cities = [] } = {}) {
    if (state) { sync(); return true; }
    if (document.body?.dataset.homepage !== 'cinematic') return false;
    const select = document.getElementById('home-city-select');
    const dispatchLink = document.getElementById('dispatch-game-link');
    const cityMap = new Map(cities.filter(city => city?.id && city.name && city.dispatch?.desktop && city.dispatch?.mobile).map(city => [city.id, city]));
    if (!select || !dispatchLink || !cityMap.has('peterborough')) return false;

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
    // The href itself is correct before interaction, including open-in-new-tab and modified clicks.
    // Refresh only the launch timestamp when a link is used; native navigation remains untouched.
    [dispatchLink, ...state.launches.filter(link => link.dataset.previewLaunch === 'dispatch')].forEach(link => {
      link.addEventListener('pointerdown', updateLinks);
      link.addEventListener('click', updateLinks);
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
    document.body.dataset.homeAvailability = fullDispatch ? 'full' : 'free-driving';
    if (persist) write(CITY_KEY, city.id);
    document.querySelectorAll('[data-selected-city-name]').forEach(node => { node.textContent = city.name; });
    document.querySelectorAll('[data-dispatch-city]').forEach(node => { node.textContent = city.name; });
    document.querySelectorAll('[data-peterborough-only]').forEach(node => { node.hidden = fullDispatch; });
    const title = document.getElementById('home-dispatch-title');
    const description = document.getElementById('home-dispatch-description');
    if (title) title.textContent = fullDispatch ? 'Dispatch Simulator' : 'Free Driving';
    if (description) description.textContent = fullDispatch
      ? 'Drive Fire & EMS responses.'
      : `Drive Fire & EMS in ${city.name}.`;
    document.querySelectorAll('[data-dispatch-mode-label]').forEach(node => {
      node.textContent = fullDispatch ? 'Dispatch Simulator' : 'Free Driving';
    });
    document.querySelectorAll('[data-dispatch-preview-title]').forEach(node => {
      node.textContent = fullDispatch ? 'Take the next call.' : 'Get to know the streets.';
    });
    document.querySelectorAll('[data-dispatch-preview-description]').forEach(node => {
      node.textContent = fullDispatch
        ? 'Choose Fire or EMS and practise your response.'
        : 'Choose Fire or EMS for free driving. Dispatch calls are in Peterborough.';
    });
    state.launches.filter(link => link.dataset.previewLaunch === 'dispatch').forEach(link => {
      const label = link.querySelector('[data-launch-label]');
      if (label) label.textContent = fullDispatch ? 'Play Dispatch Simulator' : 'Start free driving';
    });
    if (state.status) state.status.textContent = fullDispatch
      ? 'All training modes available in Peterborough.'
      : `Free driving in ${city.name}. Geo Guesser, Route Mapping, dispatch calls & 3D remain in Peterborough.`;
    updateLinks();
    if (changed) {
      // A background storage update must not hide the preview link someone is using.
      const focusedPanel = state.panels.find(panel => panel.contains(document.activeElement));
      showPreview(focusedPanel?.dataset.previewPanel || (fullDispatch ? 'geo' : 'dispatch'));
    }
  }

  function updateLinks() {
    if (!state?.city) return;
    const mobile = window.PTBO_DEVICE_SURFACE?.isMobile?.() === true;
    const route = mobile ? state.city.dispatch.mobile : state.city.dispatch.desktop;
    const url = new URL(route, location.href);
    url.searchParams.set('city', state.city.id);
    const version = window.PTBO_BUILD?.version || document.documentElement?.dataset.ptboBuild;
    if (version) url.searchParams.set('v', version);
    url.searchParams.set('surface', mobile ? 'mobile' : 'desktop');
    url.searchParams.set('fresh', String(Date.now()));
    state.dispatchLink.href = url.href;
    const label = state.city.id === 'peterborough'
      ? `Open ${state.city.name} Dispatch Simulator`
      : `Open Fire & EMS free driving in ${state.city.name}`;
    state.dispatchLink.setAttribute('aria-label', label);
    state.launches.forEach(link => {
      const source = state.choices.find(choice => choice.dataset.preview === link.dataset.previewLaunch);
      if (source) link.href = source.href;
      if (link.dataset.previewLaunch === 'dispatch') link.setAttribute('aria-label', label);
    });
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
