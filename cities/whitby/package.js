/* Shared Dispatch demo with canonical city data and a sourced hospital site. */
(() => {
  const sourceUrl=new URL(document.currentScript.src,location.href);
  window.PTBO_PREVIEW_CITY_FACTORY.create({...{"id":"whitby","name":"Whitby","map":{"bounds":[[43.571073994601214,-79.04728690796199],[44.02890937043863,-78.77584288535326]],"defaultCenter":[43.92188290782409,-78.9391260286899],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"sources":{},"hospitalSite":{"id":"oshawa-lakeridge-oshawa","name":"Lakeridge Health Oshawa Hospital","addr":"1 Hospital Court, Oshawa, ON L1G 2B9","lat":43.9055,"lng":-78.86921,"radius":40,"sourceUrl":"https://www.lh.ca/our-services/emergency-and-urgent-care/","coordinateSourceUrl":"https://www.openstreetmap.org/way/475350569","coordinateMethod":"osm-hospital-feature-point; exact primary-source geometry not independently checked","trainingArrivalKind":"sourced-site-point"}},sourceUrl});
})();
