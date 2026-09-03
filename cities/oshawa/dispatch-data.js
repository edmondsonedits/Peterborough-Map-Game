/* Oshawa empty dispatch-data descriptor for base-training preview. */
(() => {
  'use strict';
  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  window.PTBO_CITY_DISPATCH_SOURCE = Object.freeze({
    cityId:'oshawa',
    version:'1.6.8',
    available:false,
    url:new URL('../empty-dispatch.js?v=1.6.8', sourceUrl).href,
  });
})();
