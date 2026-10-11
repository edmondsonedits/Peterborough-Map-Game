import { RenderedPavementIndex } from './official-road-surfaces.js';

/** Paint-only index of actual rendered fallback road tops. Municipal ownership
 * gates eligibility whenever it exists; its holes never gain inferred fallback.
 * Eligible paint may follow a higher actual compatible top within its local deck.
 * Ribbon bridge provenance comes from source/editor batch ranges, not material.
 * Foundations, curbs, sides, hidden meshes and unknown ribbon ranges are excluded.
 */
export function selectMappedArrowSupportIndex({ THREE, municipalIndex, roadGroup,
  segments = [], roadPaintRanges = new Map(), generatedRoadMeshes = new Map(), bounds } = {}) {
  const municipalOwned = municipalIndex?.triangleCount > 0;
  const index = new RenderedPavementIndex();
  if (!roadGroup || (bounds && !bounds.length)) return municipalOwned ? municipalIndex : index;
  roadGroup.updateWorldMatrix(true, true);
  const allowed = new Set(); roadGroup.traverseVisible(mesh => allowed.add(mesh));
  const bridgeByLine = new Map(), sourceDeckByLine = new Map(), roadKindByLine = new Map();
  for (const segment of segments) {
    const id=String(segment.lineId),bridge=Boolean(segment.profile?.bridge || segment.bridge),tunnel=Boolean(segment.profile?.tunnel);
    bridgeByLine.set(id,bridge);
    roadKindByLine.set(id,{highway:segment.tags?.highway,service:segment.tags?.service,
      parkingAisle:Boolean(segment.profile?.parkingAisle || segment.tags?.service==='parking_aisle')});
    sourceDeckByLine.set(id,`${bridge?'bridge':tunnel?'tunnel':'road'}:${segment.tags?.layer??(bridge?1:tunnel?-1:0)}`);
  }
  const capProvenance=(ids=[])=>({lineIds:ids.map(String),sourceDecks:[...new Set(ids.map(id=>sourceDeckByLine.get(String(id))).filter(Boolean))]});
  const matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  // Hash arrow windows so a full-city mesh scan does not compare every triangle
  // with every arrow. Only real faces intersecting an arrow window are retained.
  const windows = new Map(), cellSize = 64;
  if (bounds) for (const box of bounds) {
    for (let x = Math.floor(box[0]/cellSize); x <= Math.floor(box[2]/cellSize); x++)
      for (let z = Math.floor(box[1]/cellSize); z <= Math.floor(box[3]/cellSize); z++) {
        const key = `${x}:${z}`;
        if (!windows.has(key)) windows.set(key, []);
        windows.get(key).push(box);
      }
  }
  const near = (a,b,c) => {
    if (!bounds) return true;
    const minX=Math.min(a.x,b.x,c.x),maxX=Math.max(a.x,b.x,c.x),minZ=Math.min(a.z,b.z,c.z),maxZ=Math.max(a.z,b.z,c.z);
    for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)
      if(windows.get(`${x}:${z}`)?.some(box=>box[0]<=maxX&&box[2]>=minX&&box[1]<=maxZ&&box[3]>=minZ))return true;
    return false;
  };
  function append(mesh, startVertex, vertexCount, bridge, transform, capsOnly=false, provenance={}) {
    const geometry=mesh.geometry,position=geometry?.attributes?.position,normal=geometry?.attributes?.normal;
    if(!position)return;
    const ids=geometry.index,drawStart=geometry.drawRange?.start||0;
    const drawEnd=Math.min(ids?.count??position.count,drawStart+(geometry.drawRange?.count??Infinity));
    const start=ids?drawStart:Math.max(drawStart,startVertex),end=ids?drawEnd:Math.min(drawEnd,startVertex+vertexCount);
    for(let i=start;i+2<end;i+=3){
      const face=ids?[ids.getX(i),ids.getX(i+1),ids.getX(i+2)]:[i,i+1,i+2];
      if(face.some(v=>v<startVertex||v>=startVertex+vertexCount))continue;
      if(capsOnly&&(!normal||!face.every(v=>normal.getY(v)>.5)))continue;
      for(let j=0;j<3;j++)vertices[j].fromBufferAttribute(position,face[j]).applyMatrix4(transform);
      const [a,b,c]=vertices;
      // Actual upward-facing tops only: no underside or vertical wall support.
      if((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)<=1e-10||!near(a,b,c))continue;
      const metadata={layer:bridge?'bridges':'road_surfaces',bridge,drivable:true,fallbackRendered:true,...provenance};
      index.addTriangle(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,metadata);
    }
  }
  const seen = new Set();
  for(const [lineId,bridge] of bridgeByLine)for(const range of roadPaintRanges.get(lineId)||[]){
    const mesh=generatedRoadMeshes.get(range.key),identity=`${range.key}:${range.startVertex}:${range.vertexCount}`;
    if(!allowed.has(mesh)||mesh?.userData?.type!=='road-surface-batch'||seen.has(identity))continue;
    seen.add(identity);
    if(mesh.isInstancedMesh){
      for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);append(mesh,range.startVertex,range.vertexCount,bridge,matrix,false,{lineId,sourceDeck:sourceDeckByLine.get(lineId),sourceRoad:roadKindByLine.get(lineId)});}
    }else append(mesh,range.startVertex,range.vertexCount,bridge,mesh.matrixWorld,false,{lineId,sourceDeck:sourceDeckByLine.get(lineId),sourceRoad:roadKindByLine.get(lineId)});
  }
  roadGroup.traverseVisible(mesh=>{
    if(mesh.userData?.type==='road-junction-surfaces'&&mesh.isInstancedMesh){
      for(let i=0;i<mesh.count;i++){
        // Unclassified caps cannot safely support either bridge or street paint.
        const bridge=mesh.userData.bridgeInstances?.[i];if(typeof bridge!=='boolean')continue;
        mesh.getMatrixAt(i,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);
        append(mesh,0,mesh.geometry.attributes.position.count,bridge,matrix,true,capProvenance(mesh.userData.sourceLinesByInstance?.[i]));
      }
    }else if(mesh.userData?.type==='prototype-junction-surface'){
      for(const range of mesh.userData.surfaceRanges||[])
        append(mesh,range.startVertex,range.vertexCount,range.bridge,mesh.matrixWorld,false,capProvenance(range.lineIds));
    }
  });
  const visibleSample=(x,z,referenceHeight,options,sourceDeck=null)=>{
    if (!Number.isFinite(x)||!Number.isFinite(z)) return null;
    const hits=[];
    // Select municipal eligibility with the exact RenderedPavementIndex rules,
    // while collecting actual top faces in the same single cell scan.
    let municipalHit=null,municipalDistance=Infinity;
    for(const sourceIndex of municipalOwned ? [index,municipalIndex] : [index])
    for(const face of sourceIndex.cells.get(`${Math.floor(x/sourceIndex.cellSize)}:${Math.floor(z/sourceIndex.cellSize)}`)||[]){
      const dx=x-face.ax,dz=z-face.az,b=(dx*face.vz-dz*face.vx)*face.inverse,c=(face.ux*dz-face.uz*dx)*face.inverse;
      if(b< -1e-8||c< -1e-8||b+c>1+1e-8)continue;
      const municipalFace=sourceIndex===municipalIndex;
      const hit={...face.metadata,
        ...(municipalFace?{bridge:face.metadata.layer==='bridges',
          forbiddenParking:options?.includeParking===false&&face.metadata.layer==='parking_surfaces'}:{}),
        height:face.ay+b*face.dyB+c*face.dyC,heightSource:'rendered-pavement-triangle'};
      hits.push(hit);
      if (municipalFace && !hit.forbiddenParking && !(options?.includeBridges===false&&hit.bridge)) {
        const distance=Number.isFinite(referenceHeight)?Math.abs(hit.height-referenceHeight):0;
        if (!municipalHit || distance<municipalDistance-1e-8
          || (Math.abs(distance-municipalDistance)<=1e-8&&hit.height>municipalHit.height)) {
          municipalHit=hit;municipalDistance=distance;
        }
      }
    }
    if (municipalOwned && (!municipalHit
      || (sourceDeck?.startsWith('bridge:')&&municipalHit.layer!=='bridges'))) return null;
    const decksOf=hit=>hit.sourceDeck?[hit.sourceDeck]:hit.sourceDecks||[];
    let selected=municipalHit,best=Infinity;
    for(const hit of municipalHit ? [] : hits){
      if(options?.includeBridges===false&&hit.bridge)continue;
      if(sourceDeck&&!decksOf(hit).includes(sourceDeck))continue;
      const distance=Number.isFinite(referenceHeight)?Math.abs(hit.height-referenceHeight):0;
      if(!selected||distance<best-1e-8||(Math.abs(distance-best)<=1e-8&&hit.height>selected.height)){selected=hit;best=distance;}
    }
    if(!selected)return null;
    hits.sort((a,b)=>a.height-b.height);
    let at=hits.findIndex(hit=>Math.abs(hit.height-selected.height)<1e-8&&hit.bridge===selected.bridge);
    if(at<0)return null;
    // Explicit paint-only local-deck rule: gaps >1m separate stacked decks.
    // Within a cluster choose the highest actual face, never a guessed plane.
    // Source bridge/tunnel/layer conflicts fail closed, even within that band.
    // This is a bounded presentation rule, not a survey/clearance guarantee.
    while(at+1<hits.length&&hits[at+1].height-hits[at].height<=1)at++;
    const topHeight=hits[at].height;
    const decks=sourceDeck?[sourceDeck]:decksOf(selected);
    const compatible=hit=>{
      if(hit.forbiddenParking || hit.bridge!==selected.bridge)return false;
      const other=decksOf(hit);
      return !decks.length||!other.length||decks.some(deck=>other.includes(deck));
    };
    return hits.find(hit=>Math.abs(hit.height-topHeight)<1e-8&&compatible(hit))||null;
  };
  index.sample=visibleSample;
  index.eligibilitySample=(x,z,referenceHeight,options)=>municipalOwned
    ? municipalIndex.sample(x,z,referenceHeight,options) : null;
  index.forSource=(tags={},profile={})=>{
    const bridge=Boolean(profile.bridge||(tags.bridge&&tags.bridge!=='no')),tunnel=Boolean(profile.tunnel||(tags.tunnel&&tags.tunnel!=='no'));
    const deck=`${bridge?'bridge':tunnel?'tunnel':'road'}:${tags.layer??(bridge?1:tunnel?-1:0)}`;
    return {sample:(x,z,referenceHeight,options)=>visibleSample(x,z,referenceHeight,options,deck),
      eligibilitySample:(x,z,referenceHeight,options)=>{
        const hit=index.eligibilitySample(x,z,referenceHeight,options);
        return bridge && hit?.layer!=='bridges' ? null : hit;
      }};
  };
  return index;
}
