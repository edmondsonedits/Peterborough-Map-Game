/* Generic service-config compatibility loader.
   Production city data lives under cities/<id>/. The small Peterborough fallback
   below exists only for Node tests/standalone legacy embeds that cannot load an
   external city package; normal browser startup replaces it with package.js. */
(() => {
  'use strict';
  const VERSION = '1.6.5';

  function peterboroughFallback() {
    const fireBases = [
      { id:'station-1', number:1, name:'Station 1', shortName:'Station 1', address:'210 Sherbrooke St', lat:44.300871, lng:-78.322206, yardSize:160, yardRotation:0 },
      { id:'station-2', number:2, name:'Station 2', shortName:'Station 2', address:'100 Marina Blvd', lat:44.335266, lng:-78.316657, yardSize:160, yardRotation:0 },
      { id:'station-3', number:3, name:'Station 3', shortName:'Station 3', address:'839 Clonsilla Ave', lat:44.284867, lng:-78.350902, yardSize:160, yardRotation:0 },
    ];
    const emsBases = [
      { id:'ems-armour', number:1, name:'Armour Road Headquarters', shortName:'Armour', address:'310 Armour Rd', lat:44.3047473, lng:-78.3034836, yardSize:160, yardRotation:0 },
      { id:'ems-clonsilla', number:2, name:'Clonsilla Avenue Base', shortName:'Clonsilla', address:'1003 Clonsilla Ave', lat:44.2892770, lng:-78.3459780, yardSize:160, yardRotation:0 },
    ];
    const hospital = { id:'prhc', main:'Medical', sub:'Hospital Transport', name:'Peterborough Regional Health Centre', addr:'1 Hospital Drive', lat:44.30095, lng:-78.3460594, radius:30 };
    const alarmCategories = ['Auto Alarm / Vehicle Fire','Alarms No Apparent Problem'];
    const profiles = {
      fire:{id:'fire',label:'Fire',vehicle:'Fire truck',bases:fireBases},
      ems:{id:'ems',label:'EMS',vehicle:'Ambulance',bases:emsBases},
    };
    const serviceConfig = {profiles,hospital,alarmCategories};
    const cityPackage = {
      schemaVersion:2,version:VERSION,id:'peterborough',name:'Peterborough',province:'Ontario',country:'Canada',playable:true,status:'playable',
      map:{defaultCenter:[44.300871,-78.322206],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[44.20,-78.45],[44.45,-78.20]]},
      roads:{dataUrl:'../city-explorer/data/osm-public-roads.geojson',center:[44.3091,-78.3197],gridSize:80,sweepStep:1.35,shoulderTolerance:1.35,spawnSnapDistance:120,stationExitSearchDistance:120,stationExitCorridorHalfWidth:8,stationExitStartPadding:4,defaultLaneAssist:0.60,collisionVelocityRetention:0.42},
      dispatch:{controlName:'Peterborough Control',dataVersion:'1.4.20'},serviceConfig,
    };
    return {serviceConfig,cityPackage};
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = peterboroughFallback().serviceConfig;
    return;
  }

  if (window.PTBO_SERVICE_CONFIG && window.PTBO_CITY_PACKAGE) return;

  const canLoadPackage = typeof location !== 'undefined' && typeof document !== 'undefined' && Boolean(document.currentScript?.src);
  if (!canLoadPackage) {
    const fallback = peterboroughFallback();
    window.PTBO_SERVICE_CONFIG = fallback.serviceConfig;
    window.PTBO_CITY_PACKAGE = fallback.cityPackage;
    window.PTBO_ACTIVE_CITY = fallback.cityPackage;
    window.PTBO_STATIONS = fallback.serviceConfig.profiles.fire.bases;
    window.getPtboStation = number => window.PTBO_STATIONS.find(station => station.number === Number(number));
    return;
  }

  const params = new URL(location.href).searchParams;
  const stored = (() => { try { return localStorage.getItem('ptboSelectedCity'); } catch (_) { return null; } })();
  const requested = String(params.get('city') || stored || 'peterborough').toLowerCase();
  const cityId = /^[a-z0-9-]+$/.test(requested) ? requested : 'peterborough';
  const sourceUrl = new URL(document.currentScript.src, location.href);
  const packageUrl = new URL(`../cities/${cityId}/package.js?v=${VERSION}`, sourceUrl).href;
  window.PTBO_REQUESTED_CITY = cityId;

  if (document.readyState === 'loading' && typeof document.write === 'function') {
    document.write(`<script src="${packageUrl.replace(/&/g,'&amp;')}"><\/script>`);
    return;
  }

  const script = document.createElement('script');
  script.src = packageUrl;
  script.dataset.ptboCityPackage = cityId;
  script.onerror = () => console.error(`Unable to load city package: ${cityId}`);
  document.head.appendChild(script);
})();
