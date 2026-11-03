/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"markham","name":"Markham","map":{"bounds":[[43.79803520873777,-79.4287925145521],[43.96257754689307,-79.170274133742]],"defaultCenter":[43.8561,-79.337],"defaultZoom":15,"minZoom":10,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"markham-call-07","name":"Markham Stouffville Hospital","addr":"381 Church Street, Markham, ON L3P 7P3","lat":43.88385600494087,"lng":-79.2314903638149,"radius":40,"sourceUrl":"https://www.oakvalleyhealth.ca/clinics-departments/emergency-department/","coordinateSourceUrl":"https://ww3.yorkmaps.ca/arcgis/rest/services/YorkLocators_Pro/YorkRegionAddressesPlus_WGS84/GeocodeServer/findAddressCandidates?SingleLine=381+Church+Street%2C+Markham&outFields=%2A&outSR=4326&f=pjson","coordinateMethod":"canonical-official-address-geocode","trainingArrivalKind":"sourced-site-point"}};
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
