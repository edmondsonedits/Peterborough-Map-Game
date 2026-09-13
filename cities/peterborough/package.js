/* Peterborough city package — authoritative geographic/service configuration. */
(() => {
  'use strict';
  const VERSION = '1.6.63';
  if (window.PTBO_CITY_PACKAGE?.id === 'peterborough' && window.PTBO_CITY_PACKAGE?.version === VERSION) return;

  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  const freezeList = list => Object.freeze(list.map(item => Object.freeze({ ...item })));

  const fireBases = freezeList([
    { id:'station-1', number:1, name:'Station 1', shortName:'Station 1', address:'210 Sherbrooke St', lat:44.30102, lng:-78.32202, yardSize:69, yardWidth:69, yardLength:69, yardRotation:2, spawnLat:44.300942, spawnLng:-78.322201, spawnHeading:177 },
    { id:'station-2', number:2, name:'Station 2', shortName:'Station 2', address:'100 Marina Blvd', lat:44.335719, lng:-78.316209, yardSize:151, yardWidth:151, yardLength:41, yardRotation:65, spawnLat:44.335928, spawnLng:-78.316016, spawnHeading:202 },
    { id:'station-3', number:3, name:'Station 3', shortName:'Station 3', address:'839 Clonsilla Ave', lat:44.284779, lng:-78.351068, yardSize:92, yardWidth:92, yardLength:85, yardRotation:53, spawnLat:44.284959, spawnLng:-78.350694, spawnHeading:127 },
  ]);

  const emsBases = freezeList([
    { id:'ems-armour', number:1, name:'Armour Road Headquarters', shortName:'Armour', address:'310 Armour Rd', lat:44.304776, lng:-78.303384, yardSize:136, yardWidth:136, yardLength:96, yardRotation:19, spawnLat:44.304839, spawnLng:-78.303270, spawnHeading:45 },
    { id:'ems-clonsilla', number:2, name:'Clonsilla Avenue Base', shortName:'Clonsilla', address:'1003 Clonsilla Ave', lat:44.289523, lng:-78.345850, yardSize:90, yardWidth:63, yardLength:90, yardRotation:44, spawnLat:44.289665, spawnLng:-78.346016, spawnHeading:135 },
  ]);

  const hospital = Object.freeze({
    id:'prhc', main:'Medical', sub:'Hospital Transport',
    name:'Peterborough Regional Health Centre', addr:'1 Hospital Drive',
    lat:44.300744, lng:-78.347467, radius:40,
    checkpointLat:44.300744, checkpointLng:-78.347467, checkpointRadius:40,
    areaLat:44.300944, areaLng:-78.347561, areaWidth:58, areaLength:75, areaRotation:88,
  });

  const alarmCategories = Object.freeze(['Auto Alarm / Vehicle Fire','Alarms No Apparent Problem']);
  const profiles = Object.freeze({
    fire:Object.freeze({ id:'fire', label:'Fire', vehicle:'Fire truck', bases:fireBases }),
    ems:Object.freeze({ id:'ems', label:'EMS', vehicle:'Ambulance', bases:emsBases }),
  });

  const map = Object.freeze({
    defaultCenter:Object.freeze([44.30102,-78.32202]),
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
