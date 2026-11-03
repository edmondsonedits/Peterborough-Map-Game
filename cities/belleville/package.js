/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  const sourceUrl=new URL(document.currentScript.src,location.href);
  window.PTBO_PREVIEW_CITY_FACTORY.create({...{"id":"belleville","name":"Belleville","map":{"defaultCenter":[44.1628,-77.3832],"defaultZoom":15,"minZoom":10,"maxZoom":19,"bounds":[[44.08,-77.5],[44.35,-77.23]]},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"belleville-odhf-aa401eef18302f500152ebc3d776895f","name":"Belleville General Hospital","addr":"265 Dundas Street East, Belleville, ON K8N 5A9","lat":44.1637039655893,"lng":-77.3649057785832,"radius":40,"sourceUrl":"https://quintehealth.ca/care-service/emergency-department/","coordinateSourceUrl":"https://www150.statcan.gc.ca/n1/pub/13-26-0001/2020001/zip/odhf_v2_geojson.zip","coordinateMethod":"canonical-location-site-point","trainingArrivalKind":"sourced-site-point"}},sourceUrl});
})();
