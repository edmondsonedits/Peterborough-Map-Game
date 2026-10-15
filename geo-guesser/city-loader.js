/* Both game and editor use the same selected-city catalog and stores. */
(() => {
  'use strict';
  window.PTBO_GEO_CITY_READY=window.PTBO_CITY_LOCATION_RUNTIME.load({context:'geo'});
  window.PTBO_GEO_CITY_READY.catch(()=>{});
})();
