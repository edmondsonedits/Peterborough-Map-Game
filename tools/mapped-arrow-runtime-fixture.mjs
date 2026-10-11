import fs from 'node:fs';
import { selectMappedArrowSupportIndex } from '../city-explorer/fallback-arrow-support.js';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { mappedTurnLaneGroups } from '../city-explorer/city-detail-rules.js';
import { mappedArrowLaneOffsets, mappedArrowTriangles, drapeMappedArrowTriangles, mappedArrowSupport } from '../city-explorer/mapped-arrow-paint.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const quaternionSource=app.match(/^function setRoadQuaternion\([^]*?^\}/m)[0];
export function arrowRuntime(index) {
  const state={objectCount:0,renderedPavementIndex:index,roadPaintRanges:new Map()};
  const generatedRoadMeshes=new Map(),streetscapeGroup=new THREE.Group();
  const env={THREE,state,generatedRoadMeshes,streetscapeGroup,roadGroup:new THREE.Group(),selectMappedArrowSupportIndex,lowPowerProfile:false,mappedTurnLaneGroups,mappedArrowLaneOffsets,
    mappedArrowTriangles,drapeMappedArrowTriangles,mappedArrowSupport,
    materials:{roadPaintWhite:new THREE.MeshBasicMaterial({color:0xffffff})},
    document:{documentElement:{dataset:{}}},worldUp:new THREE.Vector3(0,1,0),
    roadSide:new THREE.Vector3(),roadSurfaceNormal:new THREE.Vector3(),roadBasis:new THREE.Matrix4()};
  const run=Function(...Object.keys(env),quaternionSource+'\n'+app.match(/^function buildMappedTurnArrows\([^]*?^\}/m)[0]+';return buildMappedTurnArrows')(...Object.values(env));
  return {run,state,generatedRoadMeshes,streetscapeGroup};
}
