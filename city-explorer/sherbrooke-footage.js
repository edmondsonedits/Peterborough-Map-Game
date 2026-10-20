// Ground-level frontage details for the existing Sherbrooke building masses.
// These objects add neither walls/roofs nor collision geometry.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const PHOTO_LOAD_TIMEOUT_MS = 15000;

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

export function createFootageFacade({ THREE, profile, ring, base, top, project }) {
  if (!THREE?.Group || !THREE?.InstancedMesh) throw new TypeError("Three.js runtime is required");
  if (!profile || !Number.isFinite(base) || !Number.isFinite(top) || top <= base) throw new TypeError("Profile and finite building base/top are required");
  const root = new THREE.Group(); root.name = `SherbrookeFootage-${profile.label || profile.id || "building"}`;
  root.userData = { type: "reference-frontage-details", profileId: profile.id, confidence: profile.confidence, collision: false, photoStatus: "not-needed" };
  // Station 1 already has a separately reviewed five-door frontage in the game.
  if (profile.style === "station" || profile.id === "way/1009651229") { root.userData.stationFacadeSuppliedByGame = true; return root; }
  // Keep rear/inferred masses conservative; do not imply observed doors or windows.
  if (profile.confidence === "inferred") { root.userData.detailsOmitted = "front openings not supported by the available reference"; return root; }

  const f = frontageFrame({ profile, ring, project }), h = Math.min(top - base, Number(profile.eaveHeight) || Number(profile.height) || top - base), levels = clamp(Number(profile.levels) || 1, 1, 5), columns = clamp(Number(profile.windowColumns) || 2, 1, 12), floor = h / levels;
  const unitBox = new THREE.BoxGeometry(1, 1, 1), mats = new Map(), instances = new Map(), dummy = new THREE.Object3D();
  const palette = { trim: profile.trimColor || "#eee8dc", wall: profile.wallColor || "#a8907a", brick: profile.wallColor || "#a8907a", glass: "#33494e", shade: "#322f2c", door: "#53443a", metal: "#343a39", accent: profile.trimColor || "#eee8dc" };
  function material(key) { if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: palette[key] || key, roughness: key === "glass" ? .34 : .88, metalness: key === "glass" ? .12 : 0, transparent: key === "glass", opacity: key === "glass" ? .9 : 1, side: THREE.DoubleSide })); return mats.get(key); }
  const at = (t, y, out = .2) => ({ x: f.start.x + f.tangent.x * f.length * t + f.outward.x * out, y: base + y, z: f.start.z + f.tangent.z * f.length * t + f.outward.z * out });
  function box(t, y, w, ht, depth, kind = "trim", out = .2) {
    const p = at(t, y, out), key = kind;
    if (!instances.has(key)) instances.set(key, []);
    instances.get(key).push({ p, scale: [w, ht, depth], yaw: f.yaw });
  }
  function window(t, y, w, ht) {
    box(t, y, w, ht, .07, "trim", .19); box(t, y, Math.max(.16, w - .13), Math.max(.2, ht - .13), .035, "glass", .24);
    box(t, y - ht * .39, w + .025, .045, .055, "accent", .28);
  }
  function sign(text, t, y, w) {
    box(t, y, w, .5, .09, "trim", .24);
    if (typeof document === "undefined" || !text) return;
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 96; const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#eee8dc"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#293c3c";
    ctx.font = "700 46px Georgia,serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(text).slice(0, 38), canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * .9, .34), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    const p = at(t, y, .3); plate.position.set(p.x, p.y, p.z); plate.rotation.y = f.yaw; root.add(plate);
  }

  const style = profile.style || "office", patch = profile.texturePatch?.target;
  const patchCenter = patch ? Number(patch.centerFraction) || .5 : .5, patchWidth = patch ? clamp(Number(patch.widthFraction) || 1, .05, 1) : 0;
  const openingUnderPatch = t => !!patch && Math.abs(t - patchCenter) < patchWidth / 2 + .025;
  const wideGlass = style === "office" && profile.largeGlazedFront;
  for (let level = 0; level < levels; level++) {
    const y = floor * (level + .53), ww = style === "house" ? .96 : 1.42, wh = Math.min(style === "house" ? 1.35 : 1.65, floor * .62);
    if (level === 0 && wideGlass) {
      const gy = floor * .5, gh = floor * .9, gw = f.length * .9; box(.5, gy, gw, gh, .1, "glass", .19);
      for (let i = 0; i <= columns; i++) box(.05 + .9 * i / columns, gy, .075, gh, .06, "accent", .27);
      for (const yy of [gy - gh / 2, gy, gy + gh / 2]) box(.5, yy, gw, .07, .06, "accent", .27);
      continue;
    }
    for (let i = 0; i < columns; i++) {
      const t = (i + .5) / columns;
      if (level === 0 && (profile.skipGroundWindows || openingUnderPatch(t))) continue;
      if (style === "retail" && level === 0) window(t, floor * .43, f.length / columns * .76, Math.min(2.15, floor * .7));
      else window(t, y, ww, wh);
    }
  }
  // Specific photographed openings are the only ground windows retained on the mural facade.
  for (const win of profile.groundWindows || []) if (Number.isFinite(win.t) && win.t >= 0 && win.t <= 1 && !openingUnderPatch(win.t)) window(win.t, (Number(win.bottom) || 0) + (Number(win.height) || 1.5) / 2, Number(win.width) || 1, Number(win.height) || 1.5);

  if (style === "house") {
    const t = Number.isFinite(profile.doorFraction) ? profile.doorFraction : .5, porchWidth = Math.min(f.length * .56, 3.2);
    box(t, 1.05, .86, 2.05, .09, "door", .24); box(t, .16, porchWidth, .12, 1.05, "trim", .62);
    for (const side of [-1, 1]) box(t + side * porchWidth * .43 / f.length, 1.35, .11, 2.55, .11, "trim", .78);
    box(t, 2.72, porchWidth + .2, .14, 1.18, "trim", .8);
    if ((profile.features || []).some(v => /balcony/i.test(v))) {
      const y = Math.min(h * .58, floor * 1.65), bw = Math.min(f.length * .58, 5.4); box(.5, y, bw, .12, .4, "trim", .38);
      for (let i = 0; i < 8; i++) box(.5 + (i - 3.5) * bw / 8.5 / f.length, y + .45, .045, .85, .055, "trim", .42);
      box(.5, y + .9, bw, .075, .075, "trim", .42);
    }
  } else if (style === "retail") {
    box(.5, h - .33, f.length * .98, .42, .23, (profile.features || []).includes("green-parapet-trim") ? "#658158" : "trim", .23);
    if (profile.features?.includes("black-sign-awnings")) for (let i = 0; i < columns; i++) box((i + .5) / columns, 2.38, f.length / columns * .86, .18, .48, "shade", .44);
  } else if (style === "office" && levels > 1) {
    // A modest entry marks office frontages without implying storefront signage where none is listed.
    const t = Number.isFinite(profile.doorFraction) ? profile.doorFraction : .5;
    if (!profile.skipGroundWindows) box(t, 1.05, .9, 2.05, .1, "door", .23);
  }
  if (profile.signText) sign(profile.signText, Number.isFinite(profile.signFraction) ? profile.signFraction : .5, Math.min(h - .48, Math.max(2.8, patch ? (Number(patch.bottomMetres) || .18) + h * (Number(patch.heightFraction) || .55) + .45 : h - .7)), Math.min(f.length * .76, style === "house" ? 3.6 : 8));

  for (const [key, items] of instances) {
    const mesh = new THREE.InstancedMesh(unitBox, material(key), items.length); mesh.name = `frontage-${key}`;
    items.forEach((item, i) => { dummy.position.set(item.p.x, item.p.y, item.p.z); dummy.rotation.set(0, item.yaw, 0); dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }
  if (profile.texturePatch?.quad && profile.label === "N07") addMuralPhoto(THREE, root, profile, f, base, h, at);
  root.userData.frontage = { length: f.length, outward: f.outward, estimatedHeight: h, style, openingCount: [...instances.values()].reduce((n, a) => n + a.length, 0) };
  return root;
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
