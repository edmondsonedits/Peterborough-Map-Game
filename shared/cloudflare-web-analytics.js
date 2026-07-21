(() => {
  'use strict';

  // Cloudflare Web Analytics site token. This is public client configuration,
  // not a private API key. Paste the token issued for edmondsonedits.github.io.
  const SITE_TOKEN = '';
  const APP_VERSION = '1.4.20';

  if (window.top !== window.self || window.__PTBO_CLOUDFLARE_ANALYTICS__) return;
  window.__PTBO_CLOUDFLARE_ANALYTICS__ = true;

  if (!SITE_TOKEN) {
    console.info(`Cloudflare Web Analytics v${APP_VERSION} is installed and waiting for its site token.`);
    return;
  }

  const beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({
    token: SITE_TOKEN,
    spa: false
  }));
  beacon.dataset.ptboAnalyticsVersion = APP_VERSION;
  document.head.appendChild(beacon);
})();
