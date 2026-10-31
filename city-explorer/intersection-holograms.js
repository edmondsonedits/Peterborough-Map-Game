import { buildIntersectionHolograms, chooseIntersectionStreet } from './intersection-hologram-rules.js?v=1.6.158';

// Citywide coverage, but a fixed pool of reusable billboards/textures on screen.
export const INTERSECTION_HOLOGRAM_STYLE = Object.freeze({
  hoverMetres: 9.6, widthMetres: 18, rangeMetres: 110,
  cellMetres: 128, fullLabels: 3, liteLabels: 2,
  ink: '#e8ffff', accent: '#65e5f2', panel: 'rgba(5, 24, 36, 0.82)',
});

export function createIntersectionHologramLayer({ THREE, segments, lowPower = false,
  canvasFactory = () => document.createElement('canvas') }) {
  const style = INTERSECTION_HOLOGRAM_STYLE;
  const junctions = buildIntersectionHolograms(segments);
  const group = new THREE.Group();
  group.name = 'IntersectionHolograms';
  group.userData = { type: 'intersection-holograms', collision: false, decorative: true };
  const cells = new Map(), choices = new Map();
  for (const junction of junctions) {
    const key = `${Math.floor(junction.x / style.cellMetres)}:${Math.floor(junction.z / style.cellMetres)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(junction);
  }
  const resolution = lowPower ? 512 : 1024;
  const slots = Array.from({ length: lowPower ? style.liteLabels : style.fullLabels }, () => {
    const canvas = canvasFactory();
    canvas.width = resolution; canvas.height = resolution / 4;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Intersection labels require a 2D canvas');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true,
      depthTest: true, depthWrite: false, toneMapped: false, fog: false });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.userData = { type: 'intersection-hologram', collision: false, decorative: true };
    group.add(sprite);
    return { canvas, context, texture, sprite, text: '', junction: null };
  });
  const forward = new THREE.Vector3(), center = new THREE.Vector3();
  let visible = [], previousMode = null;

  function paint(slot, names) {
    const text = names.join('\n');
    if (slot.text === text) return;
    slot.text = text;
    const c = slot.context;
    c.setTransform(resolution / 1024, 0, 0, resolution / 1024, 0, 0);
    c.clearRect(0, 0, 1024, 256);
    c.fillStyle = style.panel;
    c.beginPath(); c.moveTo(22, 35); c.lineTo(1002, 35); c.lineTo(1002, 221);
    c.lineTo(22, 221); c.closePath(); c.fill();
    // Restrained translucent scan lines and luminous corner brackets, no bloom.
    c.strokeStyle = 'rgba(101,229,242,0.045)'; c.lineWidth = 1;
    for (let y = 42; y < 221; y += 8) { c.beginPath(); c.moveTo(24, y); c.lineTo(1000, y); c.stroke(); }
    c.strokeStyle = style.accent; c.lineWidth = 3;
    c.shadowColor = style.accent; c.shadowBlur = 9;
    for (const [x, y, sx, sy] of [[16, 29, 1, 1], [1008, 29, -1, 1], [16, 227, 1, -1], [1008, 227, -1, -1]]) {
      c.beginPath(); c.moveTo(x, y + sy * 34); c.lineTo(x, y); c.lineTo(x + sx * 66, y); c.stroke();
    }
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(101,229,242,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(100, 29); c.lineTo(924, 29); c.moveTo(100, 227); c.lineTo(924, 227); c.stroke();
    const lines = names.length <= 3 ? names : [names.slice(0, Math.ceil(names.length / 2)).join(' / '), names.slice(Math.ceil(names.length / 2)).join(' / ')];
    let font = lines.length === 1 ? 76 : lines.length === 2 ? 59 : 45;
    while (font > 20) {
      c.font = `650 ${font}px system-ui, sans-serif`;
      if (lines.every(line => c.measureText(line).width < 920)) break;
      font -= 1;
    }
    c.fillStyle = style.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    const gap = font * 1.18;
    lines.forEach((line, index) => c.fillText(line, 512, 128 + (index - (lines.length - 1) / 2) * gap));
    // A tiny locator below the panel keeps its geographic anchor apparent.
    c.fillStyle = style.accent; c.beginPath(); c.moveTo(504, 239); c.lineTo(520, 239); c.lineTo(512, 246); c.fill();
    slot.texture.needsUpdate = true;
  }

  function update(camera, { mode = 'fly', heading = null, position = camera.position, altitude = 0 } = {}) {
    group.visible = mode !== 'map' && altitude < 90;
    visible = [];
    if (!group.visible) return;
    if (previousMode !== mode) choices.clear();
    previousMode = mode;
    camera.updateMatrixWorld();
    camera.getWorldDirection(forward);
    const travel = heading || { x: forward.x, z: forward.z };
    if (Math.hypot(travel.x, travel.z) < 1e-6) { slots.forEach(slot => { slot.sprite.visible = false; }); return; }
    const cellX = Math.floor(position.x / style.cellMetres), cellZ = Math.floor(position.z / style.cellMetres);
    const candidates = [];
    for (let x = cellX - 1; x <= cellX + 1; x++) for (let z = cellZ - 1; z <= cellZ + 1; z++) {
      for (const junction of cells.get(`${x}:${z}`) || []) {
        const distance = Math.hypot(junction.x - position.x, junction.z - position.z);
        if (distance > style.rangeMetres) continue;
        const choice = chooseIntersectionStreet(junction, travel, choices.get(junction.id));
        choices.set(junction.id, choice.currentStreet);
        center.set(junction.x, junction.y + style.hoverMetres, junction.z);
        const depth = (center.x - camera.position.x) * forward.x + (center.y - camera.position.y) * forward.y + (center.z - camera.position.z) * forward.z;
        if (depth < 3 || !choice.displayNames.length) continue;
        const screen = center.clone().project(camera);
        if (Math.abs(screen.x) > 1.03 || screen.y < -1.05 || screen.y > 1.2) continue;
        const visibleWidth = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
        const width = Math.min(style.widthMetres, visibleWidth * .86);
        const halfX = width / visibleWidth, halfY = halfX * camera.aspect / 4;
        candidates.push({ junction, choice, distance, width, screen, halfX, halfY });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.junction.id.localeCompare(b.junction.id));
    const accepted = [];
    for (const candidate of candidates) {
      // Nearest labels win. Distant junctions cannot obscure a nearer name.
      if (accepted.some(other => Math.abs(candidate.screen.x - other.screen.x) < candidate.halfX + other.halfX + .06
        && Math.abs(candidate.screen.y - other.screen.y) < candidate.halfY + other.halfY + .06)) continue;
      accepted.push(candidate);
      if (accepted.length === slots.length) break;
    }
    slots.forEach((slot, index) => {
      const item = accepted[index];
      slot.sprite.visible = Boolean(item);
      if (!item) { slot.junction = null; return; }
      paint(slot, item.choice.displayNames);
      slot.junction = item.junction.id;
      slot.sprite.position.set(item.junction.x, item.junction.y + style.hoverMetres, item.junction.z);
      slot.sprite.scale.set(item.width, item.width / 4, 1);
      slot.sprite.material.opacity = index === 0 ? 1 : .8;
      visible.push({ id: item.junction.id, currentStreet: item.choice.currentStreet, text: item.choice.displayText,
        distance: item.distance, position: slot.sprite.position.toArray(), width: item.width });
    });
  }
  return { group, update, junctions,
    stats: () => ({ intersections: junctions.length, namedStreets: new Set(junctions.flatMap(j => j.names)).size,
      poolSize: slots.length, textureBytesEstimate: resolution * resolution / 4 * 4 * slots.length,
      visible: group.visible ? visible : [], billboard: 'Three.Sprite', collision: false }),
    dispose() { group.removeFromParent(); slots.forEach(slot => { slot.texture.dispose(); slot.sprite.material.dispose(); }); choices.clear(); },
  };
}
