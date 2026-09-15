// Original illustrative details. No photograph pixels or downloaded graphics.
export function canadianFlagPixels(width=128,height=64) {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<8)throw Error('Flag dimensions too small');
 const data=new Uint8Array(width*height*4);
 const leaf=[[0,.85],[.13,.46],[.26,.59],[.23,.20],[.51,.37],[.44,.07],[.75,.08],[.47,-.22],[.53,-.36],[.09,-.30],[.08,-.64],[-.08,-.64],[-.09,-.30],[-.53,-.36],[-.47,-.22],[-.75,.08],[-.44,.07],[-.51,.37],[-.23,.20],[-.26,.59],[-.13,.46]];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=(x+.5)/width,v=(y+.5)/height,px=(u-.5)*4,py=(v-.5)*2;
  let inside=false;
  for(let i=0,j=leaf.length-1;i<leaf.length;j=i++){
   const a=leaf[i],b=leaf[j];if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  const red=u<.25||u>.75||inside,index=(y*width+x)*4;
  data.set(red?[205,35,48,255]:[246,245,237,255],index);
 }
 return data;
}
export function createStationFlagMaterial(THREE){
 const texture=new THREE.DataTexture(canadianFlagPixels(),128,64,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
}
export function addStationFlowers(THREE,root,leaves){
 const points=leaves.filter((_,i)=>i%5===0);
 if(!points.length)return;
 const flowers=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95}),points.length);
 const dummy=new THREE.Object3D();
 points.forEach((point,i)=>{
  dummy.position.set(point.x,point.y+.065,point.z);dummy.scale.set(.13*point.size,.065,.12*point.size);dummy.rotation.y=point.angle;dummy.updateMatrix();flowers.setMatrixAt(i,dummy.matrix);
  flowers.setColorAt(i,new THREE.Color(i%9===0?0xf4ede0:0xc52b43));
 });
 flowers.receiveShadow=true;flowers.userData={type:'illustrative-station-flowers',evidence:'reference-inspired colours; not measured species/plant positions'};root.add(flowers);
}
