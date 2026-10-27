// A validated facility takes precedence over a saved replacement for the same source.
// This only removes the runtime object; the saved editor document is preserved.
export function suppressFacilitySource(registry, authoredRuntime, id) {
  registry.hide(id);
  authoredRuntime?.remove?.(registry.makeGeneratedId({sourceType:'authored-replacement',sourceId:id}));
}
// Original Blender facility scenery; GIS roads, terrain and gameplay remain authoritative.
const canonicalSource = value => String(value || '').replace(/^city-building\/(way\/)/, '$1').replace(/^(?:way\/)+/, 'way/');

export function createEmergencyFacilityLayer({ THREE, scene, loader, entries, project, baseSurface, records, hide }) {
  const states = new Map(entries.map(entry => [entry.id, { status: 'loading', error: null }]));
  const ready = new Map();
  let loading;
  const worldPoint = (x, z, anchor, yaw) => ({ x: anchor.x + x * Math.cos(yaw) + z * Math.sin(yaw), z: anchor.z - x * Math.sin(yaw) + z * Math.cos(yaw) });

  function suppress(entry) {
    const sources = new Set(entry.sourceIds.map(canonicalSource));
    let matched = 0;
    for (const record of records()) {
      if (record.sourceType !== 'building' || !sources.has(canonicalSource(record.sourceId))) continue;
      hide(record.id); matched++;
    }
    states.get(entry.id).replacementCount = matched;
  }
  function validate(entry, model) {
    if (!model.getObjectByName(entry.rootName)) throw Error(`Missing ${entry.rootName}`);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const xs = entry.footprint.map(p => p[0]), zs = entry.footprint.map(p => p[1]);
    const tolerance = entry.boundsTolerance ?? 3;
    if (box.isEmpty() || ![box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].every(Number.isFinite)
      || box.min.x < Math.min(...xs)-tolerance || box.max.x > Math.max(...xs)+tolerance
      || box.min.z < Math.min(...zs)-tolerance || box.max.z > Math.max(...zs)+tolerance
      || box.max.y < 1 || box.max.y > (entry.maxHeight ?? 25) || box.min.y < -5) throw Error('Facility model bounds do not match the mapped site');
    return box;
  }
  function datum(entry, anchor, yaw) {
    const bounds = entry.groundSampleBounds;
    const samples = [];
    if (bounds) {
      for (let i=0;i<=8;i++) for (let j=0;j<=8;j++) samples.push([bounds.minX+(bounds.maxX-bounds.minX)*i/8,bounds.frontZ+(bounds.rearZ-bounds.frontZ)*j/8]);
    } else {
      samples.push(...entry.footprint, [entry.footprint.reduce((n,p)=>n+p[0],0)/entry.footprint.length,entry.footprint.reduce((n,p)=>n+p[1],0)/entry.footprint.length]);
    }
    const heights = samples.map(([x,z])=>{const p=worldPoint(x,z,anchor,yaw);return baseSurface(p.x,p.z)?.height;}).filter(Number.isFinite);
    if (!heights.length) throw Error('No terrain height available for facility');
    return Math.max(...heights)+(entry.floorOffset ?? 0.06);
  }
  function addFoundations(entry, wrapper, anchor, yaw) {
    const volumes=entry.foundationVolumes || [];
    if(!volumes.length) return;
    const material=new THREE.MeshStandardMaterial({color:0x6d7068,roughness:1});
    volumes.forEach((volume,index)=>{
      const heights=[];
      for(let i=0;i<=4;i++) for(let j=0;j<=4;j++) {
        const p=worldPoint(volume.minX+(volume.maxX-volume.minX)*i/4,volume.frontZ+(volume.rearZ-volume.frontZ)*j/4,anchor,yaw);
        const height=baseSurface(p.x,p.z)?.height;
        if(Number.isFinite(height)) heights.push(height);
      }
      const depth=Math.max(.5,wrapper.position.y-Math.min(...heights)+.35);
      const base=new THREE.Mesh(new THREE.BoxGeometry(volume.maxX-volume.minX,depth,volume.rearZ-volume.frontZ),material);
      base.name=`Facility_${entry.id}_foundation_${index}`;
      base.position.set((volume.minX+volume.maxX)/2,-depth/2-.01,(volume.frontZ+volume.rearZ)/2);
      wrapper.add(base);
    });
  }
  async function loadEntry(entry) {
    let wrapper;
    try {
      const gltf = await loader.loadAsync(entry.assetUrl);
      validate(entry,gltf.scene);
      const projected = project(entry.origin.lat,entry.origin.lon);
      const anchor = {x:projected.x,z:projected.z ?? projected.y};
      const yaw = entry.origin.yawDegrees*Math.PI/180;
      if (![anchor.x,anchor.z,yaw].every(Number.isFinite)) throw Error('Invalid facility placement');
      wrapper = new THREE.Group();wrapper.name = `Facility_${entry.id}`;
      wrapper.position.set(anchor.x,datum(entry,anchor,yaw),anchor.z);wrapper.rotation.y=yaw;
      wrapper.add(gltf.scene);
      addFoundations(entry,wrapper,anchor,yaw);
      if (entry.terrainChild) {
        const child = gltf.scene.getObjectByName(entry.terrainChild.name);
        const p=worldPoint(entry.terrainChild.x,entry.terrainChild.z,anchor,yaw);
        const height=baseSurface(p.x,p.z)?.height;
        if (child && Number.isFinite(height)) child.position.y += height-wrapper.position.y;
      }
      wrapper.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
      scene.add(wrapper);ready.set(entry.id,{entry,wrapper});
      Object.assign(states.get(entry.id),{status:'ready',position:{x:wrapper.position.x,y:wrapper.position.y,z:wrapper.position.z}});
      suppress(entry);
    } catch(error) {
      wrapper?.removeFromParent();ready.delete(entry.id);
      Object.assign(states.get(entry.id),{status:'error',error:String(error?.message || error)});
    }
  }
  return {
    load() { return loading ||= Promise.all(entries.map(loadEntry)); },
    reapplyReplacements() { for(const {entry} of ready.values()) suppress(entry); },
    getStatus() { return Object.fromEntries([...states].map(([id,state])=>[id,{...state}])); },
  };
}
