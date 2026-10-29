/* Richmond Hill's canonical civic seed; training-data.json supplies curated local exercises. */
(() => {
  'use strict';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  window.PTBO_CITY_DISPATCH_SOURCE=Object.freeze({cityId:'richmond-hill',version:'ontario-geo-1',available:true,url:sourceUrl.href});
  window.PTBO_DISPATCH_DATA_VERSION='ontario-geo-1';
  if(window.PTBO_DISPATCH_DATA_READY)return;
  window.PTBO_DISPATCH_DATA_READY=fetch(new URL('./geo-data.json',sourceUrl).href,{cache:'force-cache'}).then(async response=>{
    if(!response.ok)throw new Error('Richmond Hill dispatch locations could not load.');
    const geo=await response.json();
    if(geo?.schemaVersion!==1||geo.id!=='richmond-hill'||!Array.isArray(geo.locations))throw new Error('Richmond Hill dispatch locations are invalid.');
    return geo.locations;
  });
})();
