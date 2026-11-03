/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  const sourceUrl=new URL(document.currentScript.src,location.href);
  window.PTBO_PREVIEW_CITY_FACTORY.create({...{"id":"oshawa","name":"Oshawa","map":{"bounds":[[43.6009699037119,-78.95857818124192],[44.0474236775095,-78.69666526240337]],"defaultCenter":[43.8971,-78.8658],"defaultZoom":15,"minZoom":10,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"oshawa-lakeridge-oshawa","name":"Lakeridge Health Oshawa Hospital","addr":"1 Hospital Court, Oshawa, ON L1G 2B9","lat":43.9055,"lng":-78.86921,"radius":40,"sourceUrl":"https://www.lh.ca/our-services/emergency-and-urgent-care/","coordinateSourceUrl":"https://www.openstreetmap.org/way/475350569","coordinateMethod":"osm-hospital-feature-point; exact primary-source geometry not independently checked","trainingArrivalKind":"sourced-site-point"}},sourceUrl});
})();
