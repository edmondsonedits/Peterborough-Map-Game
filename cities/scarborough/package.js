(() => {
  'use strict';
  const VERSION='1.6.10';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'scarborough',name:'Scarborough',
    map:{defaultCenter:[43.7764,-79.2318],defaultHeading:180,defaultZoom:14,minZoom:10,maxZoom:19,bounds:[[43.67,-79.34],[43.86,-79.11]]},
    sources:{
      fire:{type:'toronto-fire',scarborough:true,url:'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/3',outFields:'ID,ADDRESS,ADDRESS_NUMBER,LINEAR_NAME_FULL,LATITUDE,LONGITUDE,MUNICIPALITY_NAME,STATION'},
      ems:{type:'toronto-paramedic',scarborough:true,url:'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial25/FeatureServer/1',outFields:'*'}
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
