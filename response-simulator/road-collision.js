(() => {
  'use strict';

  if (window.PTBO_ROAD_COLLISION_BOOTSTRAP) return;
  window.PTBO_ROAD_COLLISION_BOOTSTRAP = true;

  const sourceUrl = new URL(document.currentScript.src, document.baseURI);
  const loadScript = (filename, version, onload) => {
    const script = document.createElement('script');
    script.src = new URL(`${filename}?v=${version}`, sourceUrl).href;
    script.onload = onload;
    script.onerror = () => console.error(`Unable to load ${filename}.`);
    document.body.appendChild(script);
  };

  loadScript('road-collision-core.js', '20260719-road-core-1', () => {
    loadScript('road-intersection-softener.js', '20260719-rounded-intersections-1');
  });

  loadScript('dispatch-voice-bridge-1.4.2.js', '1.4.2');
  loadScript('route-compare-1.4.2.js', '1.4.2');
})();
