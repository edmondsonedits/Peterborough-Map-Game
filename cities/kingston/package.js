/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"kingston","name":"Kingston","map":{"bounds":[[44.16052099827343,-76.71278388218718],[44.48015286878591,-76.23417972205655]],"defaultCenter":[44.3197869168625,-76.50204335478855],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"kingston-call-02","name":"Kingston General Hospital (Kingston Health Sciences Centre)","addr":"76 Stuart Street, Kingston, ON K7L 2V7","lat":44.22369718630111,"lng":-76.4933952421073,"radius":40,"sourceUrl":"https://www.kingstonhsc.ca/emergency-care","coordinateSourceUrl":"https://services1.arcgis.com/5GRYvurYYUwAecLQ/arcgis/rest/services/Hospitals/FeatureServer/69/query?where=OBJECTID%3D27479&outFields=%2A&outSR=4326&f=pjson","coordinateMethod":"canonical-hospital-site-point","trainingArrivalKind":"sourced-site-point"}};
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
