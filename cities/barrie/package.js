/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src||location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v')||VERSION;
  const config={"id":"barrie","name":"Barrie","map":{"bounds":[[44.29368978018843,-79.75851847130781],[44.45002421043758,-79.585910211136]],"defaultCenter":[44.38577426192153,-79.6964919501417],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"barrie-call-01","name":"Royal Victoria Regional Health Centre","addr":"201 Georgian Drive, Barrie, ON L4M 6M2","lat":44.41441634017788,"lng":-79.66118223059493,"radius":40,"sourceUrl":"https://www.rvh.on.ca/areas-of-care/emergency-services/","coordinateSourceUrl":"https://gispublic.barrie.ca/arcgis/rest/services/Public/OperationalLayers_Dynamic/MapServer/12/query?where=OBJECTID%3D10&outFields=%2A&outSR=4326&f=pjson","coordinateMethod":"canonical-official-facility-point","trainingArrivalKind":"sourced-site-point"}};
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
