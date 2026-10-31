/* Richmond Hill uses Peterborough's shared dispatch, roads, routing and EMS phases. */
(() => {
  'use strict';
  const sourceUrl=new URL(document.currentScript.src,location.href);
  window.PTBO_PREVIEW_CITY_FACTORY.create({
    id:'richmond-hill',name:'Richmond Hill',canonicalRoster:true,sourceUrl,sources:{},
    map:{bounds:[[43.829270412593175,-79.48559824366056],[43.97754774129366,-79.3714957973409]],
      defaultCenter:[43.869213,-79.443971],defaultHeading:180,defaultZoom:15,minZoom:10,maxZoom:19,tabletBasemap:'local-streets'},
    dispatchDemo:{
      callIds:[
        'richmond-hill-odef-d61defca76ac3ff0cdd5',
        'richmond-hill-odhf-7ac6c9ca31a62fd196c319813a11c34b',
        'richmond-hill-osm-node-9831318505',
        'richmond-hill-osm-way-198690491',
        'richmond-hill-osm-node-4022932326',
      ],
      hospital:{id:'mackenzie-richmond-hill',main:'Medical',sub:'Hospital Transport',
        name:'Mackenzie Richmond Hill Hospital',addr:'10 Trench Street, Richmond Hill, ON',
        lat:43.870604105003956,lng:-79.4496262245536,radius:30,
        facilityLat:43.87037792541019,facilityLng:-79.45071040970561,
        // Modeled public-road approach on Trench Street; not a surveyed ambulance entrance.
        checkpointLat:43.870604105003956,checkpointLng:-79.4496262245536,checkpointRadius:30,
        areaLat:43.870604105003956,areaLng:-79.4496262245536,areaWidth:40,areaLength:40,areaRotation:0,
        sourceUrl:'https://www.mackenziehealth.ca/programs-services/emergency-and-urgent-care',
        approachType:'modeled-public-road-approach'},
    },
  });
})();
