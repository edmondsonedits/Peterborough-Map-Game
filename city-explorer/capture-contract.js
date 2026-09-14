/** Evidence contract only; no replay, physics, or geographic-accuracy claim. */
export const CAPTURE_SCHEMA_VERSION = 1;
export const CITY_ID = 'peterborough-on-ca';
export const STATION_VIEWS = Object.freeze({
  '01': { name:'aerial-footprint-yard', projection:'perspective', lat:44.3010, lon:-78.32212, altitude:170, distance:0.01, bearing:180, pitch:-Math.PI/2, fov:50 },
  '02': { name:'apparatus-facade', projection:'perspective', lat:44.300893, lon:-78.322265, altitude:2, distance:32, bearing:178, pitch:0.03, fov:52 },
  '03': { name:'public-entry', projection:'perspective', lat:44.30088, lon:-78.32201, altitude:2, distance:29, bearing:145, pitch:0.025, fov:52 },
  '04': { name:'yard-road-context', projection:'perspective', lat:44.3010, lon:-78.32212, altitude:48, distance:90, bearing:145, pitch:-0.45, fov:52 },
  '05': { name:'station-one-player-spawn', projection:'perspective', spawn:'FIRE_STATION_ONE', mode:'onFoot', yaw:0, pitch:-0.19, cameraDistanceScale:1, fov:58 },
  '06': { name:'orthographic-footprint', projection:'orthographic', baseView:'01', halfHeight:100, overlay:false },
  '07': { name:'orthophoto-alignment', projection:'orthographic', baseView:'01', halfHeight:100, overlay:true },
  '08': { name:'ground-seam-inspection', projection:'perspective', lat:44.30080, lon:-78.32212, altitude:0.85, distance:12, bearing:90, pitch:0, fov:65 },
});
export function validateCapture(record, { complete=false } = {}) {
  const fail = message => { throw new Error(`Capture contract: ${message}`); };
  const required = (value, message) => { if (!value) fail(message); };
  const finite = (values, message) => required(Array.isArray(values) && values.length > 0 && values.every(Number.isFinite), message);
  required(record?.schemaVersion === CAPTURE_SCHEMA_VERSION, 'schema version');
  required(record.cityId === CITY_ID && STATION_VIEWS[record.view], 'city/view ID');
  required(record.projection === STATION_VIEWS[record.view].projection, 'projection/view mismatch');
  required(record.build?.version && record.build.cityRuntimeVersion && record.renderer?.revision, 'loaded build identity');
  required(['full','lite'].includes(record.profile), 'profile');
  required(record.clock?.mode === 'frozen-scene' && record.clock.simulationTimeMs === 0 && record.clock.fixedTickReplay === false, 'clock semantics');
  required(record.metresPerUnit === 1 && record.units?.worldAxes === 'X east, Y up, Z south', 'units');
  finite(record.camera?.position, 'camera position');
  finite(record.camera?.quaternion, 'camera quaternion');
  finite(record.camera?.projectionMatrix, 'projection matrix');
  finite([record.camera?.near,record.camera?.far], 'clip planes');
  required(record.camera.near > 0 && record.camera.far > record.camera.near, 'clip range');
  finite(record.viewport, 'viewport');
  required(record.viewport.length === 2 && record.viewport.every(v=>v>0) && record.pixelRatio > 0 && Number.isFinite(record.pixelRatio), 'viewport dimensions/DPR');
  if (record.projection === 'perspective') required(Number.isFinite(record.camera.fov) && record.camera.fov>0 && record.camera.fov<180, 'FOV');
  else { finite(record.orthoExtent, 'orthographic extent'); required(record.orthoExtent[0]<record.orthoExtent[1] && record.orthoExtent[2]<record.orthoExtent[3], 'orthographic bounds'); }
  required(record.readiness?.ready === true && record.errors?.length === 0, 'required content/readiness/errors');
  if (complete) {
    required(record.captureId && record.stateHash && record.content?.hash && record.content.resources?.length && record.evidence?.png && record.evidence.json && record.evidence.pngSha256, 'evidence/content identity');
    required(record.content.resources.every(r=>r.sha256 && r.status >=200 && r.status<400), 'loaded resource identity');
    finite([record.samples,record.durationMs,record.medianFps,record.p99FrameMs], 'performance');
    required(record.samples>0 && record.durationMs >= (record.view==='05' ? 30000 : 2000), 'sample duration');
  }
  return true;
}
