(() => {
  'use strict';

  if (window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP) return;
  window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP = true;

  const sourceUrl = new URL(document.currentScript.src, document.baseURI);
  const loadScript = (filename, version, onload) => {
    const script = document.createElement('script');
    script.src = new URL(`${filename}?v=${version}`, sourceUrl).href;
    script.onload = onload;
    script.onerror = () => console.error(`Unable to load ${filename}.`);
    document.body.appendChild(script);
  };

  loadScript('vehicle-instruments-core.js', '20260719-directional-core-1', () => {
    loadScript('directional-steering-tuning.js', '20260719-hold-heading-2');
  });
})();