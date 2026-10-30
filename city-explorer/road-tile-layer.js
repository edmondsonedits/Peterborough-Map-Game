import {decodeRoadTile,PackedRoadSurfaceIndex} from './road-tile-pack.js?v=1.6.154';
import {RoadTileStream} from './road-tile-stream.js?v=1.6.154';
/** One owner for resident road geometry, contact and resource lifetime. */
export function createRoadTileLayer({THREE,parent,materials,manifest,baseUrl,load=fetch,
  materialFactory=material=>material.clone(),onRanges=()=>{},onReleaseRanges=()=>{},onError=()=>{},radius=1000,retainRadius=1500}) {
  const index=new PackedRoadSurfaceIndex();const meshes=new Map(),sharedMaterials=new Map();let disposed=false;
  const materialFor=group=>{
    const key=`${group.materialKey}:${group.kind==='paint'?'paint':'surface'}`;
    if(!sharedMaterials.has(key)){
      const source=materials[group.materialKey]||materials.roadLocal||Object.values(materials)[0];
      const material=materialFactory(source);material.vertexColors=false;
      if(group.kind==='paint'){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;}
      sharedMaterials.set(key,material);
    }
    return sharedMaterials.get(key);
  };
  const stream=new RoadTileStream({manifest,radius,retainRadius,concurrency:3,onError,
    loadTile:async(tile,{signal})=>{
      const url=new URL(tile.url,baseUrl);if(url.origin!==new URL(baseUrl).origin)throw new Error('Road tile origin mismatch');
      const response=await load(url.href,{signal,cache:'force-cache'});if(!response.ok)throw new Error(`Road tile ${tile.id}: HTTP ${response.status}`);
      let buffer=await response.arrayBuffer();
      const signature=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength));
      if(signature[0]===0x1f&&signature[1]===0x8b){if(typeof DecompressionStream!=='function')throw new Error('Compressed road tiles unsupported');buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
      if(tile.sha256){const digest=await globalThis.crypto.subtle.digest('SHA-256',buffer);const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');if(hash!==tile.sha256)throw new Error('Road tile content hash mismatch');}
      const data=decodeRoadTile(buffer);if(data.id!==tile.id)throw new Error('Road tile identity mismatch');
      return {...data,byteLength:buffer.byteLength};
    },
    commitTile:(id,tile)=>{
      if(disposed)return;
      const children=[];
      try{
        for(let i=0;i<tile.groups.length;i++){
          const group=tile.groups[i];if(!group.positions.length)continue;
          const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(group.positions,3));
          if(group.normals)geometry.setAttribute('normal',new THREE.BufferAttribute(group.normals,3));else geometry.computeVertexNormals();
          geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,materialFor(group));
          // Receiving is free when the selected profile disables shadow maps.
          mesh.receiveShadow=group.kind!=='paint';
          mesh.renderOrder=group.kind==='paint'?7:group.contact==='official'?4:group.contact==='fallback'?3:2;
          mesh.userData={type:'packed-road-tile',roadTileId:id,material:group.materialKey,kind:group.kind,layer:group.layer,bytes:group.positions.byteLength+(group.normals?.byteLength||0)};
          children.push({mesh,group,key:`road-tile:${id}:${i}`});
        }
        index.addTile(id,tile.groups);
        for(const child of children){parent.add(child.mesh);onRanges(child.mesh,child.group.sourceRanges||[],child.key);}
        meshes.set(id,children);
      }catch(error){for(const child of children){parent.remove(child.mesh);child.mesh.geometry.dispose();}index.removeTile(id);throw error;}
    },
    releaseTile:(id,tile)=>{
      // A stale download has never committed. Its release cannot evict a newer generation.
      const children=meshes.get(id);if(!children||children[0]?.group.positions.buffer!==tile.groups?.[0]?.positions.buffer)return;
      for(const child of children){parent.remove(child.mesh);onReleaseRanges(child.key);child.mesh.geometry.dispose();}
      meshes.delete(id);index.removeTile(id);
    }});
  return {
    update:(x,z,options)=>stream.update(x,z,options),
    sample:(...args)=>index.sample(...args),
    readyAt(x,z,padding=8){
      if(disposed||![x,z,padding].every(Number.isFinite))return false;
      return manifest.tiles.every(tile=>x+padding<tile.bounds.minX||x-padding>tile.bounds.maxX
        ||z+padding<tile.bounds.minZ||z-padding>tile.bounds.maxZ||stream.resident.has(tile.id));
    },
    stats:()=>({...stream.stats(),meshCount:[...meshes.values()].reduce((sum,children)=>sum+children.length,0),triangleCount:[...index.tiles.values()].reduce((sum,tile)=>sum+tile.triangleOffsets.length,0)}),
    async dispose(){if(disposed)return;disposed=true;await stream.dispose();for(const material of sharedMaterials.values())material.dispose();sharedMaterials.clear();},
  };
}

/** Load one coherent pack identity for the current city data generation. */
export async function loadRoadTileManifest({url,sourceGeneratedAt,terrain=null,load=fetch}){
 const response=await load(url,{cache:'no-store'});
 if(!response.ok)throw new Error(`Road pack manifest HTTP ${response.status}`);
 const manifest=await response.json();
 if(manifest.schemaVersion!==1||!/^[a-f0-9]{20}$/.test(manifest.buildId||'')||manifest.sourceGeneratedAt!==sourceGeneratedAt)throw new Error('Road pack source identity mismatch');
 if(terrain&&(manifest.terrain?.source!==terrain.source||manifest.terrain?.segments!==terrain.segments||!Number.isFinite(manifest.terrain?.size)||Math.abs(manifest.terrain.size-terrain.size)>0.00001))throw new Error('Road pack terrain identity mismatch');
 return manifest;
}
