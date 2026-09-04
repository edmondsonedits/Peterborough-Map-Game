(() => {
  'use strict';
  const VERSION='1.6.13';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'scarborough',name:'Scarborough',
    map:{defaultCenter:[43.7764,-79.2318],defaultHeading:180,defaultZoom:14,minZoom:10,maxZoom:19,bounds:[[43.67,-79.34],[43.86,-79.11]]},
    sources:{
      fire:{type:'toronto-fire',scarborough:true,url:'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/3',outFields:'ID,ADDRESS,ADDRESS_NUMBER,LINEAR_NAME_FULL,LATITUDE,LONGITUDE,MUNICIPALITY_NAME,STATION',preferFallback:true,fallback:[
        {number:221,name:'Station 221',shortName:'Stn 221',address:'2575 Eglinton Ave E',lat:43.734799,lng:-79.255066},
        {number:231,name:'Station 231',shortName:'Stn 231',address:'740 Markham Rd',lat:43.764653,lng:-79.227791},
        {number:243,name:'Station 243',shortName:'Stn 243',address:'4560 Sheppard Ave E',lat:43.789146,lng:-79.262963},
        {number:212,name:'Station 212',shortName:'Stn 212',address:'8500 Sheppard Ave E',lat:43.804906,lng:-79.188741},
        {number:215,name:'Station 215',shortName:'Stn 215',address:'5318 Lawrence Ave E',lat:43.777392,lng:-79.148066},
        {number:245,name:'Station 245',shortName:'Stn 245',address:'1600 Birchmount Rd',lat:43.762700,lng:-79.291522}
      ]},
      ems:{type:'toronto-paramedic',scarborough:true,url:'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1',outFields:'*',preferFallback:true,fallback:[
        {number:20,name:'Ambulance Station 20',shortName:'Base 20',address:'2430 Lawrence Ave E',lat:43.750897,lng:-79.271360},
        {number:21,name:'Ambulance Station 21',shortName:'Base 21',address:'887 Pharmacy Ave',lat:43.729554,lng:-79.298529},
        {number:22,name:'Ambulance Station 22',shortName:'Base 22',address:'3100 Eglinton Ave E',lat:43.742000,lng:-79.226258},
        {number:24,name:'Ambulance Station 24',shortName:'Base 24',address:'3061 Birchmount Rd',lat:43.802797,lng:-79.308158},
        {number:26,name:'Ambulance Station 26',shortName:'Base 26',address:'4331 Lawrence Ave E',lat:43.770827,lng:-79.174053},
        {number:27,name:'Ambulance Station 27',shortName:'Base 27',address:'900 Tapscott Rd',lat:43.823993,lng:-79.242870}
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
