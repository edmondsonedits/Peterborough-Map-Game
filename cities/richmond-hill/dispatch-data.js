/* Canonical Richmond Hill demo locations; modeled response profiles stay in training-data.json. */
(() => {
  'use strict';
  const source = new URL(document.currentScript?.src || location.href, location.href);
  window.PTBO_CITY_DISPATCH_SOURCE = Object.freeze({cityId:'richmond-hill',version:'ontario-geo-1',available:true,url:source.href});
  if (window.PTBO_DISPATCH_DATA_READY) return;
  window.PTBO_DISPATCH_DATA_READY = fetch(new URL('./geo-data.json', source).href, {cache:'force-cache'}).then(async response => {
    if (!response.ok) throw new Error('Richmond Hill dispatch locations could not load.');
    const data = await response.json();
    if (data.id !== 'richmond-hill' || !Array.isArray(data.locations)) throw new Error('Richmond Hill dispatch locations are invalid.');
    window.PTBO_DISPATCH_DATA_VERSION = data.dispatchDataVersion || 'ontario-geo-1';
    return data.locations;
  });
})();
