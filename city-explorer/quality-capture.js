/** Opt-in repeatable visual evidence. No effect on normal gameplay. */
export const STATION_VIEWS = Object.freeze({
  '08': { lat: 44.30080, lon: -78.32212, altitude: 0.85, distance: 12, bearing: 90, pitch: 0, fov: 65 },
  '01': { lat: 44.3010, lon: -78.32212, altitude: 170, distance: 0.01, bearing: 180, pitch: -Math.PI / 2, fov: 50 },
  '02': { lat: 44.300893, lon: -78.322265, altitude: 2.0, distance: 32, bearing: 178, pitch: 0.03, fov: 52 },
  '03': { lat: 44.30088, lon: -78.32201, altitude: 2.0, distance: 29, bearing: 145, pitch: 0.025, fov: 52 },
  '04': { lat: 44.3010, lon: -78.32212, altitude: 48, distance: 90, bearing: 145, pitch: -0.45, fov: 52 },
});

export function installQualityCapture({ THREE, renderer, camera, state, project, terrainHeightAtWorld, stopMotion, overlay, lowPower, startedAt }) {
  const params = new URLSearchParams(location.search);
  if (!params.has('capture')) return null;
  const orthographic = ['06', '07'].includes(params.get('capture'));
  const view = STATION_VIEWS[orthographic ? '01' : params.get('capture')];
  if (view) {
    const target = project(view.lat, view.lon);
    const ground = terrainHeightAtWorld(target.x, target.y);
    const bearing = view.bearing * Math.PI / 180;
    state.mode = 'fly';
    stopMotion();
    camera.position.set(target.x + Math.sin(bearing) * view.distance, ground + view.altitude, target.y - Math.cos(bearing) * view.distance);
    state.yaw = Math.atan2(camera.position.x - target.x, camera.position.z - target.y);
    state.pitch = view.pitch;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }
  if (params.get('hud') !== '1') {
    const style = document.createElement('style');
    style.textContent = '#app > :not(canvas), #ptbo-build-badge { visibility:hidden !important; }';
    document.head.append(style);
  }
  const readyMs = performance.now() - startedAt;
  const mainCamera = camera;
  if (orthographic) {
    const halfHeight = 100;
    const halfWidth = halfHeight * innerWidth / innerHeight;
    camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.5, 27000);
    camera.position.copy(mainCamera.position);
    camera.rotation.copy(mainCamera.rotation);
    camera.updateMatrixWorld(true);
    if (overlay) overlay.visible = params.get('capture') === '07';
  }
  // Ground-level seam inspection must not inherit the fly controller's 5m floor.
  const groundInspection = params.get('capture') === '08';
  if (groundInspection) {
    camera = mainCamera.clone();
    camera.updateMatrixWorld(true);
  }
  const times = [];
  let previous = 0;
  let first = 0;
  const report = document.createElement('output');
  report.id = 'quality-capture-report';
  report.hidden = true;
  document.body.append(report);
  const capture = (now) => {
    if (document.hidden) { previous = 0; return; }
    if (!first) first = now;
    if (previous && now - first > 2000 && times.length < 3600) times.push(now - previous);
    previous = now;
    if (times.length && times.length % 60 === 0) {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      report.textContent = JSON.stringify({
        view: params.get('capture'), revision: params.get('revision') || 'working-tree', readyMs, profile: lowPower ? 'lite' : 'full',
        agl: camera.position.y - terrainHeightAtWorld(camera.position.x, camera.position.z),
        authoredTrees: Number(document.documentElement.dataset.authoredVegetationCount || 0),
        prototypeFacadeQuads: Number(document.documentElement.dataset.prototypeFacadeQuads || 0),
        samples: times.length, durationMs: times.reduce((a, b) => a + b, 0), medianFps: 1000 / median,
        p99FrameMs: sorted[Math.floor((sorted.length - 1) * 0.99)],
        camera: { position: camera.position.toArray(), rotation: camera.rotation.toArray(), fov: camera.fov, near: camera.near, far: camera.far },
        viewport: [innerWidth, innerHeight], pixelRatio: renderer.getPixelRatio(), theme: state.theme,
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length,
        userAgent: navigator.userAgent, metresPerUnit: 1, projection: orthographic ? 'orthographic' : 'perspective',
        orthoExtent: orthographic ? [camera.left, camera.right, camera.bottom, camera.top] : null,
      });
    }
  };
  capture.camera = orthographic || groundInspection ? camera : null;
  return capture;
}
