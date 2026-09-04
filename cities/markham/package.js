(() => {
  'use strict';
  const VERSION='1.6.12';
  const sourceUrl=new URL(document.currentScript?.src || location.href,location.href);
  const config={
    id:'markham',name:'Markham',
    map:{defaultCenter:[43.8561,-79.3370],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,bounds:[[43.78,-79.48],[44.00,-79.18]]},
    sources:{
      fire:{type:'york',url:'https://ww3.yorkmaps.ca/arcgis/rest/services/General/CommunityResources/MapServer/52',outFields:'NAME,ADDRESS',preferFallback:true,fallback:[
        {number:91,name:'Fire Station 91',shortName:'Stn 91',address:'7801 Bayview Avenue',lat:43.821718,lng:-79.401171},
        {number:92,name:'Fire Station 92',shortName:'Stn 92',address:'10 Riviera Drive',lat:43.831083,lng:-79.351242},
        {number:93,name:'Fire Station 93',shortName:'Stn 93',address:'2930 Major Mackenzie Drive E',lat:43.885918,lng:-79.369368},
        {number:94,name:'Fire Station 94',shortName:'Stn 94',address:'7300 Birchmount Road',lat:43.831576,lng:-79.318904},
        {number:95,name:'Fire Station 95',shortName:'Stn 95',address:'316 Main Street, Unionville',lat:43.876076,lng:-79.314012},
        {number:96,name:'Fire Station 96',shortName:'Stn 96',address:'5567 14th Avenue',lat:43.851351,lng:-79.269364},
        {number:97,name:'Fire Station 97',shortName:'Stn 97',address:'209 Main Street, Markham',lat:43.882712,lng:-79.261517},
        {number:98,name:'Fire Station 98',shortName:'Stn 98',address:'650 Bur Oak Avenue',lat:43.895474,lng:-79.289771},
        {number:99,name:'Fire Station 99',shortName:'Stn 99',address:'3255 Bur Oak Avenue',lat:43.883761,lng:-79.227663}
      ]},
      ems:{type:'york',url:'https://ww3.yorkmaps.ca/arcgis/rest/services/General/CommunityResources/MapServer/21',outFields:'NAME,ADDRESS',preferFallback:true,fallback:[
        {number:23,name:'Paramedic Station 23',shortName:'Base 23',address:'280 Church Street',lat:43.884676,lng:-79.235752},
        {number:24,name:'Paramedic Station 24',shortName:'Base 24',address:'316 Main Unionville Street North',lat:43.876076,lng:-79.314012},
        {number:25,name:'Paramedic Station 25',shortName:'Base 25',address:'5600 14th Avenue',lat:43.852243,lng:-79.268530},
        {number:26,name:'Paramedic Station 26',shortName:'Base 26',address:'10 Riviera Drive',lat:43.831083,lng:-79.351242},
        {number:27,name:'Paramedic Station 27',shortName:'Base 27',address:'180 Cachet Woods Court',lat:43.869543,lng:-79.374105},
        {number:29,name:'Paramedic Station 29',shortName:'Base 29',address:'107 Glen Cameron Road',lat:43.807394,lng:-79.411562}
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
