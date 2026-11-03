/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"thunder-bay","name":"Thunder Bay","map":{"bounds":[[48.26835354064214,-89.42757863595611],[48.51500506527655,-89.06077480177011]],"defaultCenter":[48.38867738806357,-89.25080703242487],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"thunder-bay-odhf-938205b435c2590e9d76059416356f15","name":"Thunder Bay Regional Health Sciences Centre","addr":"984 Oliver Road, Thunder Bay, ON P7B 6V4","lat":48.421780760666,"lng":-89.2676604716029,"radius":40,"sourceUrl":"https://tbrhsc.net/programs-services/emergency-critical-care-services/","coordinateSourceUrl":"https://www150.statcan.gc.ca/n1/pub/13-26-0001/2020001/zip/odhf_v2_geojson.zip","coordinateMethod":"canonical-hospital-site-point","trainingArrivalKind":"sourced-site-point"}};
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
