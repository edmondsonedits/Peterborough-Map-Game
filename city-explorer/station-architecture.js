// Original reference-inspired Station 1 architectural details; no image pixels.
export function addStationArchitecturalDetails(THREE, section, kind, length, roofY) {
 const metal=new THREE.MeshStandardMaterial({color:0x62635b,roughness:.8}),glass=new THREE.MeshStandardMaterial({color:0x658080,roughness:.35,metalness:.18}),yellow=new THREE.MeshStandardMaterial({color:0xe9bc32,roughness:.75});
 const box=(name,x,y,z,w,h,d,material=metal)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;section.add(m);return m;};
 const beam=(name,a,b,r=.045)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),6),metal);m.name=name;m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());section.add(m);};
 if(kind==='apparatus'){
  const width=(length-1.1)/5;
  for(let i=0;i<5;i++){const x=-length/2+.55+width*(i+.5);box('bay-canopy',x,4.83,.61,width-.12,.10,1.05);box('canopy-glazing',x,4.91,.54,width-.36,.035,.77,glass);}
  for(let i=0;i<=5;i++){const x=-length/2+.55+width*i;beam('canopy-diagonal',[x,5.43,.16],[x,4.79,1.10]);box('bay-pier-cap',x,4.66,.18,.25,.28,.34);const post=new THREE.Mesh(new THREE.CylinderGeometry(.10,.12,.88,8),yellow);post.name='yellow-bollard';post.position.set(x,.44,.52);section.add(post);}
  if(Number.isFinite(roofY)){
   box('roof-service-enclosure',0,roofY+.48,-5,length*.47,.96,2.6);box('roof-service-cap',0,roofY+1.01,-5,length*.48,.10,2.7);
   for(let i=0;i<7;i++)box('roof-louvre',-length*.20+i*length*.067,roofY+.47,-3.68,.055,.64,.045);
   for(let i=0;i<6;i++)beam('roof-rail-post',[-length*.23+i*length*.092,roofY+1.04,-3.7],[-length*.23+i*length*.092,roofY+1.77,-3.7],.025);
   beam('roof-safety-rail',[-length*.23,roofY+1.77,-3.7],[length*.23,roofY+1.77,-3.7],.025);
   beam('radio-mast',[-length*.14,roofY+1.04,-5],[-length*.14,roofY+4.25,-5],.026);
   for(let i=0;i<3;i++)beam('radio-crosspiece',[-length*.14-.26,roofY+2+i*.65,-5],[-length*.14+.26,roofY+2+i*.65,-5],.016);
  }
 }
 if(kind==='entry'){
  const w=Math.min(length*.85,2.8);box('entry-canopy',0,3.15,.64,w+.3,.16,1.08);box('entry-mullion',0,1.45,.32,.06,2.8,.08);
  for(const x of [-.17,.17])box('entry-door-pull',x,1.3,.40,.025,.42,.035);
 }
 if(kind==='office'){
  box('window-hood',-length*.08,2.53,.42,length*.64,.13,.43);
  // Short handrail beside the office; centre entrance is left clear.
  for(const x of [-length*.40,-length*.24])beam('office-handrail-post',[x,0,.9],[x,.90,.9],.025);
  beam('office-handrail',[-length*.40,.90,.9],[-length*.24,.90,.9],.025);
 }
 section.userData.referenceDetailKind=kind;
}
