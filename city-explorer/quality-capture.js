/** Opt-in repeatable visual evidence. No effect on normal gameplay. */
import { CAPTURE_SCHEMA_VERSION, CITY_ID, STATION_VIEWS, validateCapture } from './capture-contract.js';
export { STATION_VIEWS };

export function installQualityCapture({ THREE, renderer, camera, state, project, terrainHeightAtWorld, stopMotion, preparePlayerSpawn, overlay, lowPower, startedAt, lighting }) {
  const params = new URLSearchParams(location.search);
  if (!params.has('capture')) return null;
  const viewId = params.get('capture');
  const definition = STATION_VIEWS[viewId];
  if (!definition) throw new Error(`Unknown capture view: ${viewId}`);
  const orthographic = definition.projection === 'orthographic';
  const view = definition.baseView ? STATION_VIEWS[definition.baseView] : definition;
  if (view.spawn) {
    if (!preparePlayerSpawn?.()) throw new Error('Capture requires Station 1 player spawn');
  } else {
    const target = project(view.lat, view.lon);
    const ground = terrainHeightAtWorld(target.x, target.y);
    const bearing = view.bearing * Math.PI / 180;
    state.mode = 'fly';
    camera.position.set(target.x + Math.sin(bearing) * view.distance, ground + view.altitude, target.y - Math.cos(bearing) * view.distance);
    state.yaw = Math.atan2(camera.position.x - target.x, camera.position.z - target.y);
    state.pitch = view.pitch;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }
  stopMotion();
  if (params.get('hud') !== '1') {
    const style = document.createElement('style');
    style.textContent = '#app > :not(canvas), #ptbo-build-badge { visibility:hidden !important; }';
    document.head.append(style);
  }
  const readyMs = performance.now() - startedAt;
  const mainCamera = camera;
  if (orthographic) {
    const halfHeight = definition.halfHeight;
    const halfWidth = halfHeight * innerWidth / innerHeight;
    camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.5, 27000);
    camera.position.copy(mainCamera.position);
    camera.rotation.copy(mainCamera.rotation);
  } else camera = mainCamera.clone();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  if (overlay) overlay.visible = Boolean(definition.overlay);
  const times = [];
  let previous = 0;
  let first = 0;
  let measuring = !params.has('managedCapture');
  let locked = null;
  const errors = [];
  addEventListener('error', event => errors.push(String(event.message || 'Resource error')), true);
  addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  const report = document.createElement('output');
  report.id = 'quality-capture-report';
  report.hidden = true;
  document.body.append(report);
  const readiness = () => {
    const survey = document.documentElement.dataset.semanticSurveyStatus === 'ready';
    const authoredTrees = Number(document.documentElement.dataset.authoredVegetationCount || 0);
    const overlayLoaded = Boolean(overlay?.material?.map?.image?.width);
    // The overlay is fetched even when hidden: include it in every content receipt.
    return {ready:survey && authoredTrees>0 && overlayLoaded,survey,authoredTrees,overlayLoaded};
  };
  const snapshot = () => {
    const sorted = [...times].sort((a,b)=>a-b);
    const median = sorted[Math.floor(sorted.length/2)];
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      schemaVersion:CAPTURE_SCHEMA_VERSION, cityId:CITY_ID, scenarioId:`station-one-${viewId}`, view:viewId, viewName:definition.name,
      revision:params.get('revision') || 'working-tree', build:{...window.PTBO_BUILD},
      renderer:{revision:THREE.REVISION,backend:'WebGL',gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null},
      readyMs, profile:lowPower?'lite':'full', requestedProfile:params.get('lite')==='1'?'lite':'full',
      clock:{mode:'frozen-scene',simulationTimeMs:0,fixedTickReplay:false},
      state:{mode:state.mode,gameplay:window.__PTBO_GAMEPLAY__?.state?.(),lod:document.documentElement.dataset.cityDetailLod},
      agl:camera.position.y-terrainHeightAtWorld(camera.position.x,camera.position.z),
      authoredTrees:Number(document.documentElement.dataset.authoredVegetationCount||0),
      prototypeFacadeQuads:Number(document.documentElement.dataset.prototypeFacadeQuads||0),
      samples:times.length,durationMs:times.reduce((a,b)=>a+b,0),medianFps:median?1000/median:null,p99FrameMs:sorted[Math.floor((sorted.length-1)*.99)]??null,
      camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),rotation:camera.rotation.toArray(),fov:orthographic?null:camera.fov,near:camera.near,far:camera.far,projectionMatrix:camera.projectionMatrix.toArray(),matrixWorld:camera.matrixWorld.toArray()},
      viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio(),crop:{x:0,y:0,width:innerWidth,height:innerHeight,units:'CSS pixels'},
      theme:state.theme,lighting:lighting(),readiness:readiness(),errors:[...errors,...(window.PTBO_BUILD_ERRORS||[])],
      render:{...renderer.info.render},memory:{...renderer.info.memory},programs:renderer.info.programs?.length,
      memoryUnits:'Three.js object counts; GPU bytes unavailable',userAgent:navigator.userAgent,
      units:{worldAxes:'X east, Y up, Z south',rotation:'radians; quaternion x/y/z/w',geographic:'WGS84 degrees; project() local city origin'},metresPerUnit:1,
      projection:definition.projection,orthoExtent:orthographic?[camera.left,camera.right,camera.bottom,camera.top]:null,
    };
  };
  const capture = now => {
    if (document.hidden) {previous=0;return;}
    if (!first) first=now;
    if (!locked && measuring && previous && now-first>2000) times.push(now-previous);
    previous=now;
    if (!locked && (times.length%30===0 || !report.textContent)) report.textContent=JSON.stringify(snapshot());
  };
  capture.camera=camera;
  window.__PTBO_CAPTURE__=Object.freeze({
    readiness,
    beginSample() { if (!readiness().ready) throw new Error('Required capture content not ready'); times.length=0; previous=0; first=0; measuring=true; },
    inspect:snapshot,
    lock(captureId) { const value=snapshot(); validateCapture(value); locked={...value,captureId}; report.textContent=JSON.stringify(locked); return locked; },
  });
  return capture;
}
