/* City Explorer release marker — v1.6.73 */
(() => {
  'use strict';
  const VERSION = '1.6.73';
  window.PTBO_CITY_EXPLORER_BUILD = Object.freeze({ version: VERSION, label: `v${VERSION}` });
  document.documentElement.dataset.cityExplorerBuild = VERSION;
  document.title = document.title.replace(/v\d+\.\d+\.\d+/i, `v${VERSION}`);

  const syncBadge = () => {
    const badge = document.getElementById('ptbo-build-badge');
    if (!badge) return false;
    badge.textContent = `v${VERSION}`;
    badge.dataset.cityExplorerBuild = VERSION;
    badge.setAttribute('aria-label', `City Explorer version ${VERSION}`);
    return true;
  };

  if (!syncBadge()) {
    const observer = new MutationObserver(() => {
      if (syncBadge()) observer.disconnect();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 5000);
  }
})();
