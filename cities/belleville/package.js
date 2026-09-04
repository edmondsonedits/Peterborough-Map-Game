(() => {
  'use strict';
  const VERSION='1.6.9';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'belleville',name:'Belleville',
    map:{defaultCenter:[44.1628,-77.3832],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[44.08,-77.50],[44.28,-77.25]]},
    sources:{
      fire:{type:'belleville-fire',url:'https://services.arcgis.com/SAu8NqrusbgBNcuU/ArcGIS/rest/services/Fire_Stations_Proposed/FeatureServer/0',outFields:'ADDRESS,STATION_NO,Label',fallback:[
        {number:1,name:'Fire Station 1',shortName:'Stn 1',address:'60 Bettes St'},
        {number:2,name:'Fire Station 2',shortName:'Stn 2',address:'72 Moira St W'},
        {number:3,name:'Fire Station 3',shortName:'Stn 3',address:'4867 Old Hwy 2'},
        {number:4,name:'Fire Station 4',shortName:'Stn 4',address:'516 Harmony Rd'},
        {number:5,name:'Fire Station 5',shortName:'Stn 5',address:'26 Hoskin Rd'}
      ]},
      ems:{type:'static',entries:[
        {number:1,name:'Base 00 — Headquarters',shortName:'Base 00',address:'111 Millennium Parkway'},
        {number:2,name:'Base 01 — Farley',shortName:'Base 01',address:'38 Farley Ave'}
      ]}
    }
  };
  const start=()=>window.PTBO_PREVIEW_CITY_FACTORY.create({...config,sourceUrl});
  if(window.PTBO_PREVIEW_CITY_FACTORY?.version===VERSION){start();return;}
  const factoryUrl=new URL('../preview-package-factory.js?v='+VERSION,sourceUrl).href;
  if(document.readyState==='loading'&&typeof document.write==='function'){
    document.write('<script src="'+factoryUrl.replace(/&/g,'&amp;')+'"><'+'/script>');
    start();
    return;
  }
  const script=document.createElement('script');script.src=factoryUrl;script.onload=start;script.onerror=()=>console.error('Unable to load base-training city package factory.');document.head.appendChild(script);
})();
