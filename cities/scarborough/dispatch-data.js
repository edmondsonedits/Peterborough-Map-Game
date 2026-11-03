/* Canonical Scarborough locations; scenario assignments live in training-data.json. */
(() => {
  'use strict';
  const source=new URL(document.currentScript?.src||location.href,location.href);
  window.PTBO_CITY_DISPATCH_SOURCE=Object.freeze({cityId:"scarborough",version:"1.6.8",available:true,url:source.href});
  if(window.PTBO_DISPATCH_DATA_READY)return;
  window.PTBO_DISPATCH_DATA_READY=fetch(new URL('./geo-data.json',source).href,{cache:'force-cache'}).then(async response=>{
    if(!response.ok)throw Error('City dispatch locations could not load.');
    const data=await response.json();
    if(data.id!=="scarborough"||!Array.isArray(data.locations))throw Error('City dispatch locations are invalid.');
    window.PTBO_DISPATCH_DATA_VERSION=data.dispatchDataVersion||"1.6.8";return data.locations;
  });
})();
