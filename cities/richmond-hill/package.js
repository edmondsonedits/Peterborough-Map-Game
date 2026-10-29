/* Richmond Hill native Dispatch demo — sourced bases, five local calls, EMS transport. */
(() => {
  'use strict';
  const VERSION = '1.6.153';
  if (window.PTBO_CITY_PACKAGE?.id === 'richmond-hill' && window.PTBO_CITY_PACKAGE?.version === VERSION) return;
  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  const freezeList = list => Object.freeze(list.map(item => Object.freeze({...item})));

  // Source facility points are retained. Spawns use the existing audited, modeled
  // road starts in training-data.json; they do not assert surveyed vehicle exits.
  const fireBases = freezeList([
    {"number":10000,"name":"Fire Station 8-1","shortName":"Fire Station 8-1","address":"191 Major Mackenzie Drive West, Richmond Hill, ON","lat":43.869213,"lng":-79.443971,"id":"fire-richmond-hill-fire-8-1","yardSize":80,"spawnLat":43.8693875,"spawnLng":-79.4436973,"spawnHeading":180},
    {"number":10001,"name":"Fire Station 8-2","shortName":"Fire Station 8-2","address":"13067 Yonge Street, Richmond Hill, ON","lat":43.946476,"lng":-79.45452,"id":"fire-richmond-hill-fire-8-2","yardSize":80,"spawnLat":43.9466983572658,"spawnLng":-79.45461275394953,"spawnHeading":180},
    {"number":10002,"name":"Fire Station 8-3","shortName":"Fire Station 8-3","address":"1371 16th Avenue, Richmond Hill, ON","lat":43.861053,"lng":-79.390451,"id":"fire-richmond-hill-fire-8-3","yardSize":80,"spawnLat":43.86103434686989,"spawnLng":-79.39058544295402,"spawnHeading":180},
    {"number":10003,"name":"Fire Station 8-4","shortName":"Fire Station 8-4","address":"1365 Elgin Mills Road East, Richmond Hill, ON","lat":43.89698,"lng":-79.400284,"id":"fire-richmond-hill-fire-8-4","yardSize":80,"spawnLat":43.89698857965589,"spawnLng":-79.40024302624761,"spawnHeading":180},
    {"number":10004,"name":"Fire Station 8-5","shortName":"Fire Station 8-5","address":"150 High Tech Road, Richmond Hill, ON","lat":43.842481,"lng":-79.422799,"id":"fire-richmond-hill-fire-8-5","yardSize":80,"spawnLat":43.8421578,"spawnLng":-79.4226634,"spawnHeading":180},
    {"number":10005,"name":"Fire Station 8-6","shortName":"Fire Station 8-6","address":"101 Gamble Road, Richmond Hill, ON","lat":43.906591,"lng":-79.449414,"id":"fire-richmond-hill-fire-8-6","yardSize":80,"spawnLat":43.906628,"spawnLng":-79.4498311,"spawnHeading":180}
  ]);
  const emsBases = freezeList([
    {"number":28,"name":"Paramedic Station #28 (Richmond Hill)","shortName":"Paramedic Station #28 (Richmond Hill)","address":"171 Major Mackenzie Drive West, Richmond Hill, ON","lat":43.867171820603346,"lng":-79.44249767296054,"id":"ems-richmond-hill-ems-28","yardSize":80,"spawnLat":43.86692183295849,"spawnLng":-79.44279599982337,"spawnHeading":180},
    {"number":85,"name":"Paramedic Station #85 (Richmond Hill South)","shortName":"Paramedic Station #85 (Richmond Hill South)","address":"150 High Tech Road, Richmond Hill, ON","lat":43.84248970054056,"lng":-79.42280246749424,"id":"ems-richmond-hill-ems-85","yardSize":80,"spawnLat":43.8421578,"spawnLng":-79.4226634,"spawnHeading":180}
  ]);
  // Training checkpoint on public Trench Street, beside the hospital's north
  // side. This is a modeled road approach, not a verified ambulance bay.
  const hospital = Object.freeze({
    id:'mackenzie-richmond-hill', main:'Medical', sub:'Hospital Transport',
    name:'Mackenzie Richmond Hill Hospital', addr:'10 Trench Street',
    lat:43.8714902, lng:-79.449977, radius:40,
    checkpointLat:43.8714902, checkpointLng:-79.449977, checkpointRadius:40,
    areaLat:43.8714902, areaLng:-79.449977, areaWidth:20, areaLength:60, areaRotation:344,
  });
  const profiles = Object.freeze({
    fire:Object.freeze({id:'fire',label:'Fire',vehicle:'Fire truck',bases:fireBases}),
    ems:Object.freeze({id:'ems',label:'EMS',vehicle:'Ambulance',bases:emsBases}),
  });
  const serviceConfig = Object.freeze({profiles,hospital,alarmCategories:Object.freeze(['Auto Alarm / Vehicle Fire','Alarms No Apparent Problem'])});
  const map = Object.freeze({
    defaultCenter:Object.freeze([43.869213,-79.443971]), defaultHeading:180,
    defaultZoom:15,minZoom:10,maxZoom:19,
    bounds:Object.freeze([Object.freeze([43.829270412593175,-79.48559824366056]),Object.freeze([43.97754774129366,-79.3714957973409])]),
  });
  const roads = Object.freeze({
    available:true,dataUrl:new URL('./roads.geojson.gz',sourceUrl).href,
    manifestUrl:new URL('./training-data.json',sourceUrl).href,
    sourceAsset:'cities/richmond-hill/roads.geojson.gz',center:Object.freeze([43.867171820603346,-79.44249767296054]),
    gridSize:80,sweepStep:1.35,shoulderTolerance:1.35,spawnSnapDistance:120,
    stationExitSearchDistance:120,stationExitCorridorHalfWidth:8,stationExitStartPadding:4,
    defaultLaneAssist:0.60,collisionVelocityRetention:0.42,
  });
  // The canonical seed is unchanged, so preserve existing Geo/editor saves.
  const dispatch = Object.freeze({available:true,controlName:'Richmond Hill Control',dataVersion:'ontario-geo-1',descriptorUrl:new URL('./dispatch-data.js',sourceUrl).href});
  const features = Object.freeze({baseTraining:false,dispatch:true,roadBoundaries:true,routeGuidance:true,hospitalTransport:true});
  const cityPackage = Object.freeze({schemaVersion:3,version:VERSION,id:'richmond-hill',name:'Richmond Hill',province:'Ontario',country:'Canada',playable:true,status:'dispatch-demo',features,map,roads,dispatch,serviceConfig,dispatchDemo:Object.freeze({callLimit:5})});

  window.PTBO_CITY_PACKAGE=cityPackage;window.PTBO_ACTIVE_CITY=cityPackage;
  window.PTBO_SERVICE_CONFIG=serviceConfig;window.PTBO_STATIONS=fireBases;
  window.getPtboStation=number=>fireBases.find(station=>station.number===Number(number));
  window.PTBO_DISPATCH_DATA_VERSION=dispatch.dataVersion;
  window.PTBO_DISPATCH_DATA_READY=fetch(new URL('./geo-data.json',sourceUrl).href,{cache:'force-cache'}).then(async response=>{
    if(!response.ok)throw new Error('Richmond Hill dispatch locations could not load.');
    const geo=await response.json();
    if(geo?.schemaVersion!==1||geo.id!=='richmond-hill'||!Array.isArray(geo.locations))throw new Error('Richmond Hill dispatch locations are invalid.');
    return geo.locations;
  });
  window.PTBO_CITY_PACKAGE_READY=window.PTBO_DISPATCH_DATA_READY.then(()=>cityPackage);
  window.PTBO_CITY_PACKAGE_READY.catch(error=>{window.PTBO_CITY_PACKAGE_LOAD_ERROR=error;});
  document.documentElement.dataset.city=cityPackage.id;
  document.documentElement.dataset.cityPackageVersion=VERSION;
  document.documentElement.dataset.dispatchAvailable='true';
  window.dispatchEvent(new CustomEvent('ptbo-city-package-ready',{detail:{id:cityPackage.id,version:VERSION}}));
})();
