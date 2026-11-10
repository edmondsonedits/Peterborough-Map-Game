import { MULTIPLAYER_VEHICLE_SLOTS } from './vehicle-instances.mjs?v=1.6.208';
import { applyAerialPose } from '../aerial-runtime.js?v=1.6.195';
import { installFleetAsset } from '../fleet-assets.js';
import { configureVehiclePresentation, updateVehiclePresentation } from '../vehicle-presentation.js';

function nameLabel(THREE, value) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(3.6, .9, 1); sprite.position.y = 2.8;
  let shown='';
  sprite.userData.setLabel=label=>{if(label===shown)return;shown=label;context.clearRect(0,0,256,64);context.fillStyle='rgba(11,22,38,.8)';context.fillRect(0,8,256,48);context.fillStyle='#fff';context.textAlign='center';context.font='bold 23px sans-serif';context.fillText(label,128,42,244);texture.needsUpdate=true;};
  sprite.userData.setLabel(value);
  return sprite;
}

/** Owns only multiplayer actors; the local walking actor remains the app's existing actor. */
export function createRemoteActors({ THREE, group, createTruck, createFirefighter, environment = null }) {
  const vehicles = new Map(), players = new Map();
  function disposeEntry(entry) {
    if (entry.disposed) return;
    entry.disposed = true;
    group.remove(entry.root);
    const ready = entry.slot ? entry.root.userData.truck.ready : entry.root.userData.animation?.ready;
    void Promise.resolve(ready).catch(() => {}).then(() => {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      entry.root.traverse(node => {
        if (!node.isMesh && !node.isSprite) return;
        if (node.geometry) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (!material) continue;
          materials.add(material);
          if (node.isSprite || !entry.slot || node.name.startsWith('Unit_')) if (material.map) textures.add(material.map);
        }
        node.skeleton?.dispose?.();
      });
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
    });
  }
  for (const slot of MULTIPLAYER_VEHICLE_SLOTS) {
    const root = createTruck(THREE);
    const type = slot.templateId === 'aerial' ? 'aerial' : slot.templateId === 'medi' ? 'medi' : 'pumper';
    if (type !== 'pumper') installFleetAsset(root, createTruck, type);
    root.name = slot.name; root.userData.vehicleId = slot.id;
    root.add(nameLabel(THREE, slot.name)); root.visible = false; group.add(root);
    const entry={root,actor:root,type,slot,state:{x:0,y:0,z:0,heading:0,speed:0,steering:0,wheelRotation:0},definition:{id:slot.id,name:slot.name,type,tuning:{length:10.4,width:2.55,wheelbase:5.65}}};
    root.userData.truck.ready=Promise.resolve(root.userData.truck.ready).then(status=>{configureVehiclePresentation(THREE,entry,environment);return status;});
    vehicles.set(slot.id,entry);
  }
  function update(snapshot, remote, ownId, ownPose, ownVehicleId, delta) {
    if (!snapshot) return;
    const playersById = new Map([snapshot.player, ...snapshot.players].map(player => [player.id, player]));
    const visibleVehicles = new Set();
    for (const vehicle of snapshot.vehicles) {
      const entry = vehicles.get(vehicle.id); if (!entry) continue;
      visibleVehicles.add(vehicle.id);
      const pose = vehicle.id === ownVehicleId ? ownPose : remote.vehicles.find(item => item.id === vehicle.id)?.pose ?? vehicle.pose;
      entry.root.visible = true;
      const prior=entry.state;
      const travelled=Math.hypot(pose.x-prior.x,pose.z-prior.z);
      entry.state={...pose,wheelRotation:prior.wheelRotation+(prior.x===0&&prior.z===0?0:travelled*Math.sign(pose.speed)/(entry.root.userData.truck.metadata?.wheelRadius??.56)),
        emergencyLights:vehicle.lights,braking:pose.speed*prior.speed<0,acceleration:(pose.speed-prior.speed)/Math.max(delta,.001)};
      entry.definition.tuning=vehicle.tuning;
      entry.root.position.set(pose.x, pose.y, pose.z); entry.root.rotation.set(0, pose.heading, 0, 'YXZ');
      const driver = playersById.get(vehicle.driverPlayerId);
      updateVehiclePresentation(entry,{delta,time:performance.now(),surface:null,driving:Boolean(driver),locked:Boolean(vehicle.aerial && vehicle.aerial.phase !== 'travel')});
      if (vehicle.aerial) applyAerialPose(THREE, entry, vehicle.aerial);
      const label = entry.root.children.find(child => child.isSprite);
      if(label){label.visible=Boolean(driver);if(driver)label.userData.setLabel(`${entry.slot.name} · ${driver.name}`);}
    }
    for (const [id, entry] of vehicles) if (!visibleVehicles.has(id)) entry.root.visible = false;
    const present = new Set();
    for (const actor of remote.players) {
      if (actor.id === ownId || actor.mode !== 'onFoot') continue;
      present.add(actor.id);
      let entry = players.get(actor.id);
      if (!entry) {
        const root = createFirefighter(THREE);
        root.add(nameLabel(THREE, actor.name)); group.add(root);
        entry = { root }; players.set(actor.id, entry);
      }
      entry.root.position.set(actor.pose.x, actor.pose.y + .025, actor.pose.z);
      entry.root.rotation.y = actor.pose.heading;
      entry.root.userData.animation?.locomotion?.update(delta, Math.abs(actor.pose.speed));
    }
    for (const [id, entry] of players) if (!present.has(id)) { disposeEntry(entry); players.delete(id); }
  }
  function dispose() {
    for (const entry of [...vehicles.values(), ...players.values()]) disposeEntry(entry);
    vehicles.clear(); players.clear();
  }
  return { update, dispose, vehicle: id => vehicles.get(id)?.root ?? null, vehicleState: id => vehicles.get(id)?.state ?? null,
    snapshot:()=>({vehicleIds:[...vehicles.keys()],visibleVehicleIds:[...vehicles].filter(([,entry])=>entry.root.visible).map(([id])=>id),playerIds:[...players.keys()]}) };
}
