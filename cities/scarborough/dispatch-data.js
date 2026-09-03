/* Scarborough empty dispatch-data descriptor for base-training preview. */
(() => {
  'use strict';
  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  window.PTBO_CITY_DISPATCH_SOURCE = Object.freeze({
    cityId:'scarborough',
    version:'preview-1',
    url:new URL('../empty-dispatch.js?v=1.6.7', sourceUrl).href,
  });
})();
