/* Peterborough dispatch-data descriptor. The compressed production payload remains
   one shared asset for compatibility, but the city package now owns its version
   and source reference so the generic store can swap datasets by city. */
(() => {
  'use strict';
  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  window.PTBO_CITY_DISPATCH_SOURCE = Object.freeze({
    cityId:'peterborough',
    version:'1.4.20',
    url:new URL('../../shared/dispatch-data-1.4.4.js', sourceUrl).href,
  });
})();
