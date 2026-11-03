/* Stable City Explorer release marker. Release identity comes only from shared/build-version.js. */
(() => {
  'use strict';
  const VERSION = window.PTBO_BUILD?.version;
  if (!VERSION) { console.error('City Explorer release marker requires shared/build-version.js first.'); return; }
  const validStationNumbers = ['1', '2', '3'];
  const params = new URLSearchParams(location.search);
  const activeStation = validStationNumbers.includes(params.get('station')) ? params.get('station') : '1';

  window.PTBO_CITY_EXPLORER_BUILD = Object.freeze({ version: VERSION, label: `v${VERSION}` });
  window.PTBO_SELECTED_FIRE_STATION = Number(activeStation);
  document.documentElement.dataset.cityExplorerBuild = VERSION;
  document.documentElement.dataset.fireStation = activeStation;
  document.title = document.title.replace(/v\d+\.\d+\.\d+/i, `v${VERSION}`);

  const syncBadge = () => {
    const badge = document.getElementById('ptbo-build-badge');
    if (!badge) return false;
    badge.textContent = `v${VERSION}`;
    badge.dataset.cityExplorerBuild = VERSION;
    badge.setAttribute('aria-label', `City Explorer version ${VERSION}`);
    return true;
  };

  const installStationSelector = () => {
    const panel = document.querySelector('.control-panel');
    if (!panel) return false;
    if (document.getElementById('station-select')) return true;

    const select = document.createElement('select');
    select.id = 'station-select';
    select.className = 'hud-button';
    select.setAttribute('aria-label', 'Fire station');
    select.title = 'Move to another fire station';
    select.disabled = true;
    select.setAttribute('aria-busy', 'true');
    for (const number of validStationNumbers) {
      const option = document.createElement('option');
      option.value = number;
      option.textContent = `Station ${number}`;
      option.selected = number === activeStation;
      select.append(option);
    }
    const status = document.createElement('span');
    status.id = 'station-select-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Gameplay is loading.';

    const gameplay = () => globalThis.__PTBO_GAMEPLAY__ || window.__PTBO_GAMEPLAY__;
    const canSwitch = api => {
      if (typeof api?.switchStation !== 'function' || typeof api?.state !== 'function') return false;
      try { return api.state()?.canSwitchStations !== false; } catch { return false; }
    };
    const actualStation = api => {
      try {
        const station = Number(api?.state?.()?.stationNumber);
        return validStationNumbers.includes(String(station)) ? String(station) : activeStation;
      } catch { return activeStation; }
    };
    const reflectStation = station => {
      select.value = station;
      window.PTBO_SELECTED_FIRE_STATION = Number(station);
      document.documentElement.dataset.fireStation = station;
      const hint = document.querySelector('#mode-hint strong');
      if (hint && /^(Loading )?Fire Station \d+\.?$/.test(hint.textContent.trim())) hint.textContent = `Fire Station ${station}`;
      const road = document.getElementById('gameplay-road');
      if (road && /^Fire Station \d+$/.test(road.textContent.trim())) road.textContent = `Fire Station ${station}`;
    };
    let latestChange = 0;
    const ready = () => {
      const api = gameplay();
      if (!canSwitch(api)) return false;
      reflectStation(actualStation(api));
      select.disabled = false;
      select.setAttribute('aria-busy', 'false');
      status.textContent = '';
      if (readyPoll) window.clearInterval(readyPoll);
      return true;
    };
    const displayError = error => error instanceof Error ? error.message : String(error || 'Station switch failed');
    select.addEventListener('change', () => {
      const changeId = ++latestChange;
      const api = gameplay();
      const next = select.value;
      if (!validStationNumbers.includes(next) || !canSwitch(api)) {
        reflectStation(actualStation(api));
        select.disabled = true;
        select.setAttribute('aria-busy', 'false');
        status.textContent = 'Gameplay is not ready.';
        return;
      }
      select.setAttribute('aria-busy', 'true');
      status.textContent = `Loading Station ${next}…`;
      let switching;
      try { switching = api.switchStation(Number(next)); }
      catch (error) { switching = Promise.reject(error); }
      Promise.resolve(switching).then(result => {
        if (changeId !== latestChange) return;
        reflectStation(actualStation(api));
        select.disabled = false;
        select.setAttribute('aria-busy', 'false');
        status.textContent = result?.ok === false ? displayError(result.error || result.status?.error) : '';
      }, error => {
        if (changeId !== latestChange) return;
        reflectStation(actualStation(api));
        select.disabled = false;
        select.setAttribute('aria-busy', 'false');
        status.textContent = displayError(error);
      });
    });

    const playButton = document.getElementById('play-mode');
    if (playButton?.nextSibling) panel.insertBefore(select, playButton.nextSibling);
    else panel.append(select);
    panel.append(status);

    const hint = document.querySelector('#mode-hint strong');
    if (hint?.textContent?.startsWith('Loading Fire Station')) hint.textContent = `Loading Fire Station ${activeStation}.`;
    const road = document.getElementById('gameplay-road');
    if (road?.textContent?.startsWith('Fire Station')) road.textContent = `Fire Station ${activeStation}`;
    window.addEventListener('ptbo:gameplay-ready', ready);
    const readyPoll = window.setInterval ? window.setInterval(ready, 100) : 0;
    ready();
    return true;
  };

  if (!syncBadge() || !installStationSelector()) {
    const observer = new MutationObserver(() => {
      const badgeReady = syncBadge();
      const selectorReady = installStationSelector();
      if (badgeReady && selectorReady) observer.disconnect();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 5000);
  }
})();
