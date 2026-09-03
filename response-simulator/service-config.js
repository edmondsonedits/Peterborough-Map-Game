/* Service locations are documented in docs/ems-locations.md. Coordinates use
   mapped sites; the hospital target is an accessible Hospital Drive arrival point. */
(() => {
  'use strict';
  const fireBases = [
    { id:'station-1', number:1, name:'Station 1', shortName:'Station 1', address:'210 Sherbrooke St', lat:44.300871, lng:-78.322206 },
    { id:'station-2', number:2, name:'Station 2', shortName:'Station 2', address:'100 Marina Blvd', lat:44.335266, lng:-78.316657 },
    { id:'station-3', number:3, name:'Station 3', shortName:'Station 3', address:'839 Clonsilla Ave', lat:44.284867, lng:-78.350902 },
  ];
  const emsBases = [
    { id:'ems-armour', number:1, name:'Armour Road Headquarters', shortName:'Armour', address:'310 Armour Rd', lat:44.3047473, lng:-78.3034836 },
    { id:'ems-clonsilla', number:2, name:'Clonsilla Avenue Base', shortName:'Clonsilla', address:'1003 Clonsilla Ave', lat:44.2892770, lng:-78.3459780 },
  ];
  const hospital = Object.freeze({ id:'prhc', main:'Medical', sub:'Hospital Transport',
    name:'Peterborough Regional Health Centre', addr:'1 Hospital Drive',
    lat:44.30095, lng:-78.3460594, radius:30 });
  const alarmCategories = Object.freeze(['Auto Alarm / Vehicle Fire','Alarms No Apparent Problem']);
  const profiles = Object.freeze({
    fire:Object.freeze({id:'fire',label:'Fire',vehicle:'Fire truck',bases:Object.freeze(fireBases.map(Object.freeze))}),
    ems:Object.freeze({id:'ems',label:'EMS',vehicle:'Ambulance',bases:Object.freeze(emsBases.map(Object.freeze))}),
  });
  const api = Object.freeze({profiles,hospital,alarmCategories});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PTBO_SERVICE_CONFIG = api;
})();
