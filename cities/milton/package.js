/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"milton","name":"Milton","map":{"bounds":[[43.41728321670602,-80.1611422232313],[43.62895564788874,-79.7248216817283]],"defaultCenter":[43.52601331966486,-79.88986174439137],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"milton-district-hospital","name":"Milton District Hospital","addr":"725 Bronte Street South, Milton, ON L9T 9K1","lat":43.49713,"lng":-79.86846,"radius":40,"sourceUrl":"https://www.haltonhealthcare.on.ca/site_Files/Content/pdfs/01_Services/02_Emergency-Department/MDH/MDH---Emergency-Department-Directions.pdf","coordinateSourceUrl":"https://www.openstreetmap.org/way/712100615","coordinateMethod":"osm-hospital-feature-point; exact primary-source geometry not independently checked","trainingArrivalKind":"sourced-site-point"}};
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
