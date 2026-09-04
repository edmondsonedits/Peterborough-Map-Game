(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'belleville',name:'Belleville',
    map:{defaultCenter:[44.1628,-77.3832],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[44.08,-77.50],[44.28,-77.25]]},
    sources:{
      fire:{type:'belleville-fire',url:'https://services.arcgis.com/SAu8NqrusbgBNcuU/ArcGIS/rest/services/Fire_Stations_Proposed/FeatureServer/0',outFields:'ADDRESS,STATION_NO,Label',preferFallback:true,fallback:[
        {number:1,name:'Fire Station 1',shortName:'Stn 1',address:'60 Bettes St',lat:44.178879,lng:-77.374169},
        {number:2,name:'Fire Station 2',shortName:'Stn 2',address:'72 Moira St W',lat:44.168345,lng:-77.391159},
        {number:3,name:'Fire Station 3',shortName:'Stn 3',address:'4867 Old Hwy 2',lat:44.182630,lng:-77.277319},
        {number:4,name:'Fire Station 4',shortName:'Stn 4',address:'516 Harmony Rd',lat:44.240140,lng:-77.390478},
        {number:5,name:'Fire Station 5',shortName:'Stn 5',address:'26 Hoskin Rd',lat:44.290622,lng:-77.351574}
      ]},
      ems:{type:'static',entries:[
        {number:1,name:'Base 00 — Headquarters',shortName:'Base 00',address:'111 Millennium Parkway',lat:44.193251,lng:-77.406005},
        {number:2,name:'Base 01 — Farley',shortName:'Base 01',address:'38 Farley Ave',lat:44.174613,lng:-77.352209}
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
