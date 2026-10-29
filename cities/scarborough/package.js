(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const CACHE_VERSION=sourceUrl.searchParams.get('v') || VERSION;
  const config={
    sceneResponseDrills:true,id:'scarborough',name:'Scarborough',
    map:{defaultCenter:[43.7764,-79.2318],defaultHeading:180,defaultZoom:14,minZoom:10,maxZoom:19,bounds:[[43.67,-79.34],[43.86,-79.11]]},
    sources:{
      fire:{type:'static',url:"https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/3",entries:[
        {id:"fire-toronto-fire-211",number:211,name:"Fire Station 211",shortName:"Fire Station 211",address:"900 Tapscott Rd, Toronto, ON",lat:43.82399272520154,lng:-79.24287003538682},
        {id:"fire-station-212-212",number:212,name:"Fire Station 212",shortName:"Fire Station 212",address:"8500 Sheppard Ave E, Toronto, ON",lat:43.80490579237686,lng:-79.18874082377098},
        {id:"fire-toronto-fire-213",number:213,name:"Fire Station 213",shortName:"Fire Station 213",address:"7 Lapsley Rd, Toronto, ON",lat:43.795406608873364,lng:-79.22596190861587},
        {id:"fire-toronto-fire-214",number:214,name:"Fire Station 214",shortName:"Fire Station 214",address:"745 Meadowvale Rd, Toronto, ON",lat:43.794210766943564,lng:-79.16360160417264},
        {id:"fire-station-215-215",number:215,name:"Fire Station 215",shortName:"Fire Station 215",address:"5318 Lawrence Ave E, Toronto, ON",lat:43.77739193506365,lng:-79.14806589221874},
        {id:"fire-station-221-221",number:221,name:"Fire Station 221",shortName:"Fire Station 221",address:"2575 Eglinton Ave E, Toronto, ON",lat:43.73479014329829,lng:-79.25506270350353},
        {id:"fire-toronto-fire-222",number:222,name:"Fire Station 222",shortName:"Fire Station 222",address:"755 Warden Ave, Toronto, ON",lat:43.72039942742826,lng:-79.2840906320077},
        {id:"fire-toronto-fire-223",number:223,name:"Fire Station 223",shortName:"Fire Station 223",address:"116 Dorset Rd, Toronto, ON",lat:43.723956761795435,lng:-79.23326107765529},
        {id:"fire-toronto-fire-225",number:225,name:"Fire Station 225",shortName:"Fire Station 225",address:"3600 Danforth Ave, Toronto, ON",lat:43.69591687317466,lng:-79.26849460456525},
        {id:"fire-station-231-231",number:231,name:"Fire Station 231",shortName:"Fire Station 231",address:"740 Markham Rd, Toronto, ON",lat:43.7646440088669,lng:-79.22778766284232},
        {id:"fire-toronto-fire-232",number:232,name:"Fire Station 232",shortName:"Fire Station 232",address:"1550 Midland Ave, Toronto, ON",lat:43.75496694557759,lng:-79.26685107132796},
        {id:"fire-toronto-fire-234",number:234,name:"Fire Station 234",shortName:"Fire Station 234",address:"40 Coronation Dr, Toronto, ON",lat:43.761068166342255,lng:-79.19152202912737},
        {id:"fire-toronto-fire-241",number:241,name:"Fire Station 241",shortName:"Fire Station 241",address:"3325 Warden Ave, Toronto, ON",lat:43.81404197971089,lng:-79.3238025417745},
        {id:"fire-toronto-fire-242",number:242,name:"Fire Station 242",shortName:"Fire Station 242",address:"2733 Brimley Rd, Toronto, ON",lat:43.80691964458345,lng:-79.27725628028892},
        {id:"fire-station-243-243",number:243,name:"Fire Station 243",shortName:"Fire Station 243",address:"4560 Sheppard Ave E, Toronto, ON",lat:43.78913691711762,lng:-79.2629602053098},
        {id:"fire-toronto-fire-244",number:244,name:"Fire Station 244",shortName:"Fire Station 244",address:"2340 Birchmount Rd, Toronto, ON",lat:43.781682495272456,lng:-79.2991153286616},
        {id:"fire-station-245-245",number:245,name:"Fire Station 245",shortName:"Fire Station 245",address:"1600 Birchmount Rd, Toronto, ON",lat:43.76269182180581,lng:-79.29151840526467}
      ]},
      ems:{type:'static',url:"https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1",entries:[
        {id:"ems-ambulance-station-20-20",number:20,name:"Station 20, District 2 Office",shortName:"Station 20, District 2 Office",address:"2430 Lawrence Ave E, Toronto, ON",lat:43.75089720638386,lng:-79.27135957631407},
        {id:"ems-ambulance-station-21-21",number:21,name:"Station 21",shortName:"Station 21",address:"887 Pharmacy Ave, Toronto, ON",lat:43.72955370341101,lng:-79.29852884106218},
        {id:"ems-ambulance-station-22-22",number:22,name:"Station 22",shortName:"Station 22",address:"3100 Eglinton Ave E, Toronto, ON",lat:43.74200035565319,lng:-79.22625845845992},
        {id:"ems-ambulance-station-24-24",number:24,name:"Station 24",shortName:"Station 24",address:"3061 Birchmount Rd, Toronto, ON",lat:43.80279737480081,lng:-79.30815774616198},
        {id:"ems-toronto-ems-2303629",number:25,name:"Station 25",shortName:"Station 25",address:"8500 Sheppard Ave E, Toronto, ON",lat:43.80493224157932,lng:-79.18862000612295},
        {id:"ems-ambulance-station-26-26",number:26,name:"Station 26",shortName:"Station 26",address:"4331 Lawrence Ave E, Toronto, ON",lat:43.77082674064299,lng:-79.17405340914407},
        {id:"ems-ambulance-station-27-27",number:27,name:"Station 27",shortName:"Station 27",address:"900 Tapscott Rd, Toronto, ON",lat:43.82399272520154,lng:-79.24287003538682},
        {id:"ems-toronto-ems-2807376",number:28,name:"Station 28",shortName:"Station 28",address:"2900 Lawrence Ave E, Toronto, ON",lat:43.75417044660114,lng:-79.25338351971146},
        {id:"ems-toronto-ems-2236216",number:29,name:"Station 29",shortName:"Station 29",address:"4560 Sheppard Ave E, Toronto, ON",lat:43.78913691711762,lng:-79.2629602053098},
        {id:"ems-toronto-ems-3311686",number:42,name:"Station 42, District 4 Office",shortName:"Station 42, District 4 Office",address:"1535 Kingston Rd, Toronto, ON",lat:43.688967036148306,lng:-79.26855090900895},
        {id:"ems-toronto-ems-3175714",number:47,name:"Station 47",shortName:"Station 47",address:"3600 St Clair Ave E, Toronto, ON",lat:43.718005193356724,lng:-79.25623717137962},
        {id:"ems-toronto-ems-2489114",number:10026,name:"26 Post",shortName:"26 Post",address:"5316 Lawrence Ave E, Toronto, ON",lat:43.777357054492995,lng:-79.14821464794156}
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
