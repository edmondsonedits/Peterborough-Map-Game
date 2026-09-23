/* Compatibility bridge for historical numbered release bootstrap URLs. */
(() => {
  'use strict';

  const scriptUrl = document.currentScript?.src || new URL('legacy-release-forwarder.js', location.href).href;
  const baseUrl = new URL('./', scriptUrl);

  function loadScript(id, src) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') {
          resolve(existing);
          return;
        }
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once:true });
        return;
      }

      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.onload = () => {
        script.dataset.ptboLoaded = 'true';
        resolve(script);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`Unable to load ${src}`));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function forwardToCurrentRelease() {
    if (!window.PTBO_BUILD?.version) {
      await loadScript(
        'ptbo-legacy-build-version',
        new URL('build-version.js?legacy=current', baseUrl).href,
      );
    }

    const version = window.PTBO_BUILD?.version;
    if (!version) throw new Error('Canonical production build did not initialize.');

    if (window.PTBO_RELEASE?.version === version) return;
    await loadScript(
      'ptbo-legacy-current-release',
      new URL(`release-bootstrap.js?v=${version}`, baseUrl).href,
    );
  }

  forwardToCurrentRelease().catch((error) => {
    console.error('Legacy release compatibility bridge failed.', error);
  });
})();
