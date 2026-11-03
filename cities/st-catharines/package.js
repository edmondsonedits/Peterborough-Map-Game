/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"st-catharines","name":"St. Catharines","map":{"bounds":[[43.10667039328994,-79.32093332328418],[43.44759965664617,-79.17783387431142]],"defaultCenter":[43.163031150051,-79.239771514153],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"st-catharines-call-01","name":"Marotta Family Hospital (Niagara Health St. Catharines Site)","addr":"1200 Fourth Avenue, St. Catharines, ON L2S 0A9","lat":43.153176969024,"lng":-79.278105753908,"radius":40,"sourceUrl":"https://www.niagarahealth.on.ca/site/when-to-visit-an-emergency-department","coordinateSourceUrl":"https://utility.arcgis.com/usrsvcs/servers/21332341b9364d05bf276dd4a9c68d30/rest/services/General/STC_Address_Locator/GeocodeServer/findAddressCandidates?SingleLine=1200+Fourth+Avenue&outFields=%2A&outSR=4326&f=json","coordinateMethod":"canonical-official-address-geocode","trainingArrivalKind":"sourced-site-point"}};
  const start=()=>window.PTBO_PREVIEW_CITY_FACTORY.create({...config,sourceUrl});
  if(window.PTBO_PREVIEW_CITY_FACTORY?.version===VERSION){start();return;}
  const factoryUrl=new URL('../preview-package-factory.js?v='+CACHE_VERSION,sourceUrl).href;
  if(document.readyState==='loading'&&typeof document.write==='function'){
    // The inserted external script runs after this script returns. Queue its
    // initializer after it so following parser scripts see the city package.
    const payload=JSON.stringify({...config,sourceUrl:sourceUrl.href}).replace(/</g,'\\u003c');
    document.write('<script src="'+factoryUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"><'+'/script>'+
      '<script>window.PTBO_PREVIEW_CITY_FACTORY.create('+payload+');<'+'/script>');
    return;
  }
  const script=document.createElement('script');script.src=factoryUrl;script.onload=start;script.onerror=()=>console.error('Unable to load base-training city package factory.');document.head.appendChild(script);
})();
