/** QA-only pixel differential, never used for normal rendering or movement. */
export function measureMappedArrowVisibility({THREE,renderer,scene,camera,meshes,ranges,createCanvas,meshType='mapped-turn-arrows'}) {
  const canvas=createCanvas(),width=renderer.domElement.width,height=renderer.domElement.height;
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('QA pixel canvas unavailable');
  const arrows=[...meshes.values()].filter(mesh=>mesh.userData?.type===meshType);
  const visibility=arrows.map(mesh=>[mesh,mesh.visible]);
  const capture=()=>{renderer.render(scene,camera);context.drawImage(renderer.domElement,0,0);return context.getImageData(0,0,width,height).data;};
  try {
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const bounds=[];
    for(const range of ranges) {
      const mesh=meshes.get(range.key);if(!mesh?.visible||mesh.userData?.type!==meshType)continue;
      const p=mesh.geometry.getAttribute('position');
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(let i=range.startVertex;i<range.startVertex+range.vertexCount;i++) {
        const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).project(camera);
        if(v.z < -1 || v.z > 1)continue;
        const x=(v.x+1)*width/2,y=(1-v.y)*height/2;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
      if(!Number.isFinite(minX)||maxX<0||minX>=width||maxY<0||minY>=height)continue;
      bounds.push({_range:range,kind:range.kind || mesh.userData.kind,x0:Math.max(0,Math.floor(minX)-1),x1:Math.min(width-1,Math.ceil(maxX)+1),y0:Math.max(0,Math.floor(minY)-1),y1:Math.min(height-1,Math.ceil(maxY)+1)});
    }
    const painted=capture();
    const compare=(b,bare)=>{
      let changedPixels=0,brighterPixels=0;
      for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++) {
        const i=(y*width+x)*4;
        const differences=[0,1,2].map(c=>painted[i+c]-bare[i+c]);
        if(Math.max(...differences.map(Math.abs))>=12)changedPixels++;
        if(differences.reduce((a,v)=>a+v,0)>=30)brighterPixels++;
      }
      const {_range,...box}=b;
      return {...box,changedPixels,brighterPixels};
    };
    let targets;
    if(meshType==='historical-road-paint') {
      // Isolate each actual range so overlapping boxes cannot borrow another
      // stroke's visible pixels. Restore GPU attributes even if readback fails.
      targets=bounds.map(b=>{
        const range=b._range,attribute=meshes.get(range.key).geometry.getAttribute('position');
        const start=range.startVertex*3,end=start+range.vertexCount*3;
        const original=attribute.array.slice(start,end);
        try {
          attribute.array.fill(0,start,end);attribute.needsUpdate=true;
          return compare(b,capture());
        } finally {attribute.array.set(original,start);attribute.needsUpdate=true;}
      });
    } else {
      arrows.forEach(mesh=>{mesh.visible=false});const bare=capture();
      targets=bounds.map(b=>compare(b,bare));
    }
    return {width,height,targets};
  } finally {
    visibility.forEach(([mesh,visible])=>{mesh.visible=visible});renderer.render(scene,camera);
  }
}
