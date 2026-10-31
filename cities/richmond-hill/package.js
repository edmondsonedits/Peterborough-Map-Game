/* Richmond Hill response demo uses its existing canonical calls, bases and hospital site. */
(() => {
  const sourceUrl = new URL(document.currentScript.src, location.href);
  window.PTBO_PREVIEW_CITY_FACTORY.create({ ...{"id":"richmond-hill","name":"Richmond Hill","map":{"bounds":[[43.829270412593175,-79.48559824366056],[43.97754774129366,-79.3714957973409]],"defaultCenter":[43.867171820603346,-79.44249767296054],"defaultZoom":18,"minZoom":7,"maxZoom":19},"canonicalRoster":true,"sceneResponseDrills":true,"routeGuidance":true,"hospitalLocationId":"richmond-hill-call-10","sources":{}}, sourceUrl });
})();
