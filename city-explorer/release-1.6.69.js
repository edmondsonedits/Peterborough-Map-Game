/* City Explorer release marker — v1.6.76 */
(() => {
  'use strict';
  const VERSION = '1.6.76';
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
    select.setAttribute('aria-label', 'Starting fire station');
    select.title = 'Choose where the firefighter and truck start';
    for (const number of validStationNumbers) {
      const option = document.createElement('option');
      option.value = number;
      option.textContent = `Station ${number}`;
      option.selected = number === activeStation;
      select.append(option);
    }
    select.addEventListener('change', () => {
      const next = validStationNumbers.includes(select.value) ? select.value : '1';
      const url = new URL(location.href);
      url.searchParams.set('station', next);
      url.searchParams.set('release', `v${VERSION}`);
      location.assign(url);
    });

    const playButton = document.getElementById('play-mode');
    if (playButton?.nextSibling) panel.insertBefore(select, playButton.nextSibling);
    else panel.append(select);

    const hint = document.querySelector('#mode-hint strong');
    if (hint?.textContent?.startsWith('Loading Fire Station')) hint.textContent = `Loading Fire Station ${activeStation}.`;
    const road = document.getElementById('gameplay-road');
    if (road?.textContent?.startsWith('Fire Station')) road.textContent = `Fire Station ${activeStation}`;
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
