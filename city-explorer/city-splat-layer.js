/**
 * Optional Gaussian-splat landmark layer for the Peterborough City Explorer.
 *
 * The conventional GIS city remains authoritative. This module only streams
 * licensed visual captures near configured landmarks and can be removed or
 * disabled without changing terrain, roads, water, buildings, or navigation.
 *
 * Coordinate contract:
 * - geographic anchors use WGS84 latitude/longitude and CGVD2013 metres
 * - city local space is +X east, +Y up, +Z south
 * - heading is clockwise from true north; Three.js yaw is therefore -heading
 * - each capture's authored local convention is recorded in the manifest
 */

export const SPLAT_STATES = Object.freeze([
  'enabled', 'unavailable', 'loading', 'ready', 'failed', 'disabled',
]);

const REQUIRED_PILOT_IDS = Object.freeze([
  'peterborough-lift-lock',
  'downtown-george-street',
  'del-crary-little-lake',
  'trent-university',
  'canadian-canoe-museum',
]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const radians = (degrees) => Number(degrees || 0) * Math.PI / 180;

export function geographicToCityLocal(lat, lon, origin = { lat: 44.3091, lon: -78.3197 }) {
  const latScale = 110540;
  const lonScale = 111320 * Math.cos(radians(origin.lat));
  return {
    x: (Number(lon) - Number(origin.lon)) * lonScale,
    z: -(Number(lat) - Number(origin.lat)) * latScale,
  };
}

export function splatDistanceOpacity(distance, fadeInDistance, fadeOutDistance) {
  const near = Number(fadeInDistance);
  const far = Number(fadeOutDistance);
  if (!Number.isFinite(distance) || !Number.isFinite(near) || !Number.isFinite(far) || far <= near) return 0;
  return clamp((far - distance) / (far - near), 0, 1);
}

export function chooseSplatBudget(profile = {}, manifest = {}) {
  const budgets = manifest?.runtime?.visibleSplatBudget || {};
  if (profile.unsupported) return 0;
  if (profile.lowPower || profile.mobile) return Number(budgets.mobile || 750000);
  if (profile.mediumPower) return Number(budgets.medium || 1400000);
  return Number(budgets.desktop || 2200000);
}

export function validateSplatManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return { valid: false, errors: ['Manifest must be an object.'] };
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (!Array.isArray(manifest.pilots)) errors.push('pilots must be an array.');
  const ids = new Set();
  for (const pilot of manifest.pilots || []) {
    if (!pilot?.id || ids.has(pilot.id)) errors.push(`Pilot ID is missing or duplicated: ${pilot?.id || '(empty)'}.`);
    ids.add(pilot?.id);
    if (!pilot?.name) errors.push(`${pilot?.id || 'Pilot'} is missing a display name.`);
    if (!Number.isFinite(Number(pilot?.anchor?.latitude)) || !Number.isFinite(Number(pilot?.anchor?.longitude))) {
      errors.push(`${pilot?.id || 'Pilot'} has an invalid geographic anchor.`);
    }
    if (!['spz', 'rad'].includes(String(pilot?.format || '').toLowerCase())) errors.push(`${pilot?.id || 'Pilot'} must use SPZ or RAD.`);
    for (const key of ['activationRadius', 'fadeInDistance', 'fadeOutDistance', 'unloadRadius']) {
      if (!(Number(pilot?.streaming?.[key]) > 0)) errors.push(`${pilot?.id || 'Pilot'} has invalid ${key}.`);
    }
    const stream = pilot?.streaming || {};
    if (Number(stream.fadeInDistance) >= Number(stream.fadeOutDistance)) errors.push(`${pilot?.id || 'Pilot'} fade distances are reversed.`);
    if (Number(stream.activationRadius) > Number(stream.unloadRadius)) errors.push(`${pilot?.id || 'Pilot'} unloadRadius must cover activationRadius.`);
    if (!pilot?.licence?.status) errors.push(`${pilot?.id || 'Pilot'} is missing licence status.`);
    if (pilot?.asset && pilot?.licence?.status !== 'approved') errors.push(`${pilot?.id || 'Pilot'} cannot load an asset without approved licensing.`);
  }
  for (const requiredId of REQUIRED_PILOT_IDS) {
    if (!ids.has(requiredId)) errors.push(`Required pilot is missing: ${requiredId}.`);
  }
  return { valid: errors.length === 0, errors };
}

export function rankSplatCandidates(pilots, positions, activeIds = new Set(), maximum = 2) {
  return pilots
    .map((pilot) => {
      const position = positions.get(pilot.id);
      if (!position) return null;
      const distance = Math.hypot(position.cameraX - position.anchorX, position.cameraZ - position.anchorZ);
      const isActive = activeIds.has(pilot.id);
      const radius = isActive ? Number(pilot.streaming.unloadRadius) : Number(pilot.streaming.activationRadius);
      if (distance > radius || pilot.enabled === false || !pilot.asset) return null;
      return { pilot, distance, isActive };
    })
    .filter(Boolean)
    .sort((a, b) => (Number(b.pilot.loadingPriority || 0) - Number(a.pilot.loadingPriority || 0)) || (a.distance - b.distance))
    .slice(0, Math.max(0, maximum));
}

export function buildSplatPlacement(pilot, project, terrainHeightAtWorld, terrainBaseElevation = 0) {
  const projected = project(Number(pilot.anchor.latitude), Number(pilot.anchor.longitude));
  const x = Number(projected.x);
  const z = Number(projected.z ?? projected.y);
  const datum = Number(pilot.anchor.elevationMetresCGVD2013);
  const terrainY = Number(terrainHeightAtWorld(x, z));
  const y = (Number.isFinite(datum) ? datum - Number(terrainBaseElevation || 0) : terrainY)
    + Number(pilot.anchor.verticalOffset || 0);
  return {
    position: { x, y, z },
    rotation: {
      x: radians(pilot.transform?.pitchDeg),
      y: -radians(pilot.transform?.headingDeg),
      z: -radians(pilot.transform?.rollDeg),
    },
    scale: Number(pilot.transform?.scale || 1),
  };
}

function storageRead(key, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value === null || value === undefined ? fallback : value;
  } catch { return fallback; }
}

function storageWrite(key, value) {
  try { globalThis.localStorage?.setItem(key, String(value)); } catch { /* Privacy mode can disable storage. */ }
}

function deviceProfile(renderer, lowPowerProfile) {
  const revision = Number.parseInt(renderer?.constructor ? globalThis.__THREE_REVISION__ || '0' : '0', 10);
  const mobile = globalThis.matchMedia?.('(pointer: coarse)').matches || (globalThis.innerWidth || 1200) < 760;
  const memory = Number(globalThis.navigator?.deviceMemory || 0);
  return {
    webgl2: Boolean(renderer?.capabilities?.isWebGL2),
    revision,
    mobile,
    lowPower: Boolean(lowPowerProfile || (memory > 0 && memory <= 4)),
    mediumPower: memory > 0 && memory <= 8,
    unsupported: !renderer?.capabilities?.isWebGL2,
  };
}

function assetState(pilot, globallyEnabled) {
  if (!globallyEnabled || pilot.enabled === false) return 'disabled';
  if (!pilot.asset || pilot.licence?.status !== 'approved') return 'unavailable';
  return 'enabled';
}

export class CitySplatLayer {
  constructor({
    THREE, scene, renderer, camera, project, terrainHeightAtWorld,
    getTerrainBaseElevation = () => 0,
    manifestUrl = './data/splats/manifest.json',
    moduleSpecifier = '@sparkjsdev/spark',
    lowPowerProfile = false,
    onStatus = () => {},
    debugElement = null,
  }) {
    this.THREE = THREE;
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.project = project;
    this.terrainHeightAtWorld = terrainHeightAtWorld;
    this.getTerrainBaseElevation = getTerrainBaseElevation;
    this.manifestUrl = manifestUrl;
    this.moduleSpecifier = moduleSpecifier;
    this.onStatus = onStatus;
    this.debugElement = debugElement;
    globalThis.__THREE_REVISION__ = THREE?.REVISION;
    this.profile = deviceProfile(renderer, lowPowerProfile);
    this.profile.revision = Number.parseInt(THREE?.REVISION || '0', 10);
    if (this.profile.revision < 180) this.profile.unsupported = true;
    this.enabled = storageRead('ptbo-city-splats', 'true') !== 'false';
    this.debug = new URLSearchParams(globalThis.location?.search || '').get('splatCalibration') === '1';
    this.environmentOpacity = 1;
    this.manifest = null;
    this.runtime = null;
    this.sparkRenderer = null;
    this.records = new Map();
    this.debugGroup = null;
    this.lastUpdate = 0;
    this.disposed = false;
    this.stats = {
      supported: !this.profile.unsupported,
      enabled: this.enabled,
      loaded: 0,
      visible: 0,
      visibleSplats: 0,
      approximateBytes: 0,
      budget: 0,
      status: 'initializing',
    };
  }

  async initialize() {
    try {
      const response = await fetch(new URL(this.manifestUrl, import.meta.url), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Splat manifest returned ${response.status}`);
      const manifest = await response.json();
      const validation = validateSplatManifest(manifest);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      this.manifest = manifest;
      this.stats.budget = chooseSplatBudget(this.profile, manifest);
      this.createRecords();
      this.createCalibrationGeometry();
      this.stats.status = this.profile.unsupported ? 'unsupported' : 'ready';
      this.publish();
      const preflight = new URLSearchParams(globalThis.location?.search || '').get('splatPreflight') === '1';
      if (preflight && !this.profile.unsupported) await this.preflightSpark();
      return this.stats;
    } catch (error) {
      console.warn('Optional captured-detail layer is unavailable; procedural city remains active.', error);
      this.stats.status = 'failed';
      this.stats.error = String(error?.message || error);
      this.publish();
      return this.stats;
    }
  }

  createRecords() {
    this.records.clear();
    for (const pilot of this.manifest.pilots) {
      const placement = buildSplatPlacement(pilot, this.project, this.terrainHeightAtWorld, this.getTerrainBaseElevation());
      this.records.set(pilot.id, {
        pilot,
        placement,
        state: this.profile.unsupported ? 'disabled' : assetState(pilot, this.enabled),
        mesh: null,
        controller: null,
        assetBytes: 0,
        distance: Infinity,
        opacity: 0,
        error: '',
      });
    }
  }

  async ensureRuntime() {
    if (this.runtime) return this.runtime;
    if (this.profile.unsupported) throw new Error('Spark requires WebGL2 and Three.js r180 or newer.');
    this.runtime = await import(this.moduleSpecifier);
    if (!this.runtime?.SparkRenderer || !this.runtime?.SplatMesh) throw new Error('Spark module did not expose the required renderer classes.');
    return this.runtime;
  }

  async preflightSpark() {
    try {
      await this.ensureRuntime();
      this.stats.preflight = 'passed';
    } catch (error) {
      this.stats.preflight = 'failed';
      this.stats.error = String(error?.message || error);
    }
    this.publish();
    return this.stats.preflight;
  }

  ensureSparkRenderer() {
    if (this.sparkRenderer) return this.sparkRenderer;
    const { SparkRenderer } = this.runtime;
    this.sparkRenderer = new SparkRenderer({
      renderer: this.renderer,
      clock: undefined,
      depthTest: true,
      depthWrite: false,
      enableLod: true,
      lodSplatCount: this.stats.budget,
      lodSplatScale: 1,
      lodRenderScale: this.profile.lowPower ? 2.2 : 1.35,
      pagedExtSplats: true,
      coneFov0: 86,
      coneFov: 122,
      coneFoveate: 0.38,
      behindFoveate: 0.14,
    });
    this.sparkRenderer.name = 'Peterborough captured-detail renderer';
    this.scene.add(this.sparkRenderer);
    return this.sparkRenderer;
  }

  async loadRecord(record) {
    if (!record || record.mesh || record.state === 'loading' || !record.pilot.asset) return;
    record.state = 'loading';
    record.error = '';
    record.controller = new AbortController();
    this.publish();
    try {
      await this.ensureRuntime();
      if (record.controller.signal.aborted) return;
      this.ensureSparkRenderer();
      const { SplatMesh } = this.runtime;
      const assetUrl = new URL(record.pilot.asset, new URL(this.manifestUrl, import.meta.url));
      const options = {
        lod: true,
        lodScale: Number(record.pilot.lod?.scale || 1),
        enableLod: true,
        paged: record.pilot.format === 'rad',
      };
      if (record.pilot.format === 'spz') {
        const response = await fetch(assetUrl, { signal: record.controller.signal });
        if (!response.ok) throw new Error(`Captured asset returned ${response.status}`);
        const buffer = await response.arrayBuffer();
        record.assetBytes = buffer.byteLength;
        options.fileBytes = new Uint8Array(buffer);
        options.fileName = `${record.pilot.id}.spz`;
      } else {
        options.url = assetUrl.href;
      }
      if (record.controller.signal.aborted) return;
      const mesh = new SplatMesh(options);
      mesh.name = `Captured detail: ${record.pilot.name}`;
      mesh.position.set(record.placement.position.x, record.placement.position.y, record.placement.position.z);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(record.placement.rotation.x, record.placement.rotation.y, record.placement.rotation.z);
      mesh.scale.setScalar(record.placement.scale);
      mesh.opacity = 0;
      this.scene.add(mesh);
      record.mesh = mesh;
      await mesh.initialized;
      if (record.controller.signal.aborted || this.disposed) {
        this.disposeRecord(record, 'enabled');
        return;
      }
      record.state = 'ready';
      this.publish();
    } catch (error) {
      if (error?.name === 'AbortError') {
        record.state = 'enabled';
      } else {
        record.state = 'failed';
        record.error = String(error?.message || error);
        console.warn(`Captured detail failed for ${record.pilot.name}; using mesh fallback.`, error);
      }
      this.disposeRecord(record, record.state, false);
      this.publish();
    }
  }

  disposeRecord(record, nextState = 'enabled', clearError = true) {
    record.controller?.abort();
    record.controller = null;
    if (record.mesh) {
      this.scene.remove(record.mesh);
      record.mesh.dispose?.();
    }
    record.mesh = null;
    record.assetBytes = 0;
    record.opacity = 0;
    record.state = nextState;
    if (clearError) record.error = '';
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    storageWrite('ptbo-city-splats', this.enabled);
    for (const record of this.records.values()) {
      if (!this.enabled) this.disposeRecord(record, 'disabled');
      else if (record.state === 'disabled') record.state = assetState(record.pilot, true);
    }
    this.stats.enabled = this.enabled;
    this.publish();
  }

  setEnvironmentTheme(theme) {
    this.environmentOpacity = theme === 'night' ? 0.46 : theme === 'dusk' ? 0.74 : 1;
  }

  setDebug(enabled) {
    this.debug = Boolean(enabled);
    if (this.debugGroup) this.debugGroup.visible = this.debug;
    if (this.debugElement) this.debugElement.hidden = !this.debug;
    this.publish();
  }

  createCalibrationGeometry() {
    if (!this.THREE || this.debugGroup) return;
    const group = new this.THREE.Group();
    group.name = 'Splat landmark calibration';
    const axisGeometry = new this.THREE.CylinderGeometry(0.28, 0.28, 24, 8);
    const axisMaterial = new this.THREE.MeshBasicMaterial({ color: 0xffcf66, depthTest: false });
    const ringMaterial = new this.THREE.LineBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.7, depthTest: false });
    for (const record of this.records.values()) {
      const marker = new this.THREE.Mesh(axisGeometry, axisMaterial);
      marker.position.set(record.placement.position.x, record.placement.position.y + 12, record.placement.position.z);
      marker.renderOrder = 100;
      group.add(marker);
      const radius = Math.min(260, Number(record.pilot.streaming.fadeInDistance));
      const points = Array.from({ length: 65 }, (_, index) => {
        const angle = index / 64 * Math.PI * 2;
        return new this.THREE.Vector3(
          record.placement.position.x + Math.cos(angle) * radius,
          record.placement.position.y + 0.5,
          record.placement.position.z + Math.sin(angle) * radius,
        );
      });
      const ring = new this.THREE.Line(new this.THREE.BufferGeometry().setFromPoints(points), ringMaterial);
      ring.renderOrder = 100;
      group.add(ring);
    }
    group.visible = this.debug;
    this.scene.add(group);
    this.debugGroup = group;
    if (this.debugElement) this.debugElement.hidden = !this.debug;
  }

  update(camera = this.camera, now = performance.now()) {
    if (!this.manifest || this.disposed) return;
    // Streaming checks are intentionally much slower than the render loop.
    if (now - this.lastUpdate < 180) return;
    this.lastUpdate = now;
    const positions = new Map();
    const activeIds = new Set();
    for (const [id, record] of this.records) {
      positions.set(id, {
        cameraX: camera.position.x,
        cameraZ: camera.position.z,
        anchorX: record.placement.position.x,
        anchorZ: record.placement.position.z,
      });
      if (record.mesh || record.state === 'loading') activeIds.add(id);
      record.distance = Math.hypot(camera.position.x - record.placement.position.x, camera.position.z - record.placement.position.z);
    }
    const maximum = this.profile.lowPower ? 1 : Number(this.manifest.runtime.maxSimultaneousPilots || 2);
    const chosen = new Set(rankSplatCandidates(this.manifest.pilots, positions, activeIds, maximum).map(({ pilot }) => pilot.id));
    for (const [id, record] of this.records) {
      if (!this.enabled || this.profile.unsupported || !record.pilot.asset) continue;
      if (chosen.has(id)) {
        if (record.state === 'enabled') this.loadRecord(record);
        if (record.mesh) {
          record.opacity = splatDistanceOpacity(
            record.distance,
            Number(record.pilot.streaming.fadeInDistance),
            Number(record.pilot.streaming.fadeOutDistance),
          ) * this.environmentOpacity;
          record.mesh.opacity = record.opacity;
          record.mesh.visible = record.opacity > 0.015;
        }
      } else if ((record.mesh || record.state === 'loading') && record.distance > Number(record.pilot.streaming.unloadRadius)) {
        this.disposeRecord(record, 'enabled');
      }
    }
    this.publish();
  }

  publish() {
    const records = [...this.records.values()];
    this.stats.loaded = records.filter((record) => record.state === 'ready').length;
    this.stats.visible = records.filter((record) => record.mesh?.visible).length;
    this.stats.visibleSplats = 0;
    if (this.sparkRenderer?.lodInstances) {
      for (const instance of this.sparkRenderer.lodInstances.values()) this.stats.visibleSplats += Number(instance.numSplats || 0);
    } else {
      for (const record of records) this.stats.visibleSplats += Number(record.mesh?.splats?.getNumSplats?.() || 0);
    }
    this.stats.approximateBytes = records.reduce((sum, record) => sum + record.assetBytes, 0) + this.stats.visibleSplats * 20;
    const nearest = records.slice().sort((a, b) => a.distance - b.distance)[0];
    const unavailable = records.filter((record) => record.state === 'unavailable').length;
    const status = {
      ...this.stats,
      pilots: records.map((record) => ({ id: record.pilot.id, name: record.pilot.name, state: record.state, distance: record.distance, opacity: record.opacity, error: record.error })),
      unavailable,
      nearest: nearest ? { id: nearest.pilot.id, name: nearest.pilot.name, distance: nearest.distance, state: nearest.state } : null,
    };
    this.onStatus(status);
    if (this.debug && this.debugElement) {
      const nearestText = nearest && Number.isFinite(nearest.distance)
        ? `${nearest.pilot.name} · ${Math.round(nearest.distance)} m · ${nearest.state}`
        : 'No pilot in range';
      this.debugElement.innerHTML = [
        '<strong>Captured-detail calibration</strong>',
        `<span>${nearestText}</span>`,
        `<span>Visible ${status.visible}/${records.length} · ${status.visibleSplats.toLocaleString()} splats</span>`,
        `<span>Budget ${status.budget.toLocaleString()} · approx ${(status.approximateBytes / 1048576).toFixed(1)} MiB</span>`,
        `<span>City axes: +X east · +Y up · +Z south</span>`,
      ].join('');
    }
  }

  dispose() {
    this.disposed = true;
    for (const record of this.records.values()) this.disposeRecord(record, 'disabled');
    if (this.sparkRenderer) {
      this.scene.remove(this.sparkRenderer);
      this.sparkRenderer.dispose?.();
      this.sparkRenderer = null;
    }
    if (this.debugGroup) {
      this.scene.remove(this.debugGroup);
      this.debugGroup.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      this.debugGroup = null;
    }
  }
}

