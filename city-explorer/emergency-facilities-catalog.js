import emsArmour from './assets/ems-armour/layout.json?v=1.6.143' with {type:'json'};
import emsClonsilla from './assets/ems-clonsilla/layout.json?v=1.6.143' with {type:'json'};
import stationOne from './assets/station1/layout.json?v=1.6.143' with {type:'json'};
import stationTwo from './assets/station2/layout.json?v=1.6.143' with {type:'json'};
import stationThree from './assets/station3/layout.json?v=1.6.143' with {type:'json'};

const origin = layout => ({lat:layout.site.anchorLat,lon:layout.site.anchorLon,yawDegrees:layout.site.rotationYDegrees});
const rectangle = (minX,maxX,frontZ,rearZ) => [[minX,frontZ],[maxX,frontZ],[maxX,rearZ],[minX,rearZ]];
export function emergencyFacilityEntries({stationOneSelected=false,stationTwoSelected=false,stationThreeManaged=false}={}) {
  const entries=[];
  if(!stationOneSelected) entries.push({
    id:'station1',rootName:'Station1_Root',assetUrl:new URL('./assets/station1/station1.glb?v=1.6.143',import.meta.url).href,
    origin:origin(stationOne),sourceIds:[stationOne.site.candidateReplacementOsmId,...stationOne.site.additionalReplacementSourceIds],
    footprint:rectangle(stationOne.trainingTower.minX,stationOne.bay.maxX,-5.5,stationOne.trainingTower.rearZ),
    groundSampleBounds:stationOne.bay,floorOffset:.1,maxHeight:20,foundationVolumes:[stationOne.bay,stationOne.wing],
    terrainChild:{name:'Station1_TrainingTower',x:(stationOne.trainingTower.minX+stationOne.trainingTower.maxX)/2,z:(stationOne.trainingTower.frontZ+stationOne.trainingTower.rearZ)/2},
  });
  if(!stationTwoSelected) entries.push({
    id:'station2',rootName:'Station2_Root',assetUrl:new URL('./assets/station2/station2.glb?v=1.6.143',import.meta.url).href,
    origin:origin(stationTwo),sourceIds:[stationTwo.site.candidateReplacementOsmId],
    footprint:rectangle(stationTwo.wing.minX,stationTwo.tower.maxX,0,stationTwo.wing.rearZ),
    groundSampleBounds:stationTwo.bay,floorOffset:.1,maxHeight:16,foundationVolumes:[stationTwo.bay,stationTwo.wing,stationTwo.tower,stationTwo.sideAnnex],
  });
  if(!stationThreeManaged) entries.push({...stationThree,rootName:'Station3_Root',maxHeight:15,assetUrl:new URL('./assets/station3/station3.glb?v=1.6.143',import.meta.url).href});
  entries.push({...emsArmour,rootName:'EMSArmour_Root',maxHeight:10,assetUrl:new URL('./assets/ems-armour/ems-armour.glb?v=1.6.143',import.meta.url).href});
  entries.push({...emsClonsilla,rootName:'EMSClonsilla_Root',maxHeight:10,assetUrl:new URL('./assets/ems-clonsilla/ems-clonsilla.glb?v=1.6.143',import.meta.url).href});
  return entries;
}
