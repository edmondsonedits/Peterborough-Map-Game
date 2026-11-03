/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"oshawa","name":"Oshawa","map":{"bounds":[[43.6009699037119,-78.95857818124192],[44.0474236775095,-78.69666526240337]],"defaultCenter":[43.8971,-78.8658],"defaultZoom":15,"minZoom":10,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"oshawa-lakeridge-oshawa","name":"Lakeridge Health Oshawa Hospital","addr":"1 Hospital Court, Oshawa, ON L1G 2B9","lat":43.9055,"lng":-78.86921,"radius":40,"sourceUrl":"https://www.lh.ca/our-services/emergency-and-urgent-care/","coordinateSourceUrl":"https://www.openstreetmap.org/way/475350569","coordinateMethod":"osm-hospital-feature-point; exact primary-source geometry not independently checked","trainingArrivalKind":"sourced-site-point"}};
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
