/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"burlington","name":"Burlington","map":{"bounds":[[43.26801300112401,-79.95928964637378],[43.47654603016583,-79.63034733192568]],"defaultCenter":[43.33113882611392,-79.81819737571415],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"burlington-joseph-brant","name":"Joseph Brant Hospital","addr":"1245 Lakeshore Road, Burlington, ON L7S 0A2","lat":43.3167,"lng":-79.80331,"radius":40,"sourceUrl":"https://www.josephbranthospital.ca/areas-of-care/emergency-department","coordinateSourceUrl":"https://www.openstreetmap.org/way/438279844","coordinateMethod":"osm-hospital-feature-point; exact primary-source geometry not independently checked","trainingArrivalKind":"sourced-site-point"}};
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
