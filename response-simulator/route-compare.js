(() => {
  'use strict';

  const VERSION = '1.6.69';
  const current = document.currentScript;
  const base = current?.src || document.baseURI;

  function load(filename, marker, errorMessage) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = new URL(`${filename}?v=${VERSION}`, base).href;
    script.setAttribute(marker, VERSION);
    script.onerror = () => console.error(errorMessage);
    document.body.appendChild(script);
  }

  load('route-compare-1.4.2.js', 'data-ptbo-route-compare-core', 'Unable to load the stable post-call route comparison system.');
  load('route-review-ui-1.4.3.js', 'data-ptbo-route-review-ui', 'Unable to load the polished post-call route review interface.');
})();