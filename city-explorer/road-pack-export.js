export function collectRoadSourceRanges(generatedRoadMeshes,roadPaintRanges){
  const rangesByMesh = new Map();
  for (const [sourceId, ranges] of roadPaintRanges) for (const range of ranges) {
    const mesh = generatedRoadMeshes.get(range.key);
    if (!mesh) continue;
    if (!rangesByMesh.has(mesh)) rangesByMesh.set(mesh, []);
    rangesByMesh.get(mesh).push({sourceId,...range});
  }
  return rangesByMesh;
}
/** Read-only build-time snapshot of the road geometry actually sent to WebGL. */
export function exportRoadScene({ THREE, roadGroup, streetscapeGroup, generatedRoadMeshes = new Map(), roadPaintRanges = new Map(), onlyMeshId = null, sourceRangesByMesh = null }) {
  const meshRanges=sourceRangesByMesh||collectRoadSourceRanges(generatedRoadMeshes,roadPaintRanges);
  const output=[];
  for(const [parent,paint] of [[roadGroup,false],[streetscapeGroup,true]]) {
    parent.updateMatrixWorld(true);
    for(const mesh of parent.children) {
      if(onlyMeshId&&mesh.uuid!==onlyMeshId)continue;
      const type=mesh.userData.type || '';
      const selected=paint ? /^(road-lane-dashes|road-centre-lines|mapped-cycle-lane-edges|road-edge-lines|mapped-turn-arrows|mapped-crossing-|mapped-stop-)/.test(type)
        : /^(road-(surface|foundation|official-.*)-batch|connected-road-|official-curb-ribbons|terrain-following-urban-curbs|prototype-junction-)/.test(type);
      if(!selected || !mesh.geometry?.getAttribute('position'))continue;
      const geometry=mesh.geometry;const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),indices=geometry.getIndex();
      const count=indices?.count || position.count;const positions=[],normals=[];
      const instances=mesh.isInstancedMesh ? mesh.count : 1;
      for(let instance=0;instance<instances;instance++) {
        const transform=mesh.matrixWorld.clone();
        if(mesh.isInstancedMesh){const matrix=new THREE.Matrix4();mesh.getMatrixAt(instance,matrix);transform.multiply(matrix);}
        const normalMatrix=new THREE.Matrix3().getNormalMatrix(transform);
        for(let offset=0;offset<count;offset++) {
          const index=indices?indices.getX(offset):offset;
          const p=new THREE.Vector3().fromBufferAttribute(position,index).applyMatrix4(transform);
          positions.push(Math.fround(p.x),Math.fround(p.y),Math.fround(p.z));
          const n=normal?new THREE.Vector3().fromBufferAttribute(normal,index).applyMatrix3(normalMatrix).normalize():new THREE.Vector3(0,1,0);
          normals.push(Math.fround(n.x),Math.fround(n.y),Math.fround(n.z));
        }
      }
      const official=type.startsWith('road-official-');
      const layer=official?type.slice('road-official-'.length,-'-batch'.length):'road_surfaces';
      const surface=official || type==='road-surface-batch' || type==='connected-road-surface' || type==='connected-road-junction';
      output.push({materialKey:mesh.userData.material || (paint?'roadPaintWhite':'curb'),kind:paint?'paint':official?`official-${layer}`:surface?'surface':'foundation',layer,
        contact:paint||!surface?null:official?'official':'fallback',positions,normals,
        sourceRanges:indices||instances!==1?[]:(meshRanges.get(mesh)||[]).map(({key,...range})=>range)});
    }
  }
  return output;
}
