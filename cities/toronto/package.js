(() => {
  'use strict';
  const VERSION='1.6.11';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'toronto',name:'Toronto',
    map:{defaultCenter:[43.7001,-79.4163],defaultHeading:180,defaultZoom:14,minZoom:10,maxZoom:19,bounds:[[43.58,-79.65],[43.86,-79.10]]},
    sources:{
      fire:{type:'toronto-fire',url:'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/3',outFields:'ID,ADDRESS,ADDRESS_NUMBER,LINEAR_NAME_FULL,LATITUDE,LONGITUDE,MUNICIPALITY_NAME,STATION',preferFallback:true,fallback:[
        {number:111,name:'Station 111',shortName:'Stn 111',address:'3300 Bayview Ave',lat:43.790136,lng:-79.393659},
        {number:221,name:'Station 221',shortName:'Stn 221',address:'2575 Eglinton Ave E',lat:43.734799,lng:-79.255066},
        {number:245,name:'Station 245',shortName:'Stn 245',address:'1600 Birchmount Rd',lat:43.762700,lng:-79.291522},
        {number:314,name:'Station 314',shortName:'Stn 314',address:'12 Grosvenor St',lat:43.663057,lng:-79.384662},
        {number:333,name:'Station 333',shortName:'Stn 333',address:'207 Front St E',lat:43.650521,lng:-79.366154},
        {number:411,name:'Station 411',shortName:'Stn 411',address:'75 Toryork Dr',lat:43.755258,lng:-79.549165},
        {number:435,name:'Station 435',shortName:'Stn 435',address:'130 Eighth St',lat:43.601119,lng:-79.506970},
        {number:443,name:'Station 443',shortName:'Stn 443',address:'1724 Islington Ave',lat:43.678080,lng:-79.538557}
      ]},
      ems:{type:'toronto-paramedic',url:'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1',outFields:'*',preferFallback:true,fallback:[
        {number:10,name:'Ambulance Station 10',shortName:'Base 10',address:'2015 Lawrence Ave W',lat:43.700599,lng:-79.512384},
        {number:18,name:'Ambulance Station 18',shortName:'Base 18',address:'643 Eglinton Ave W',lat:43.702661,lng:-79.416654},
        {number:20,name:'Ambulance Station 20',shortName:'Base 20',address:'2430 Lawrence Ave E',lat:43.750897,lng:-79.271360},
        {number:24,name:'Ambulance Station 24',shortName:'Base 24',address:'3061 Birchmount Rd',lat:43.802797,lng:-79.308158},
        {number:31,name:'Ambulance Station 31',shortName:'Base 31',address:'4219 Dundas St W',lat:43.659827,lng:-79.511967},
        {number:40,name:'Ambulance Station 40',shortName:'Base 40',address:'58 Richmond St E',lat:43.652430,lng:-79.376672},
        {number:46,name:'Ambulance Station 46',shortName:'Base 46',address:'105 Cedarvale Ave',lat:43.687089,lng:-79.310712},
        {number:54,name:'Ambulance Station 54',shortName:'Base 54',address:'4135 Bathurst St',lat:43.747623,lng:-79.436120}
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
