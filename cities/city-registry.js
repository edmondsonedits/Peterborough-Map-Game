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
    { id:'oshawa', name:'Oshawa', province:'Ontario', status:'base-training', playable:true,
      note:'calls unavailable', packageUrl:'cities/oshawa/city.json', dispatch:simulatorRoutes },
    { id:'belleville', name:'Belleville', province:'Ontario', status:'base-training', playable:true,
      note:'calls unavailable', packageUrl:'cities/belleville/city.json', dispatch:simulatorRoutes },
    { id:'scarborough', name:'Scarborough', province:'Ontario', status:'base-training', playable:true,
      note:'calls unavailable', packageUrl:'cities/scarborough/city.json', dispatch:simulatorRoutes },
    { id:'pickering', name:'Pickering', province:'Ontario', status:'base-training', playable:true,
      note:'calls unavailable', packageUrl:'cities/pickering/city.json', dispatch:simulatorRoutes },
    { id:'markham', name:'Markham', province:'Ontario', status:'base-training', playable:true,
      note:'calls unavailable', packageUrl:'cities/markham/city.json', dispatch:simulatorRoutes },
    { id:'toronto', name:'Toronto', province:'Ontario', status:'base-training', playable:true,
      note:'calls unavailable', packageUrl:'cities/toronto/city.json', dispatch:simulatorRoutes },
  ];
  const geoDemos = [
    ['ajax','Ajax'],['barrie','Barrie'],['brampton','Brampton'],['brantford','Brantford'],
    ['burlington','Burlington'],['cambridge','Cambridge'],['chatham-kent','Chatham-Kent'],
    ['clarington','Clarington'],['greater-sudbury','Greater Sudbury'],['guelph','Guelph'],
    ['hamilton','Hamilton'],['kingston','Kingston'],['kitchener','Kitchener'],['london','London'],
    ['markham','Markham'],['milton','Milton'],['mississauga','Mississauga'],['niagara-falls','Niagara Falls'],
    ['oakville','Oakville'],['oshawa','Oshawa'],['ottawa','Ottawa'],['pickering','Pickering'],
    ['richmond-hill','Richmond Hill'],['st-catharines','St. Catharines'],['thunder-bay','Thunder Bay'],
    ['toronto','Toronto'],['vaughan','Vaughan'],['waterloo','Waterloo'],['whitby','Whitby'],['windsor','Windsor'],
  ];
  const originalIds = new Set(cities.map(city => city.id));
  const geoIds = new Set(geoDemos.map(([id]) => id));
  for (const [id,name] of geoDemos) {
    if (!originalIds.has(id)) cities.push({id,name,province:'Ontario',status:'geo-demo',playable:true,
      note:'Geo Guesser demo available',packageUrl:`cities/${id}/city.json`});
  }
  const catalogCounts = {"ajax":20,"barrie":20,"belleville":8,"brampton":20,"brantford":20,"burlington":20,"cambridge":20,"chatham-kent":20,"clarington":20,"greater-sudbury":20,"guelph":20,"hamilton":20,"kingston":20,"kitchener":20,"london":20,"markham":20,"milton":20,"mississauga":20,"niagara-falls":20,"oakville":20,"oshawa":20,"ottawa":20,"peterborough":200,"pickering":20,"richmond-hill":20,"scarborough":12,"st-catharines":20,"thunder-bay":20,"toronto":20,"vaughan":20,"waterloo":20,"whitby":20,"windsor":20};
  window.PTBO_CITIES = Object.freeze(cities.map(city => Object.freeze({
    ...city,dispatch:simulatorRoutes,callCount:catalogCounts[city.id]??0,
    routeDataUrl:`cities/${city.id}/route-data.json`,
    ...(city.id!=='peterborough'?{locationDataUrl:`cities/${city.id}/geo-data.json`}:{}),
    ...(geoIds.has(city.id) ? {geoDataUrl:`cities/${city.id}/geo-data.json`} : {}),
    modes:Object.freeze({geo:city.id === 'peterborough' || geoIds.has(city.id),
      route:true,dispatch:originalIds.has(city.id),explorer:city.id === 'peterborough'}),
  })));
})();
