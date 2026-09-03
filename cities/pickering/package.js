(() => {
  'use strict';
  const VERSION='1.6.7';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'pickering',name:'Pickering',
    map:{defaultCenter:[43.8358,-79.0890],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.78,-79.22],[44.02,-78.96]]},
    sources:{
      fire:{type:'static',entries:[
        {number:1,name:'Headquarters Fire Station 1',shortName:'Stn 1',address:'1700 Zents Drive'},
        {number:2,name:'Fire Station 2',shortName:'Stn 2',address:'553 Kingston Road'},
        {number:4,name:'Fire Station 4',shortName:'Stn 4',address:'4941 Old Brock Road'},
        {number:5,name:'Fire Station 5',shortName:'Stn 5',address:'1616 Bayly Street'},
        {number:6,name:'Fire Station 6',shortName:'Stn 6',address:'1115 Finch Avenue'}
      ]},
      ems:{type:'durham-paramedic',municipality:'PICKERING',url:'https://maps.durham.ca/arcgis/rest/services/Open_Data/Durham_OpenData/MapServer/9',outFields:'NAME,ADDRESS,TOWN,MUNICIPALITY,POSTAL_CODE'}
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
  const script=document.createElement('script');script.src=factoryUrl;script.onload=start;script.onerror=()=>console.error('Unable to load preview city package factory.');document.head.appendChild(script);
})();
