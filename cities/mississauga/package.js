/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"mississauga","name":"Mississauga","map":{"bounds":[[43.361099429953754,-79.81010111417292],[43.73703438782441,-79.41785747084073]],"defaultCenter":[43.69232288253442,-79.62549081534043],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"mississauga-odhf-ac3b24f6bd6309a1a3db9518940d932f","name":"Trillium Health Partners, Mississauga Hospital","addr":"100 Queensway West, Mississauga, ON L5B 1B8","lat":43.5722475603248,"lng":-79.6096203489638,"radius":40,"sourceUrl":"https://www.trilliumhealthpartners.ca/patientservices/emergency","coordinateSourceUrl":"https://www150.statcan.gc.ca/n1/pub/13-26-0001/2020001/zip/odhf_v2_geojson.zip","coordinateMethod":"canonical-hospital-site-point","trainingArrivalKind":"sourced-site-point"}};
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
