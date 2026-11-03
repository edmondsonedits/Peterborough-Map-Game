/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"hamilton","name":"Hamilton","map":{"bounds":[[43.05051496130627,-80.24857873056794],[43.47070652259478,-79.58213581808178]],"defaultCenter":[43.25708912544889,-79.86618024180544],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"hamilton-call-01","name":"Hamilton General Hospital","addr":"237 Barton Street East, Hamilton, ON L8L 2X2","lat":43.26194349155009,"lng":-79.85433493263145,"radius":40,"sourceUrl":"https://www.hamiltonhealthsciences.ca/areas-of-care/emergency-care/emergency-departments/","coordinateSourceUrl":"https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Hospitals/FeatureServer/14/query?objectIds=4&outFields=%2A&outSR=4326&f=json","coordinateMethod":"canonical-official-facility-point","trainingArrivalKind":"sourced-site-point"}};
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
