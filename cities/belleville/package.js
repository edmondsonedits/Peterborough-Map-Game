(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v') || VERSION;
  const config={
    id:'belleville',name:'Belleville',sceneResponseDrills:true,
    map:{defaultCenter:[44.1628,-77.3832],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[44.08,-77.50],[44.35,-77.23]]},
    sources:{
      fire:{type:'static',url:"https://www.belleville.ca/home-and-property/fire-and-emergency-services/about-belleville-fire-and-emergency-services/",entries:[
        {id:"fire-fire-station-1-1",number:1,name:"Fire Station 1",shortName:"Stn 1",address:"60 Bettes St",lat:44.1781883,lng:-77.37418941601382},
        {id:"fire-fire-station-2-2",number:2,name:"Fire Station 2",shortName:"Stn 2",address:"72 Moira St W",lat:44.16807745,lng:-77.3911658889237},
        {id:"fire-fire-station-3-3",number:3,name:"Fire Station 3",shortName:"Stn 3",address:"4867 Old Hwy 2",lat:44.18317945,lng:-77.27781219226566},
        {id:"fire-fire-station-4-4",number:4,name:"Fire Station 4",shortName:"Stn 4",address:"516 Harmony Rd",lat:44.2395756,lng:-77.3910552},
        {id:"fire-fire-station-5-5",number:5,name:"Fire Station 5",shortName:"Stn 5",address:"26 Hoskin Rd",lat:44.2900043,lng:-77.35068298889313}
      ]},
      ems:{type:'static',url:"https://hastingscounty.com/communities/services/emergency-services",entries:[
        {id:"ems-base-00-headquarters-1",number:1,name:"Base 00 — Headquarters",shortName:"Base 00",address:"111 Millennium Parkway",lat:44.192834149999996,lng:-77.40611642333934},
        {id:"ems-base-01-farley-2",number:2,name:"Base 01 — Farley",shortName:"Base 01",address:"38 Farley Ave",lat:44.16672235,lng:-77.3489036}
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
