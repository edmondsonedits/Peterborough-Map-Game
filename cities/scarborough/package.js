/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  const sourceUrl=new URL(document.currentScript.src,location.href);
  window.PTBO_PREVIEW_CITY_FACTORY.create({...{"id":"scarborough","name":"Scarborough","map":{"defaultCenter":[43.7764,-79.2318],"defaultZoom":14,"minZoom":10,"maxZoom":19,"bounds":[[43.67,-79.34],[43.86,-79.11]]},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"scarborough-odhf-4ae2d5164afc6dbb62b9434405e0a78a","name":"Scarborough Health Network Birchmount Hospital","addr":"3030 Birchmount Road, Scarborough, ON M1W 3W3","lat":43.8017150145943,"lng":-79.3080119730392,"radius":40,"sourceUrl":"https://www.shn.ca/hospitals/birchmount-hospital/","coordinateSourceUrl":"https://www150.statcan.gc.ca/n1/pub/13-26-0001/2020001/zip/odhf_v2_geojson.zip","coordinateMethod":"canonical-location-site-point","trainingArrivalKind":"sourced-site-point"}},sourceUrl});
})();
