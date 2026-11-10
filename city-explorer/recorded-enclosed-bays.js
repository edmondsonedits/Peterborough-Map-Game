// Small, photo-supported projecting window bays. Dimensions are appearance
// estimates; this geometry never changes the mapped shell or collision model.
import { glazingIntensity } from './city-visual-settings.js?v=1.6.207';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => Number.isFinite(value);
const dimension = (value, fallback, low, high) => clamp(finite(value) ? value : fallback, low, high);
const colorValue = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;

export function createRecordedEnclosedBays({ THREE, frame, base, height, specs = [], lite = false, glassEnvironment }) {
  if (!THREE?.Group || !THREE?.BufferGeometry) throw new TypeError('Three.js geometry runtime is required');
  const root = new THREE.Group();
  root.name = 'recorded-enclosed-bays';
  root.userData = { type: 'recorded-enclosed-bays', collision: false, enclosedBays: [], enclosedBayJoins: [], rejectedCount: 0 };
  const components = [frame?.start?.x, frame?.start?.z, frame?.tangent?.x, frame?.tangent?.z,
    frame?.outward?.x, frame?.outward?.z, frame?.length, base, height];
  if (!components.every(finite) || frame.length < .8 || height < .8
    || Math.abs(Math.hypot(frame.tangent.x, frame.tangent.z) - 1) > .001
    || Math.abs(Math.hypot(frame.outward.x, frame.outward.z) - 1) > .001
    || Math.abs(frame.tangent.x * frame.outward.x + frame.tangent.z * frame.outward.z) > .001) {
    root.userData.rejectedCount = Array.isArray(specs) ? specs.length : 0;
    return root;
  }
  const batches = new Map(), accepted = [];
  const world = (x, y, out) => ({
    x: frame.start.x + frame.tangent.x * x + frame.outward.x * out,
    y: base + y,
    z: frame.start.z + frame.tangent.z * x + frame.outward.z * out,
  });
  function triangle(batch, a, b, c, normal) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const direction = (uy * vz - uz * vy) * normal.x + (uz * vx - ux * vz) * normal.y + (ux * vy - uy * vx) * normal.z;
    for (const point of direction < 0 ? [a, c, b] : [a, b, c]) batch.positions.push(point.x, point.y, point.z);
  }
  function batchFor(kind, color) {
    const key = `${kind}:${color}`;
    if (!batches.has(key)) batches.set(key, { kind, color, positions: [] });
    return batches.get(key);
  }
  function quad(batch, a, b, c, d, normal) {
    triangle(batch, a, b, c, normal); triangle(batch, a, c, d, normal);
  }
  const sourceSpecs = Array.isArray(specs) ? specs : [];
  root.userData.rejectedCount = Math.max(0, sourceSpecs.length - 4);
  for (const spec of sourceSpecs.slice(0, 4)) {
    if (!spec || !finite(spec.fraction) || !finite(spec.bottomMetres) || spec.bottomMetres < 0 || spec.bottomMetres > height - .7) {
      root.userData.rejectedCount++; continue;
    }
    const width = dimension(spec.widthMetres, 2.25, .7, Math.min(4, frame.length - .1));
    const fraction = clamp(spec.fraction, (width / 2 + .025) / frame.length, 1 - (width / 2 + .025) / frame.length);
    const bottom = spec.bottomMetres, bayHeight = dimension(spec.heightMetres, 2.55, .7, height - bottom);
    const depth = dimension(spec.depthMetres, .55, .12, 1.2);
    const frontFraction = dimension(spec.frontWidthFraction, .58, .35, .8);
    const waist = dimension(spec.baseHeightMetres, .42, .1, bayHeight * .4);
    const cap = dimension(spec.capHeightMetres, .12, .05, bayHeight * .15);
    const center = fraction * frame.length, top = bottom + bayHeight;
    // A tiny wall outset avoids fighting the source wall at the two rear seams.
    const outline = [
      { x: center - width / 2, out: .045 },
      { x: center - width * frontFraction / 2, out: depth },
      { x: center + width * frontFraction / 2, out: depth },
      { x: center + width / 2, out: .045 },
    ];
    const wall = batchFor('wall', colorValue(spec.wallColor, '#d4c9ae'));
    const trim = batchFor('trim', colorValue(spec.trimColor, '#a68d66'));
    const glass = batchFor('glass', colorValue(spec.glassColor, '#687976'));
    // Three outward faces, each with an enclosed sash, a solid lower waist,
    // head and jambs. There is no balcony deck, railing or exposed support.
    for (let faceIndex = 0; faceIndex < 3; faceIndex++) {
      const a = outline[faceIndex], b = outline[faceIndex + 1];
      const dx = b.x - a.x, dz = b.out - a.out, length = Math.hypot(dx, dz);
      const localNormal = { x: -dz / length, out: dx / length };
      const normal = { x: frame.tangent.x * localNormal.x + frame.outward.x * localNormal.out, y: 0,
        z: frame.tangent.z * localNormal.x + frame.outward.z * localNormal.out };
      const point = (t, y, inset = 0) => world(a.x + dx * t + localNormal.x * inset, y, a.out + dz * t + localNormal.out * inset);
      const faceQuad = (batch, left, right, low, high, inset = 0) => quad(batch,
        point(left, low, inset), point(right, low, inset), point(right, high, inset), point(left, high, inset), normal);
      const jamb = Math.min(.14, .075 / length), low = bottom + waist, high = top - cap;
      faceQuad(wall, 0, 1, bottom, low);
      faceQuad(wall, 0, 1, high, top);
      faceQuad(trim, 0, jamb, low, high);
      faceQuad(trim, 1 - jamb, 1, low, high);
      faceQuad(glass, jamb, 1 - jamb, low, high, -.008);
      const sash = Math.min(.045, (high - low) * .06);
      faceQuad(trim, jamb, 1 - jamb, low, low + sash, .003);
      faceQuad(trim, jamb, 1 - jamb, high - sash, high, .003);
      faceQuad(trim, jamb, 1 - jamb, (low + high - sash) / 2, (low + high + sash) / 2, .003);
    }
    const pointsAt = y => outline.map(point => world(point.x, y, point.out));
    const topPoints = pointsAt(top), bottomPoints = pointsAt(bottom);
    quad(trim, ...topPoints, { x: 0, y: 1, z: 0 });
    quad(wall, ...bottomPoints, { x: 0, y: -1, z: 0 });
    const summary = { fraction, widthMetres: width, bottomMetres: bottom,
      heightMetres: bayHeight, depthMetres: depth, frontWidthFraction: frontFraction,
      baseHeightMetres: waist, capHeightMetres: cap, faceCount: 3 };
    accepted.push({ spec, summary, outline, wall });
    root.userData.enclosedBays.push(summary);
  }
  // A photographed stacked bay can retain a solid projecting spandrel through
  // the floor gap. Never connect unrelated locations or unmatched silhouettes.
  for (const [index, lower] of accepted.entries()) {
    if (lower.spec.joinToNext !== true) continue;
    const low = lower.summary.bottomMetres + lower.summary.heightMetres;
    const upper = accepted.filter(candidate => candidate.summary.bottomMetres > low + .001
      && candidate.summary.bottomMetres - low <= 1.5
      && ['fraction', 'widthMetres', 'depthMetres', 'frontWidthFraction'].every(key => Math.abs(candidate.summary[key] - lower.summary[key]) < 1e-5))
      .sort((a, b) => a.summary.bottomMetres - b.summary.bottomMetres)[0];
    if (!upper) continue;
    const high = upper.summary.bottomMetres;
    for (let faceIndex = 0; faceIndex < 3; faceIndex++) {
      const a = lower.outline[faceIndex], b = lower.outline[faceIndex + 1];
      const dx = b.x - a.x, dz = b.out - a.out;
      const normal = { x: -dz * frame.tangent.x + dx * frame.outward.x, y: 0,
        z: -dz * frame.tangent.z + dx * frame.outward.z };
      quad(lower.wall, world(a.x, low, a.out), world(b.x, low, b.out),
        world(b.x, high, b.out), world(a.x, high, a.out), normal);
    }
    root.userData.enclosedBayJoins.push({ lowerIndex: index, upperIndex: accepted.indexOf(upper),
      bottomMetres: low, heightMetres: high - low, faceCount: 3 });
  }
  for (const { kind, color, positions } of batches.values()) {
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const glazing = kind === 'glass';
    const material = new THREE.MeshStandardMaterial({ color, roughness: glazing ? .42 : .88,
      metalness: 0, side: THREE.DoubleSide });
    if (glazing) {
      material.userData.cityGlazing = true;
      if (glassEnvironment && !lite) { material.envMap = glassEnvironment; material.envMapIntensity = glazingIntensity('day'); }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `recorded-enclosed-bay-${kind}`;
    mesh.userData = { type: 'recorded-enclosed-bay-surface', collision: false, kind };
    mesh.castShadow = !lite && !glazing; mesh.receiveShadow = !glazing;
    root.add(mesh);
  }
  return root;
}
