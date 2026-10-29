/* Lightweight city index. Capability flags gate shared runtimes independently. */
(() => {
  'use strict';
  const simulatorRoutes = Object.freeze({
    desktop:'response-simulator/play/',
    mobile:'response-simulator/mobile/',
  });
  const cities = [
    { id:'peterborough', name:'Peterborough', province:'Ontario', status:'playable', playable:true,
      note:'Full dispatch available', packageUrl:'cities/peterborough/city.json', dispatch:simulatorRoutes },
    { id:'oshawa', name:'Oshawa', province:'Ontario', status:'scene-response', playable:true,
      note:'Modeled Fire and EMS scene-response exercises; no hospital transport', packageUrl:'cities/oshawa/city.json', dispatch:simulatorRoutes },
    { id:'belleville', name:'Belleville', province:'Ontario', status:'scene-response', playable:true,
      note:'Modeled Fire and EMS scene-response exercises; no hospital transport', packageUrl:'cities/belleville/city.json', dispatch:simulatorRoutes },
    { id:'scarborough', name:'Scarborough', province:'Ontario', status:'scene-response', playable:true,
      note:'Modeled Fire and EMS scene-response exercises; no hospital transport', packageUrl:'cities/scarborough/city.json', dispatch:simulatorRoutes },
    { id:'pickering', name:'Pickering', province:'Ontario', status:'scene-response', playable:true,
      note:'Modeled Fire and EMS scene-response exercises; no hospital transport', packageUrl:'cities/pickering/city.json', dispatch:simulatorRoutes },
    { id:'markham', name:'Markham', province:'Ontario', status:'scene-response', playable:true,
      note:'Modeled Fire and EMS scene-response exercises; no hospital transport', packageUrl:'cities/markham/city.json', dispatch:simulatorRoutes },
    { id:'toronto', name:'Toronto', province:'Ontario', status:'scene-response', playable:true,
      note:'Modeled Fire and EMS scene-response exercises; no hospital transport', packageUrl:'cities/toronto/city.json', dispatch:simulatorRoutes },
  ];
  const geoDemos = [
    ['ajax','Ajax'],['barrie','Barrie'],['belleville','Belleville'],['brampton','Brampton'],['brantford','Brantford'],
    ['burlington','Burlington'],['cambridge','Cambridge'],['chatham-kent','Chatham-Kent'],
    ['clarington','Clarington'],['greater-sudbury','Greater Sudbury'],['guelph','Guelph'],
    ['hamilton','Hamilton'],['kingston','Kingston'],['kitchener','Kitchener'],['london','London'],
    ['markham','Markham'],['milton','Milton'],['mississauga','Mississauga'],['niagara-falls','Niagara Falls'],
    ['oakville','Oakville'],['oshawa','Oshawa'],['ottawa','Ottawa'],['pickering','Pickering'],
    ['richmond-hill','Richmond Hill'],['scarborough','Scarborough'],['st-catharines','St. Catharines'],['thunder-bay','Thunder Bay'],
    ['toronto','Toronto'],['vaughan','Vaughan'],['waterloo','Waterloo'],['whitby','Whitby'],['windsor','Windsor'],
  ];
  const originalIds = new Set(cities.map(city => city.id));
  const geoIds = new Set(geoDemos.map(([id]) => id));
  for (const [id,name] of geoDemos) {
    if (!originalIds.has(id)) cities.push({id,name,province:'Ontario',status:'geo-demo',playable:true,
      note:'Geo Guesser and Route Mapping available',packageUrl:`cities/${id}/city.json`});
  }
  window.PTBO_CITIES = Object.freeze(cities.map(city => Object.freeze({
    ...city,dispatch:simulatorRoutes,
    ...(city.id === 'richmond-hill' ? {dispatchDemo:Object.freeze({callLimit:5})} : {}),
    ...(geoIds.has(city.id) ? {geoDataUrl:`cities/${city.id}/geo-data.json`} : {}),
    modes:Object.freeze({geo:city.id === 'peterborough' || geoIds.has(city.id),
      route:true,dispatch:originalIds.has(city.id),explorer:city.id === 'peterborough'}),
  })));
})();
