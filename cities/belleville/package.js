(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v') || VERSION;
  const config={
    id:'belleville',name:'Belleville',
    map:{defaultCenter:[44.1628,-77.3832],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[44.12,-77.50],[44.37,-77.23]]},
    sources:{
      fire:{type:'static',sourceUrl:'https://www.belleville.ca/home-and-property/fire-and-emergency-services/about-belleville-fire-and-emergency-services/',entries:[
        {number:1,name:'Fire Station 1',shortName:'Stn 1',address:'60 Bettes St',lat:44.178547363987015,lng:-77.37422592077385},
        {number:2,name:'Fire Station 2',shortName:'Stn 2',address:'72 Moira St W',lat:44.16791177695602,lng:-77.3911950494537},
        {number:3,name:'Fire Station 3',shortName:'Stn 3',address:'4867 Old Hwy 2',lat:44.18267087400826,lng:-77.2780568648666},
        {number:4,name:'Fire Station 4',shortName:'Stn 4',address:'516 Harmony Rd',lat:44.239580379264275,lng:-77.39149726275552},
        {number:5,name:'Fire Station 5',shortName:'Stn 5',address:'26 Hoskin Rd',lat:44.290420543984595,lng:-77.35116759810465}
      ]},
      ems:{type:'static',entries:[
        {number:1,name:'Base 00 — Headquarters',shortName:'Base 00',address:'111 Millennium Parkway',lat:44.19281552659254,lng:-77.4058714420806},
        {number:2,name:'Base 01 — Farley',shortName:'Base 01',address:'38 Farley Ave',lat:44.16680243665393,lng:-77.3491454191396}
      ]}
    }
  };
  const start=()=>window.PTBO_PREVIEW_CITY_FACTORY.create({...config,sourceUrl});
  if(window.PTBO_PREVIEW_CITY_FACTORY?.version===VERSION){start();return;}
  const factoryUrl=new URL('../preview-package-factory.js?v='+CACHE_VERSION,sourceUrl).href;
  if(document.readyState==='loading'&&typeof document.write==='function'){
    // The inserted external script runs after this script returns. Queue its
    // initializer after it so following parser scripts see the city package.
    const payload=JSON.stringify({...config,sourceUrl:sourceUrl.href}).replace(/</g,'\\u003c');
    document.write('<script src="'+factoryUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"><'+'/script>'+
      '<script>window.PTBO_PREVIEW_CITY_FACTORY.create('+payload+');<'+'/script>');
    return;
  }
  const script=document.createElement('script');script.src=factoryUrl;script.onload=start;script.onerror=()=>console.error('Unable to load base-training city package factory.');document.head.appendChild(script);
})();
