/* Lightweight city index. Heavy roads/calls are loaded only after a city is chosen. */
(() => {
  'use strict';
  const dispatchRoutes={desktop:'response-simulator/play/',mobile:'response-simulator/mobile/'};
  const baseTrainingRoutes={desktop:'response-simulator/base-training/',mobile:'response-simulator/base-training/'};
  const cities = [
    { id:'peterborough', name:'Peterborough', province:'Ontario', status:'playable', playable:true,
      note:'Full dispatch available', packageUrl:'cities/peterborough/city.json', dispatch:dispatchRoutes },
    { id:'oshawa', name:'Oshawa', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/oshawa/city.json', dispatch:baseTrainingRoutes },
    { id:'belleville', name:'Belleville', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/belleville/city.json', dispatch:baseTrainingRoutes },
    { id:'scarborough', name:'Scarborough', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/scarborough/city.json', dispatch:baseTrainingRoutes },
    { id:'pickering', name:'Pickering', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/pickering/city.json', dispatch:baseTrainingRoutes },
    { id:'markham', name:'Markham', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/markham/city.json', dispatch:baseTrainingRoutes },
    { id:'toronto', name:'Toronto', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/toronto/city.json', dispatch:baseTrainingRoutes },
  ];
  window.PTBO_CITIES = Object.freeze(cities.map(city => Object.freeze({ ...city, dispatch: Object.freeze({...city.dispatch}) })));
})();
