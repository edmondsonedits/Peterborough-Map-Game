/* Lightweight city index. Heavy roads/calls are loaded only after a city is chosen. */
(() => {
  'use strict';
  const routes={ desktop:'response-simulator/play/', mobile:'response-simulator/mobile/' };
  const cities = [
    { id:'peterborough', name:'Peterborough', province:'Ontario', status:'playable', playable:true,
      note:'Full dispatch available', packageUrl:'cities/peterborough/city.json', dispatch:routes },
    { id:'oshawa', name:'Oshawa', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/oshawa/city.json', dispatch:routes },
    { id:'belleville', name:'Belleville', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/belleville/city.json', dispatch:routes },
    { id:'scarborough', name:'Scarborough', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/scarborough/city.json', dispatch:routes },
    { id:'pickering', name:'Pickering', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/pickering/city.json', dispatch:routes },
    { id:'markham', name:'Markham', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/markham/city.json', dispatch:routes },
    { id:'toronto', name:'Toronto', province:'Ontario', status:'base-training', playable:true,
      note:'Base training · Calls unavailable', packageUrl:'cities/toronto/city.json', dispatch:routes },
  ];
  window.PTBO_CITIES = Object.freeze(cities.map(city => Object.freeze({ ...city, dispatch: Object.freeze({...city.dispatch}) })));
})();
