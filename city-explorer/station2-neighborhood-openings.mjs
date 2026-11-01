// Original shared opaque opening artwork. Each texture is reused city-block-wide.
export function createStation2OpeningMaterials(THREE) {
  const result=new Map();
  for(const kind of ['window','window-curtain','door','garage']) {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
    const c=canvas.getContext('2d');
    c.fillStyle='#d7d1c3';c.fillRect(0,0,128,256);
    c.fillStyle='#666b66';c.fillRect(4,4,120,248);
    if(kind.startsWith('window')) {
      const g=c.createLinearGradient(0,0,100,256);g.addColorStop(0,'#657e87');g.addColorStop(.48,'#354a55');g.addColorStop(1,'#23323b');c.fillStyle=g;c.fillRect(9,9,110,238);
      if(kind==='window-curtain'){c.fillStyle='#aaa99a';c.fillRect(10,12,22,226);c.fillRect(96,12,22,226);c.fillStyle='#858a81';for(let x of [15,23,102,110])c.fillRect(x,12,2,226);}
      c.fillStyle='rgba(180,203,206,.12)';c.beginPath();c.moveTo(12,12);c.lineTo(113,12);c.lineTo(12,93);c.fill();
      c.fillStyle='#d0cabc';c.fillRect(9,124,110,7);c.fillRect(61,9,6,238);
      c.fillStyle='#eef0de';c.fillRect(8,246,112,5);
    } else if(kind==='door') {
      c.fillStyle='#475651';c.fillRect(9,7,110,244);
      for(const y of [20,127]){c.fillStyle='#283b35';c.fillRect(19,y,90,95);c.fillStyle='#617069';c.fillRect(23,y+4,82,87);c.fillStyle='#42554c';c.fillRect(26,y+8,76,80);}
      c.fillStyle='#bdab80';c.fillRect(101,130,5,22);c.fillStyle='#a8a99b';c.fillRect(5,249,118,5);
    } else {
      c.fillStyle='#bbb9ad';c.fillRect(8,8,112,240);
      for(let y=15;y<248;y+=38){c.fillStyle='#81877f';c.fillRect(8,y,112,2);c.fillStyle='#d5d3c5';c.fillRect(8,y+3,112,2);}
      c.fillStyle='#354a55';for(let x=17;x<115;x+=28)c.fillRect(x,48,19,24);
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:kind.startsWith('window')?.55:.9,metalness:0});
    result.set('station2-'+kind,material);
  }
  return result;
}