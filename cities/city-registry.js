/* Lightweight city index. Heavy roads/calls are loaded only after a city is chosen. */
(() => {
  'use strict';
  const cities = [
    { id:'peterborough', name:'Peterborough', province:'Ontario', status:'playable', playable:true,
      note:'Available now', packageUrl:'cities/peterborough/city.json',
      dispatch:{ desktop:'response-simulator/play/', mobile:'response-simulator/mobile/' } },
    { id:'oshawa', name:'Oshawa', province:'Ontario', status:'planned', playable:false,
      note:'Unavailable — city package not ready yet.', packageUrl:'cities/oshawa/city.json' },
    { id:'belleville', name:'Belleville', province:'Ontario', status:'planned', playable:false,
      note:'Unavailable — city package not ready yet.', packageUrl:'cities/belleville/city.json' },
    { id:'scarborough', name:'Scarborough', province:'Ontario', status:'planned', playable:false,
      note:'Unavailable — city package not ready yet.', packageUrl:'cities/scarborough/city.json' },
    { id:'pickering', name:'Pickering', province:'Ontario', status:'planned', playable:false,
      note:'Unavailable — city package not ready yet.', packageUrl:'cities/pickering/city.json' },
    { id:'markham', name:'Markham', province:'Ontario', status:'planned', playable:false,
      note:'Unavailable — city package not ready yet.', packageUrl:'cities/markham/city.json' },
    { id:'toronto', name:'Toronto', province:'Ontario', status:'planned', playable:false,
      note:'Unavailable — city package not ready yet.', packageUrl:'cities/toronto/city.json' },
  ];
  window.PTBO_CITIES = Object.freeze(cities.map(city => Object.freeze({ ...city, dispatch: city.dispatch ? Object.freeze({...city.dispatch}) : undefined })));
})();
