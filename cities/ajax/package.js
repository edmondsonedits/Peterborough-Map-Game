/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"ajax","name":"Ajax","map":{"bounds":[[43.548364587676005,-79.08813331174792],[43.92240514955695,-78.86023960978459]],"defaultCenter":[43.84540501890784,-79.02694560796613],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"ajax-call-01","name":"Lakeridge Health Ajax Pickering Hospital","addr":"580 Harwood Avenue South, Ajax, ON L1S 2J4","lat":43.836896936989,"lng":-79.01708479805743,"radius":40,"sourceUrl":"https://www.lh.ca/our-services/emergency-and-urgent-care/","coordinateSourceUrl":"https://ajaxmaps.ajax.ca/gisernie/rest/services/Public/Ajax_On_The_Map/FeatureServer/2/query?objectIds=932&outFields=*&outSR=4326&f=pjson","coordinateMethod":"canonical-official-facility-point","trainingArrivalKind":"sourced-site-point"}};
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
