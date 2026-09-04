/* Peterborough city package — authoritative geographic/service configuration. */
(() => {
  'use strict';
  const VERSION = '1.6.12';
  if (window.PTBO_CITY_PACKAGE?.id === 'peterborough' && window.PTBO_CITY_PACKAGE?.version === VERSION) return;

  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  const freezeList = list => Object.freeze(list.map(item => Object.freeze({ ...item })));

  const fireBases = freezeList([
    { id:'station-1', number:1, name:'Station 1', shortName:'Station 1', address:'210 Sherbrooke St', lat:44.300871, lng:-78.322206, yardSize:160, yardRotation:0 },
    { id:'station-2', number:2, name:'Station 2', shortName:'Station 2', address:'100 Marina Blvd', lat:44.335266, lng:-78.316657, yardSize:160, yardRotation:0 },
    { id:'station-3', number:3, name:'Station 3', shortName:'Station 3', address:'839 Clonsilla Ave', lat:44.284867, lng:-78.350902, yardSize:160, yardRotation:0 },
  ]);

  const emsBases = freezeList([
    { id:'ems-armour', number:1, name:'Armour Road Headquarters', shortName:'Armour', address:'310 Armour Rd', lat:44.3047473, lng:-78.3034836, yardSize:160, yardRotation:0 },
    { id:'ems-clonsilla', number:2, name:'Clonsilla Avenue Base', shortName:'Clonsilla', address:'1003 Clonsilla Ave', lat:44.2892770, lng:-78.3459780, yardSize:160, yardRotation:0 },
  ]);

  const hospital = Object.freeze({
    id:'prhc', main:'Medical', sub:'Hospital Transport',
    name:'Peterborough Regional Health Centre', addr:'1 Hospital Drive',
    lat:44.30095, lng:-78.3460594, radius:30,
  });

  const alarmCategories = Object.freeze(['Auto Alarm / Vehicle Fire','Alarms No Apparent Problem']);
  const profiles = Object.freeze({
    fire:Object.freeze({ id:'fire', label:'Fire', vehicle:'Fire truck', bases:fireBases }),
    ems:Object.freeze({ id:'ems', label:'EMS', vehicle:'Ambulance', bases:emsBases }),
  });

  const map = Object.freeze({
    defaultCenter:Object.freeze([44.300871,-78.322206]),
    defaultHeading:180,
    defaultZoom:15,
    minZoom:10,
    maxZoom:19,
    bounds:Object.freeze([Object.freeze([44.20,-78.45]),Object.freeze([44.45,-78.20])]),
  });

  const roads = Object.freeze({
    available:true,
    dataUrl:new URL('../../city-explorer/data/osm-public-roads.geojson', sourceUrl).href,
    sourceAsset:'city-explorer/data/osm-public-roads.geojson',
    center:Object.freeze([44.3091,-78.3197]),
    gridSize:80,
    sweepStep:1.35,
    shoulderTolerance:1.35,
    spawnSnapDistance:120,
    stationExitSearchDistance:120,
    stationExitCorridorHalfWidth:8,
    stationExitStartPadding:4,
    defaultLaneAssist:0.60,
    collisionVelocityRetention:0.42,
  });

  const dispatch = Object.freeze({
    available:true,
    controlName:'Peterborough Control',
    dataVersion:'1.4.20',
    descriptorUrl:new URL('./dispatch-data.js', sourceUrl).href,
    legacyAsset:'shared/dispatch-data-1.4.4.js',
  });

  const features = Object.freeze({baseTraining:false,dispatch:true,roadBoundaries:true,routeGuidance:true,hospitalTransport:true});
  const serviceConfig = Object.freeze({ profiles, hospital, alarmCategories });
  const cityPackage = Object.freeze({
    schemaVersion:3,
    version:VERSION,
    id:'peterborough',
    name:'Peterborough',
    province:'Ontario',
    country:'Canada',
    playable:true,
    status:'playable',
    features,
    map,
    roads,
    dispatch,
    serviceConfig,
  });

  window.PTBO_CITY_PACKAGE = cityPackage;
  window.PTBO_ACTIVE_CITY = cityPackage;
  window.PTBO_SERVICE_CONFIG = serviceConfig;
  window.PTBO_STATIONS = fireBases;
  window.getPtboStation = number => fireBases.find(station => station.number === Number(number));
  document.documentElement.dataset.city = cityPackage.id;
  document.documentElement.dataset.cityPackageVersion = VERSION;
  document.documentElement.dataset.dispatchAvailable = 'true';
  window.dispatchEvent(new CustomEvent('ptbo-city-package-ready', { detail:{ id:cityPackage.id, version:VERSION } }));
})();
