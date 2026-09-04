/* Lightweight city index. Every city uses the same response-simulator UI and driving runtime. */
(() => {
  'use strict';
  const simulatorRoutes = Object.freeze({
    desktop:'response-simulator/play/',
    mobile:'response-simulator/mobile/',
  });
  const cities = [
    { id:'peterborough', name:'Peterborough', province:'Ontario', status:'playable', playable:true,
      note:'Full dispatch available', packageUrl:'cities/peterborough/city.json', dispatch:simulatorRoutes },
    { id:'oshawa', name:'Oshawa', province:'Ontario', status:'base-training', playable:true,
      note:'Peterborough controls · Calls unavailable', packageUrl:'cities/oshawa/city.json', dispatch:simulatorRoutes },
    { id:'belleville', name:'Belleville', province:'Ontario', status:'base-training', playable:true,
      note:'Peterborough controls · Calls unavailable', packageUrl:'cities/belleville/city.json', dispatch:simulatorRoutes },
    { id:'scarborough', name:'Scarborough', province:'Ontario', status:'base-training', playable:true,
      note:'Peterborough controls · Calls unavailable', packageUrl:'cities/scarborough/city.json', dispatch:simulatorRoutes },
    { id:'pickering', name:'Pickering', province:'Ontario', status:'base-training', playable:true,
      note:'Peterborough controls · Calls unavailable', packageUrl:'cities/pickering/city.json', dispatch:simulatorRoutes },
    { id:'markham', name:'Markham', province:'Ontario', status:'base-training', playable:true,
      note:'Peterborough controls · Calls unavailable', packageUrl:'cities/markham/city.json', dispatch:simulatorRoutes },
    { id:'toronto', name:'Toronto', province:'Ontario', status:'base-training', playable:true,
      note:'Peterborough controls · Calls unavailable', packageUrl:'cities/toronto/city.json', dispatch:simulatorRoutes },
  ];
  window.PTBO_CITIES = Object.freeze(cities.map(city => Object.freeze({ ...city, dispatch: simulatorRoutes })));
})();
