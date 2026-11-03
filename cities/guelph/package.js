/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"guelph","name":"Guelph","map":{"bounds":[[43.47383021580297,-80.32691267333436],[43.594361533143115,-80.15350481534446]],"defaultCenter":[43.5435157,-80.243612],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"guelph-call-03","name":"Guelph General Hospital","addr":"115 Delhi Street, Guelph, ON N1E 4J4","lat":43.5560508,"lng":-80.2534481,"radius":40,"sourceUrl":"https://gghorg.ca/patients-visitors/emergency-department/","coordinateSourceUrl":"https://gismaps.guelph.ca/hosting/rest/services/OpenData/OpenData1/FeatureServer/0/query?objectIds=10340&outFields=%2A&outSR=4326&f=pjson","coordinateMethod":"canonical-official-facility-point","trainingArrivalKind":"sourced-site-point"}};
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
