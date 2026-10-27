import { glazingIntensity } from './city-visual-settings.js?v=1.6.140';
// Ground-level frontage details for the existing Sherbrooke building masses.
// These objects add neither walls/roofs nor collision geometry.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const PHOTO_LOAD_TIMEOUT_MS = 15000;

/** Validate a simple convex polygon of normalized IMAGE UV points [u,v], origin bottom-left. */
export function normalizePhotoSilhouette(silhouette) {
  if (!Array.isArray(silhouette) || silhouette.length < 3 || silhouette.length > 32) return null;
  const points = silhouette.map(point => Array.isArray(point) && point.length === 2 ? [Number(point[0]), Number(point[1])] : null);
  if (points.some(point => !point || !point.every(Number.isFinite) || point.some(value => value < 0 || value > 1))) return null;
  if (points.length > 3 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  if (points.length < 3) return null;
  let area = 0, turn = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-7) {
      if (turn && Math.sign(cross) !== turn) return null;
      turn = Math.sign(cross);
    }
  }
  if (Math.abs(area) < 1e-5 || !turn) return null;
  return points.map(point => Object.freeze(point));
}

/** Build the same normalized UV silhouette in the corresponding world-space plane. */
export function createPhotoSilhouetteGeometry(THREE, silhouette, worldAt) {
  const points = normalizePhotoSilhouette(silhouette);
  if (!points) return null;
  if (!THREE?.Shape || !THREE?.ShapeGeometry || typeof worldAt !== 'function') throw new TypeError('Three.js Shape/ShapeGeometry and a world mapping function are required');
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  const source = geometry.getAttribute('position'), positions = [], uvs = [];
  for (let i = 0; i < source.count; i++) {
    const u = source.getX(i), v = source.getY(i), p = worldAt(u, v);
    if (![p?.x, p?.y, p?.z].every(Number.isFinite)) { geometry.dispose(); throw new TypeError('Silhouette world mapping must return finite x/y/z'); }
    positions.push(p.x, p.y, p.z); uvs.push(u, v);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function frontageFrame({ profile, ring, project }) {
  if (!profile?.frontLatLon || profile.frontLatLon.length !== 2 || typeof project !== "function") throw new TypeError("A profile frontage and project(lat, lon) function are required");
  if (!Array.isArray(ring) || ring.length < 3 || ring.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) throw new TypeError("A finite projected building ring is required");
  const projected = profile.frontLatLon.map(p => project(p.lat, p.lon));
  const start = { x: projected[0].x, z: projected[0].y ?? projected[0].z };
  const end = { x: projected[1].x, z: projected[1].y ?? projected[1].z };
  if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) throw new TypeError("project(lat, lon) must return finite x/y or x/z coordinates");
  const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
  if (!(length > 1)) throw new TypeError("Projected building frontage is degenerate");
  const tangent = { x: dx / length, z: dz / length }, midpoint = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
  const centroid = ring.reduce((a, p) => ({ x: a.x + p.x / ring.length, z: a.z + p.z / ring.length }), { x: 0, z: 0 });
  let outward = { x: -tangent.z, z: tangent.x };
  if ((midpoint.x - centroid.x) * outward.x + (midpoint.z - centroid.z) * outward.z < 0) outward = { x: -outward.x, z: -outward.z };
  return { start, end, midpoint, tangent, outward, length, yaw: Math.atan2(-tangent.z, tangent.x) };
}

/** Unit-size arched opening; cap rise is circular in world dimensions. */
export function createArchedOpeningGeometry(THREE, width, height) {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width + height)) throw new TypeError('Finite positive opening dimensions required');
  const cap = Math.min(.48, width / (2 * height));
  const shape = new THREE.Shape();
  shape.moveTo(-.5, -.5); shape.lineTo(.5, -.5); shape.lineTo(.5, .5 - cap);
  shape.absellipse(0, .5 - cap, .5, cap, 0, Math.PI, false); shape.lineTo(-.5, -.5);
  return new THREE.ShapeGeometry(shape, 10);
}

function solveHomography(quad) {
  const target = [[0, 0], [1, 0], [1, 1], [0, 1]], rows = [], rhs = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = target[i], [u, v] = quad[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.push(v);
  }
  for (let i = 0; i < 8; i++) {
    let pivot = i;
    for (let j = i + 1; j < 8; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]]; [rhs[i], rhs[pivot]] = [rhs[pivot], rhs[i]];
    const div = rows[i][i]; if (Math.abs(div) < 1e-11) throw new TypeError("Texture patch quad is degenerate");
    for (let k = i; k < 8; k++) rows[i][k] /= div; rhs[i] /= div;
    for (let j = 0; j < 8; j++) if (j !== i) { const f = rows[j][i]; for (let k = i; k < 8; k++) rows[j][k] -= f * rows[i][k]; rhs[j] -= f * rhs[i]; }
  }
  return rhs;
}

/** Return source-image UV for a target point; quad order is BL, BR, TR, TL; source v=0 is the top. */
export function mapPhotoPatchUV(quad, x, y) {
  if (!Array.isArray(quad) || quad.length !== 4 || quad.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new TypeError("Photo patch requires four finite [u,v] corners");
  const h = solveHomography(quad), d = h[6] * x + h[7] * y + 1;
  if (Math.abs(d) < 1e-11) throw new TypeError("Photo patch projection crosses a vanishing line");
  return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
}

export function createFootageFacade({ THREE, profile, ring, base, top, project, terrainHeightAtWorld, gardenClear, visuals = 'improved', lite = false, glassEnvironment }) {
  if (!THREE?.Group || !THREE?.InstancedMesh) throw new TypeError("Three.js runtime is required");
  if (!profile || !Number.isFinite(base) || !Number.isFinite(top) || top <= base) throw new TypeError("Profile and finite building base/top are required");
  const root = new THREE.Group(); root.name = `SherbrookeFootage-${profile.label || profile.id || "building"}`;
  root.userData = { type: "reference-frontage-details", profileId: profile.id, confidence: profile.confidence, collision: false, photoStatus: "not-needed", frontageCount: 1 };
  // Station 1 already has a separately reviewed five-door frontage in the game.
  if (profile.style === "station" || profile.id === "way/1009651229") { root.userData.stationFacadeSuppliedByGame = true; return root; }
  // Keep rear/inferred masses conservative; do not imply observed doors or windows.
  if (profile.confidence === "inferred") { root.userData.detailsOmitted = "front openings not supported by the available reference"; return root; }

  if (Array.isArray(profile.additionalFrontages) && profile.additionalFrontages.length) {
    const {additionalFrontages, ...primary} = profile;
    const faces = [primary, ...additionalFrontages.slice(0, 2).map((face, i) => ({
      ...primary, ...face, id: profile.id, label: `${profile.label}-face-${i + 2}`,
      additionalFrontages: undefined, facadePhoto: face.facadePhoto, texturePatch: undefined, frontGarden: undefined,
    }))];
    for (const face of faces) root.add(createFootageFacade({THREE, profile: face, ring, base, top, project, terrainHeightAtWorld, gardenClear, visuals, lite, glassEnvironment}));
    root.userData.frontageCount = faces.length;
    root.userData.photoReady = Promise.all(root.children.map(child => child.userData.photoReady)).then(() => {
      const statuses = root.children.map(child => child.userData.photoStatus);
      root.userData.photoStatus = statuses.includes('loaded') ? 'loaded' : statuses.includes('failed') ? 'failed' : 'not-needed';
      return root.userData.photoStatus;
    });
    return root;
  }

  const f = frontageFrame({ profile, ring, project }), h = Math.min(top - base, Number(profile.detailHeightMetres) || Number(profile.eaveHeight) || Number(profile.height) || top - base), levels = clamp(Number(profile.levels) || 1, 1, 16), columns = clamp(Number(profile.windowColumns) || 2, 1, lite ? 8 : 48), atticBand = clamp(Number(profile.atticBandHeight) || 0, 0, h * .2), floor = (h - atticBand) / levels;
  const frontageDetails = new THREE.Group(); frontageDetails.name = "frontage-procedural-details"; root.add(frontageDetails);
  const unitBox = new THREE.BoxGeometry(1, 1, 1), mats = new Map(), instances = new Map(), depthInstances = new Map(), photoOverlapInstances = new Map(), dummy = new THREE.Object3D();
  const archedWindows = [];
  const palette = { trim: profile.trimColor || "#eee8dc", wall: profile.wallColor || "#a8907a", brick: profile.wallColor || "#a8907a", glass: "#33494e", shade: "#322f2c", door: "#53443a", metal: "#343a39", accent: profile.trimColor || "#eee8dc" };
  function material(key) {
    if (!mats.has(key)) {
      const glaze = key === 'glass', improvedGlaze = glaze && visuals !== 'legacy';
      const mat = new THREE.MeshStandardMaterial({
        color: improvedGlaze && glassEnvironment ? '#314b56' : palette[key] || key,
        roughness: glaze ? (improvedGlaze ? .42 : .34) : .88,
        metalness: glaze && !improvedGlaze ? .12 : 0,
        transparent: glaze && (!improvedGlaze || !glassEnvironment),
        opacity: glaze && (!improvedGlaze || !glassEnvironment) ? .9 : 1,
        side: THREE.DoubleSide
      });
      if (improvedGlaze) {
        mat.userData.cityGlazing = true;
        if (glassEnvironment) { mat.envMap = glassEnvironment; mat.envMapIntensity = glazingIntensity('day'); mat.needsUpdate = true; }
      }
      mats.set(key, mat);
    }
    return mats.get(key);
  }
  const retainPhotoDepth = !profile.facadePhoto || [profile.porchWidthFraction, profile.porchHeightMetres, profile.porchDepthMetres].every(v => Number.isFinite(Number(v)) && Number(v) > 0);
  const at = (t, y, out = .2) => ({ x: f.start.x + f.tangent.x * f.length * t + f.outward.x * out, y: base + y, z: f.start.z + f.tangent.z * f.length * t + f.outward.z * out });
  function box(t, y, w, ht, depth, kind = "trim", out = .2, depthLayer = false, photoOverlap = false) {
    const p = at(t, y, out), key = kind, bucket = photoOverlap && profile.hidePhotoDuplicatedMembers && visuals !== "legacy" && retainPhotoDepth ? photoOverlapInstances : depthLayer && visuals !== "legacy" && retainPhotoDepth ? depthInstances : instances;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push({ p, scale: [w, ht, depth], yaw: f.yaw });
  }
  function window(t, y, w, ht, arched = false) {
    if (arched) archedWindows.push({t, y, w, ht});
    else { box(t, y, w, ht, .07, "trim", .19); box(t, y, Math.max(.16, w - .13), Math.max(.2, ht - .13), .035, "glass", .24); }
    box(t, y - ht * .39, w + .025, .045, .055, "accent", .28);
  }
  function sign(text, t, y, w) {
    const boardHeight = clamp(Number(profile.signBoardHeightMetres) || .5, .3, 1.5);
    const signOutset = clamp(Number(profile.signOutsetMetres) || .3, .3, .6);
    box(t, y, w, boardHeight, .09, profile.signBoardColor || "trim", signOutset - .06);
    if (typeof document === "undefined" || !text) return;
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 96; const ctx = canvas.getContext("2d");
    ctx.fillStyle = profile.signBackgroundColor || "#eee8dc"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = profile.signTextColor || "#293c3c";
    ctx.font = "700 46px Georgia,serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(text).slice(0, 38), canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * .9, boardHeight * .68), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    const p = at(t, y, signOutset); plate.position.set(p.x, p.y, p.z); plate.rotation.y = Math.atan2(f.outward.x, f.outward.z); frontageDetails.add(plate);
  }

  const style = profile.style || "office", patch = profile.texturePatch?.target;
  const patchCenter = patch ? Number(patch.centerFraction) || .5 : .5, patchWidth = patch ? clamp(Number(patch.widthFraction) || 1, .05, 1) : 0;
  const openingUnderPatch = t => !!patch && Math.abs(t - patchCenter) < patchWidth / 2 + .025;
  const wideGlass = style === "office" && profile.largeGlazedFront;
  if (Number(profile.plinthHeight) > 0 && profile.plinthColor) {
    const band = clamp(Number(profile.plinthHeight), .1, Math.min(h, 4));
    box(.5, band / 2, f.length, band, .12, profile.plinthColor, .1);
  }
  for (let level = 0; level < (profile.blankFacade ? 0 : levels); level++) {
    const y = floor * (level + .53), ww = clamp(Number(profile.windowWidthMetres) || (style === "house" ? .96 : 1.42), .2, f.length / columns * .9), wh = Math.min(Number(profile.windowHeightMetres) || (style === "house" ? 1.35 : 1.65), floor * (Number(profile.windowHeightMetres) > 0 ? .85 : .62));
    if ((level === 0 && wideGlass) || profile.glazedLevels?.includes(level)) {
      const gy = level === 0 && wideGlass ? floor * .5 : y, gh = clamp(Number(profile.glazedLevelHeights?.[level]) || floor * .9, .3, floor * .9), gw = f.length * .9; box(.5, gy, gw, gh, .1, "glass", .19);
      for (let i = 0; i <= columns; i++) box(.05 + .9 * i / columns, gy, .075, gh, .06, "accent", .27);
      for (const yy of [gy - gh / 2, gy, gy + gh / 2]) box(.5, yy, gw, .07, .06, "accent", .27);
      continue;
    }
    for (let i = 0; i < columns; i++) {
      const t = (i + .5) / columns;
      if (level === 0 && (profile.skipGroundWindows || openingUnderPatch(t))) continue;
      const override = visuals !== 'legacy' && Array.isArray(profile.windowOverrides)
        ? profile.windowOverrides.find(item => item.level === level && item.column === i) : null;
      if (override?.skip === true) continue;
      const retailGround = style === 'retail' && level === 0;
      const defaultWidth = retailGround ? f.length / columns * .76 : ww;
      const defaultHeight = retailGround ? Math.min(2.15, floor * .7) : wh;
      const width = clamp(Number(override?.widthMetres) || defaultWidth, .2, f.length / columns * .95);
      const height = clamp(Number(override?.heightMetres) || defaultHeight, .2, h);
      const centerY = Number.isFinite(override?.bottomMetres)
        ? clamp(override.bottomMetres, 0, h - height) + height / 2 : (retailGround ? floor * .43 : y);
      const arched = visuals !== 'legacy' && (override?.shape === 'arch' || (level > 0 && profile.archedWindowLevels?.includes(level)));
      window(t, centerY, width, height, arched);
    }
  }
  // Recorded additions use bounded dimensions and merge into existing material batches.
  for (const panel of (profile.facadePanels || []).slice(0, 12)) {
    const width = f.length * clamp(Number(panel.widthFraction) || .2, .02, 1);
    const fraction = clamp(Number.isFinite(panel.fraction) ? panel.fraction : .5, width / (2 * f.length), 1 - width / (2 * f.length));
    const bottom = clamp(Number(panel.bottomMetres) || 0, 0, h - .05), height = clamp(Number(panel.heightMetres) || .5, .05, h - bottom);
    box(fraction, bottom + height / 2, width, height, .06, panel.color || 'trim', clamp(Number(panel.outsetMetres) || .3, .16, .6));
  }
  if (profile.verticalGlazing) {
    const pane = profile.verticalGlazing, width = f.length * clamp(Number(pane.widthFraction) || .1, .03, .3);
    const fraction = clamp(Number(pane.fraction) || .5, width / (2 * f.length), 1 - width / (2 * f.length));
    const bottom = clamp(Number(pane.bottomMetres) || 0, 0, h - .2), height = clamp(Number(pane.heightMetres) || h, .2, h - bottom);
    box(fraction, bottom + height / 2, width, height, .12, 'glass', .31);
    for (const side of [-1, 1]) box(fraction + side * width / (2 * f.length), bottom + height / 2, .09, height, .12, 'trim', .35);
  }
  if (profile.entryCanopy) {
    const canopy = profile.entryCanopy, width = clamp(Number(canopy.widthMetres) || 3, .5, f.length * .95), depth = clamp(Number(canopy.depthMetres) || 1, .2, 2.5), y = clamp(Number(canopy.heightMetres) || 2.8, .8, h - .15);
    const fraction = clamp(Number(canopy.fraction) || .5, width / (2 * f.length), 1 - width / (2 * f.length));
    box(fraction, y, width, .16, depth, 'trim', depth / 2 + .15);
    if (depth > 1) for (const side of [-1, 1]) box(fraction + side * width * .43 / f.length, y / 2, .14, y, .14, 'trim', depth);
  }
  for (const level of [...new Set(profile.balconyLevels || [])].filter(n => Number.isInteger(n) && n > 0 && n < levels).slice(0, 15)) {
    const y = level * floor, width = f.length * clamp(Number(profile.balconyWidthFraction) || .65, .1, .95);
    box(.5, y, width, .12, .9, 'trim', .6);
    box(.5, y + .95, width, .07, .07, 'trim', .98);
    for (let i = 0; i < 9; i++) box(.5 + (i - 4) * width / (9 * f.length), y + .48, .035, .9, .04, 'trim', .98);
  }

  if (profile.structuralGrid) {
    for (let i=0;i<=columns;i++) box(.02+.96*i/columns,h/2,.35,h,.12,'trim',.34);
    for (let i=0;i<=levels;i++) box(.5,h*i/levels,f.length,.3,.12,'trim',.34);
  }
  if (profile.roof === 'mansard') for (const dormer of (profile.roofDormers || []).slice(0,6)) {
    const width=clamp(Number(dormer.width)||.8,.5,Math.min(2.2,f.length*.2)),t=clamp(Number(dormer.fraction)||.5,width/f.length,1-width/f.length),rise=clamp(Number(profile.roofRise)||2,.5,4),y=h+rise*.53;
    box(t,y,width,1.4,1.3,'trim',-.65);
    box(t,y,width*.7,1.05,.04,'glass',.025);
    box(t,y+.75,width+.18,.14,1.5,'trim',-.65);
  }

  // Separate attic band: never replace the observed rectangular main floors.
  if (atticBand > .2) {
    const count = clamp(Math.round(Number(profile.atticWindowColumns) || columns), 1, 24);
    const shape = new THREE.Shape();
    shape.moveTo(-.5, -.5); shape.lineTo(.5, -.5); shape.lineTo(.5, 0);
    shape.absarc(0, 0, .5, 0, Math.PI, false); shape.lineTo(-.5, -.5);
    const geometry = new THREE.ShapeGeometry(shape, 10);
    const frameMesh = new THREE.InstancedMesh(geometry, material('trim'), count);
    const infillMesh = new THREE.InstancedMesh(geometry, material(profile.atticInfillColor || 'glass'), count);
    frameMesh.name = 'frontage-arched-trim'; infillMesh.name = 'frontage-arched-infill';
    const width = Math.min(.8, f.length / count * .55), height = Math.min(.75, atticBand * .68);
    for (let i = 0; i < count; i++) {
      const p = at((i + .5) / count, h - atticBand / 2, .2);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, f.yaw, 0); dummy.scale.set(width, height, 1); dummy.updateMatrix(); frameMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.x += f.outward.x * .025; dummy.position.z += f.outward.z * .025;
      dummy.scale.set(Math.max(.1, width - .1), Math.max(.1, height - .1), 1); dummy.updateMatrix(); infillMesh.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [frameMesh, infillMesh]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); frontageDetails.add(mesh); }
  }
  if (profile.features?.includes('corbelled-cornice')) {
    const color = profile.corniceColor || 'trim', count = Math.min(24, Math.max(3, columns * 2));
    box(.5, h - .12, f.length * 1.01, .2, .3, color, .23);
    for (let i = 0; i < count; i++) box((i + .5) / count, h - .35, Math.min(.3, f.length / count * .55), .23, .22, color, .24);
  }

  // Specific photographed openings are the only ground windows retained on the mural facade.
  for (const win of profile.groundWindows || []) if (Number.isFinite(win.t) && win.t >= 0 && win.t <= 1 && !openingUnderPatch(win.t)) window(win.t, (Number(win.bottom) || 0) + (Number(win.height) || 1.5) / 2, Number(win.width) || 1, Number(win.height) || 1.5);

  if (style === "house") {
    const t = Number.isFinite(profile.doorFraction) ? profile.doorFraction : .5;
    box(t, 1.05, .86, 2.05, .09, "door", .24);
    if (profile.porch !== false) {
      const hasReviewedWidth = profile.porchWidthFraction != null && Number.isFinite(Number(profile.porchWidthFraction));
      const widthFraction = hasReviewedWidth ? clamp(Number(profile.porchWidthFraction), .1, 1) : .56;
      const porchWidth = hasReviewedWidth ? f.length * widthFraction : Math.min(f.length * widthFraction, 3.2), porchDepth = Number.isFinite(Number(profile.porchDepthMetres)) ? clamp(Number(profile.porchDepthMetres), .3, 3) : 1.05;
      const porchHeight = Number.isFinite(Number(profile.porchHeightMetres)) ? Math.max(.5, Number(profile.porchHeightMetres)) : 2.72;
      const columnTop = Math.max(.2, porchHeight - .095), columnHeight = Math.max(.1, columnTop - .1);
      box(t, .16, porchWidth, .12, porchDepth, "trim", porchDepth * .59, true);
      const imagePosts = Array.isArray(profile.porchPostImageFractions) ? profile.porchPostImageFractions.filter(v => Number.isFinite(v) && v >= 0 && v <= 1).slice(0, 8) : [];
      const reverseImageU = f.outward.x * -f.tangent.z + f.outward.z * f.tangent.x < 0;
      const postPositions = imagePosts.length >= 2 ? imagePosts.map(u => reverseImageU ? 1-u : u) : [-1, 1].map(side => t + side * porchWidth * .43 / f.length);
      for (const position of postPositions) box(position, .1 + columnHeight / 2, .11, columnHeight, .11, "trim", porchDepth * .74, true, true);
      box(t, porchHeight, porchWidth + .2, .14, porchDepth + .13, profile.porchRoofColor || "trim", porchDepth * .76, true, true);
    }
    if ((profile.features || []).some(v => /balcony/i.test(v))) {
      const y = Math.min(h * .58, floor * 1.65), bw = Number.isFinite(profile.balconyWidthFraction) ? f.length * clamp(profile.balconyWidthFraction, .1, 1) : Math.min(f.length * .58, 5.4); box(.5, y, bw, .12, .4, "trim", .38, true);
      for (let i = 0; i < 8; i++) box(.5 + (i - 3.5) * bw / 8.5 / f.length, y + .45, .045, .85, .055, "trim", .42, true, true);
      box(.5, y + .9, bw, .075, .075, "trim", .42, true, true);
    }
  } else if (style === "retail") {
    box(.5, h - .33, f.length * .98, .42, .23, (profile.features || []).includes("green-parapet-trim") ? "#658158" : "trim", .23);
    if (profile.features?.includes("black-sign-awnings")) for (let i = 0; i < columns; i++) box((i + .5) / columns, 2.38, f.length / columns * .86, .18, .48, "shade", .44);
  } else if (style === "office" && levels > 1 && !profile.blankFacade) {
    // A modest entry marks office frontages without implying storefront signage where none is listed.
    const t = Number.isFinite(profile.doorFraction) ? profile.doorFraction : .5;
    if (!profile.skipGroundWindows) box(t, 1.05, .9, 2.05, .1, "door", .23);
  }
  if (profile.signText) sign(profile.signText, Number.isFinite(profile.signFraction) ? profile.signFraction : .5, Number.isFinite(profile.signHeightMetres) ? clamp(profile.signHeightMetres, .5, h - .3) : Math.min(h - .48, Math.max(2.8, patch ? (Number(patch.bottomMetres) || .18) + h * (Number(patch.heightFraction) || .55) + .45 : h - .7)), Math.min(f.length * .76, Number(profile.signWidthMetres) || 8, style === "house" ? 3.6 : Infinity));

  // Reuse one opening shape and two material batches per reviewed dimension pair.
  const archGroups = new Map();
  for (const item of archedWindows) {
    const key = `${item.w}:${item.ht}`;
    if (!archGroups.has(key)) archGroups.set(key, []);
    archGroups.get(key).push(item);
  }
  for (const items of archGroups.values()) {
    const {w, ht} = items[0], geometry = createArchedOpeningGeometry(THREE, w, ht);
    for (const [kind, inset, out] of [['trim', 0, .225], ['glass', .13, .26]]) {
      const mesh = new THREE.InstancedMesh(geometry, material(kind), items.length);
      mesh.name = `frontage-upper-arched-${kind}`;
      for (const [i, item] of items.entries()) {
        const p = at(item.t, item.y, out);
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, f.yaw, 0);
        dummy.scale.set(Math.max(.1, item.w - inset), Math.max(.1, item.ht - inset), 1);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.receiveShadow = true;
      frontageDetails.add(mesh);
    }
  }
  root.userData.archedOpeningCount = archedWindows.length;

  for (const [key, items] of instances) {
    const mesh = new THREE.InstancedMesh(unitBox, material(key), items.length); mesh.name = `frontage-${key}`;
    items.forEach((item, i) => { dummy.position.set(item.p.x, item.p.y, item.p.z); dummy.rotation.set(0, item.yaw, 0); dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; frontageDetails.add(mesh);
  }
  if (depthInstances.size) {
    const depthDetails = new THREE.Group(); depthDetails.name = "frontage-supported-depth-details";
    for (const [key, items] of depthInstances) {
      const mesh = new THREE.InstancedMesh(unitBox, material(key), items.length); mesh.name = `frontage-depth-${key}`;
      items.forEach((item, i) => { dummy.position.set(item.p.x, item.p.y, item.p.z); dummy.rotation.set(0, item.yaw, 0); dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; depthDetails.add(mesh);
    }
    root.add(depthDetails);
  }
  if (photoOverlapInstances.size) {
    const overlapDetails = new THREE.Group(); overlapDetails.name = "frontage-photo-duplicate-members";
    for (const [key, items] of photoOverlapInstances) {
      const mesh = new THREE.InstancedMesh(unitBox, material(key), items.length); mesh.name = `frontage-photo-overlap-${key}`;
      items.forEach((item, i) => { dummy.position.set(item.p.x, item.p.y, item.p.z); dummy.rotation.set(0, item.yaw, 0); dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; overlapDetails.add(mesh);
    }
    root.add(overlapDetails); root.userData.photoOverlapDetails = overlapDetails;
  }
  if (profile.texturePatch?.quad && profile.label === "N07") addMuralPhoto(THREE, root, profile, f, base, h, at);
  if (profile.facadePhoto) addFacadePhoto(THREE, root, frontageDetails, profile, f, base, h, top - base);
  if (profile.frontGarden) addFrontGarden(THREE, root, profile.frontGarden, f, base, terrainHeightAtWorld, gardenClear);
  root.userData.frontage = { length: f.length, outward: f.outward, estimatedHeight: h, style, openingCount: [...instances.values(), ...depthInstances.values(), ...photoOverlapInstances.values()].reduce((n, a) => n + a.length, 0) };
  return root;
}

function addFacadePhoto(THREE, root, frontageDetails, profile, f, base, wallHeight, buildingHeight) {
  const photo = profile.facadePhoto;
  const center = clamp(Number(photo.centerFraction) || .5, 0, 1), width = clamp(Number(photo.widthFraction) || 1, .01, 1);
  const left = clamp(center - width / 2, 0, 1 - width), bottom = Math.max(0, Number(photo.bottomMetres) || 0);
  const availableWallHeight = Math.max(.1, wallHeight - bottom);
  const availableBuildingHeight = Math.max(.1, buildingHeight - bottom);
  const patchHeight = clamp(Number(photo.heightMetres) || availableWallHeight, .1, availableWallHeight);
  const gableHeight = Math.min(Math.max(0, Number(photo.gableHeightMetres) || 0), Math.max(0, availableBuildingHeight - patchHeight));
  const totalHeight = patchHeight + gableHeight;
  const reverseU = f.outward.x * -f.tangent.z + f.outward.z * f.tangent.x < 0;
  const point = (t, y) => ({ x: f.start.x + f.tangent.x * f.length * t + f.outward.x * .36, y: base + y, z: f.start.z + f.tangent.z * f.length * t + f.outward.z * .36 });
  const a = point(left, bottom), b = point(left + width, bottom), c = point(left + width, bottom + patchHeight), d = point(left, bottom + patchHeight);
  let geometry = photo.silhouette
    ? createPhotoSilhouetteGeometry(THREE, photo.silhouette, (u, v) => point(left + (reverseU ? 1 - u : u) * width, bottom + v * totalHeight))
    : null;
  if (!geometry) {
    geometry = new THREE.BufferGeometry();
    const positions = [a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,d.x,d.y,d.z];
    const uv = reverseU ? [1,0,0,0,0,patchHeight/totalHeight,1,patchHeight/totalHeight] : [0,0,1,0,1,patchHeight/totalHeight,0,patchHeight/totalHeight];
    if (gableHeight > 0) {
      const peak = point(left + width / 2, bottom + totalHeight);
      positions.push(peak.x,peak.y,peak.z); uv.push(.5,1);
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(gableHeight > 0 ? [0,1,2,0,2,3,3,2,4] : [0,1,2,0,2,3]); geometry.computeVertexNormals();
  }
  root.userData.facadePhotoStatus = "loading";
  root.userData.photoStatus = "loading";
  root.userData.facadePhotoReady = new Promise(resolve => {
    let settled = false, timer;
    const fail = () => { if (settled) return; settled = true; clearTimeout(timer); geometry.dispose(); root.userData.facadePhotoStatus = "failed"; root.userData.photoStatus = "failed"; resolve("failed"); };
    const succeed = texture => {
      if (settled) { texture.dispose?.(); return; }
      try {
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 2;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: .9, metalness: 0, transparent: false, side: THREE.DoubleSide }));
        mesh.name = "reviewed-facade-photo";
        if (photo.keepProceduralDetails !== true) frontageDetails.visible = false;
        if (profile.hidePhotoDuplicatedMembers && root.userData.photoOverlapDetails) root.userData.photoOverlapDetails.visible = false;
        // Only profile-supported porch/balcony members live outside the photo-backed wall group.
        root.add(mesh); settled = true; clearTimeout(timer); root.userData.facadePhotoStatus = "loaded"; root.userData.photoStatus = "loaded"; resolve("loaded");
      } catch { texture.dispose?.(); fail(); }
    };
    timer = setTimeout(fail, PHOTO_LOAD_TIMEOUT_MS);
    try { new THREE.TextureLoader().load(new URL(photo.file, import.meta.url).href, succeed, undefined, fail); }
    catch { fail(); }
  });
  // The existing scene startup waits on photoReady for every frontage group.
  root.userData.photoReady = root.userData.photoReady
    ? Promise.all([root.userData.photoReady, root.userData.facadePhotoReady]).then(results => results.every(result => result === "loaded") ? "loaded" : "failed")
    : root.userData.facadePhotoReady;
}

function addFrontGarden(THREE, root, garden, f, base, terrainHeightAtWorld, gardenClear) {
  // The caller owns the safe-setback predicate; without it we cannot prove that a garden avoids paving and footprints.
  if (typeof terrainHeightAtWorld !== "function" || typeof gardenClear !== "function") return;
  const depth = clamp(Number(garden.depthMetres) || 0, 0, 12), pathWidth = clamp(Number(garden.pathWidthMetres) || 0, 0, 5);
  if (depth < .5) return;
  const pathFraction = clamp(Number.isFinite(Number(garden.pathFraction)) ? Number(garden.pathFraction) : .5, 0, 1);
  const drivewayFraction = clamp(Number.isFinite(Number(garden.drivewayFraction)) ? Number(garden.drivewayFraction) : .5, 0, 1);
  const drivewayWidth = clamp(Number(garden.drivewayWidthMetres) || 0, 0, 8), step = .8;
  const lawnPositions = [], pathPositions = [], drivewayPositions = [], hedgePositions = [];
  const point = (t, out) => ({ x: f.start.x + f.tangent.x * f.length * t + f.outward.x * out, z: f.start.z + f.tangent.z * f.length * t + f.outward.z * out });
  const pushQuad = (target, corners, heights) => {
    const v = corners.map((p, i) => [p.x, heights[i] + .025, p.z]);
    target.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]);
  };
  const nx = Math.max(1, Math.ceil(f.length / step)), nz = Math.max(1, Math.ceil(depth / step));
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const t0 = ix / nx, t1 = (ix + 1) / nx, o0 = iz / nz * depth, o1 = (iz + 1) / nz * depth;
    const corners = [point(t0,o0), point(t1,o0), point(t1,o1), point(t0,o1)], center = point((t0+t1)/2, (o0+o1)/2);
    // All corners and the center must be clear so no partial cell can intrude into a path, road, or footprint.
    if (!corners.concat(center).every(p => gardenClear(p.x, p.z) === true)) continue;
    const along = (center.x-f.start.x)*f.tangent.x + (center.z-f.start.z)*f.tangent.z;
    const isDriveway = drivewayWidth > 0 && Math.abs(along - drivewayFraction * f.length) < drivewayWidth / 2;
    const isPath = !isDriveway && pathWidth > 0 && Math.abs(along - pathFraction * f.length) < pathWidth / 2;
    const heights = corners.map(p => { const y = Number(terrainHeightAtWorld(p.x, p.z)); return Number.isFinite(y) ? y : base; });
    pushQuad(isDriveway ? drivewayPositions : isPath ? pathPositions : lawnPositions, corners, heights);
  }
  if (garden.hedge === true) {
    const across = Math.max(1, Math.ceil(f.length / step));
    for (let i = 0; i < across; i++) {
      const t0 = i / across, t1 = (i + 1) / across, q = [point(t0,depth-.12), point(t1,depth-.12), point(t1,depth+.12), point(t0,depth+.12)];
      if (!q.every(p => gardenClear(p.x, p.z) === true)) continue;
      const ground = q.map(p => { const y = Number(terrainHeightAtWorld(p.x, p.z)); return Number.isFinite(y) ? y : base; });
      const upper = ground.map(y => y + .65);
      hedgePositions.push(q[0].x,ground[0],q[0].z,q[1].x,ground[1],q[1].z,q[2].x,upper[2],q[2].z,q[0].x,ground[0],q[0].z,q[2].x,upper[2],q[2].z,q[3].x,upper[3],q[3].z);
    }
  }
  const add = (positions, color, name) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide }));
    mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; root.add(mesh);
  };
  add(lawnPositions, garden.lawnColor || "#789264", "front-garden-lawn");
  add(pathPositions, garden.pathColor || "#9b9386", "front-garden-path");
  add(drivewayPositions, garden.drivewayColor || "#514f4c", "front-garden-driveway");
  add(hedgePositions, "#506b43", "front-garden-hedge");
}

function addMuralPhoto(THREE, root, profile, f, base, height, at) {
  const patch = profile.texturePatch, target = patch.target || {}, quad = patch.quad, center = clamp(Number(target.centerFraction) || .5, 0, 1), width = clamp(Number(target.widthFraction) || 1, .05, 1), patchHeight = height * clamp(Number(target.heightFraction) || .34, .05, .8), bottom = Math.max(.08, Number(target.bottomMetres) || .12), left = clamp(center - width / 2, 0, 1 - width);
  const columns = 24, rows = Math.max(8, Math.round(columns * patchHeight / Math.max(1, f.length * width))), positions = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const x = i / columns, y = j / rows, [u, v] = mapPhotoPatchUV(quad, x, y), t = left + width * x, p = at(t, bottom + patchHeight * y, .34);
    positions.push(p.x, p.y, p.z); uvs.push(u, 1 - v);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) { const a = j * (columns + 1) + i, b = a + columns + 1; indices.push(a, a + 1, b + 1, a, b + 1, b); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  root.userData.photoStatus = "loading";
  root.userData.photoReady = new Promise(resolve => {
    let settled = false, timer;
    const fail = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); root.userData.photoStatus = "failed"; geometry.dispose(); resolve("failed");
    };
    const succeed = texture => {
      if (settled) { texture.dispose?.(); return; }
      try {
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 2;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: .92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
        mesh.name = "reviewed-boro-mural-photo-patch"; mesh.frustumCulled = false; root.add(mesh);
        settled = true; clearTimeout(timer); root.userData.photoStatus = "loaded"; resolve("loaded");
      } catch { texture.dispose?.(); fail(); }
    };
    timer = setTimeout(fail, PHOTO_LOAD_TIMEOUT_MS);
    try { new THREE.TextureLoader().load(new URL(patch.file, import.meta.url).href, succeed, undefined, fail); }
    catch { fail(); }
  });
}
