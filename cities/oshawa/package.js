(() => {
  'use strict';
  const VERSION='1.6.9';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'oshawa',name:'Oshawa',
    map:{defaultCenter:[43.8971,-78.8658],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.83,-78.98],[44.01,-78.76]]},
    sources:{
      fire:{type:'static',entries:[
        {number:1,name:'Fire Station 1',shortName:'Stn 1',address:'199 Adelaide Ave W'},
        {number:2,name:'Fire Station 2',shortName:'Stn 2',address:'1111 Simcoe St S'},
        {number:3,name:'Fire Station 3',shortName:'Stn 3',address:'50 Beatrice St E'},
        {number:4,name:'Fire Station 4',shortName:'Stn 4',address:'50 Harmony Rd N'},
        {number:5,name:'Fire Station 5',shortName:'Stn 5',address:'1550 Harmony Rd N'},
        {number:6,name:'Fire Station 6',shortName:'Stn 6',address:'2339 Simcoe St N'}
      ]},
      ems:{type:'durham-paramedic',municipality:'OSHAWA',url:'https://maps.durham.ca/arcgis/rest/services/Open_Data/Durham_OpenData/MapServer/9',outFields:'NAME,ADDRESS,TOWN,MUNICIPALITY,POSTAL_CODE'}
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
