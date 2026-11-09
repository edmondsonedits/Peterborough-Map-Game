import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraBayInfluence, cameraFraming, clampBayCamera, installCameraViewControl, vehicleCameraPose} from '../city-explorer/gameplay-camera.mjs';

const bay={minX:-9,maxX:9,minZ:0,maxZ:23};
test('automatic camera is close inside, remains close until the truck clears, and returns to standard outside',()=>{
 assert.equal(cameraBayInfluence({x:0,z:9},bay,5.2),1);
 assert.equal(cameraBayInfluence({x:0,z:-5.2},bay,5.2),1);
 assert.ok(cameraBayInfluence({x:0,z:-9},bay,5.2)>0);
 assert.ok(cameraBayInfluence({x:0,z:-9},bay,5.2)<1);
 assert.equal(cameraBayInfluence({x:0,z:-14},bay,5.2),0);
 assert.equal(cameraBayInfluence({x:1000,z:-1000},bay,5.2),0);
 assert.deepEqual(cameraFraming('auto',1),{scale:.82,driveHeight:.85});
 assert.deepEqual(cameraFraming('auto',0),{scale:1,driveHeight:3.4});
 const middle=cameraFraming('auto',.5);assert.ok(middle.scale>.82&&middle.scale<1);
 assert.ok(10.2*cameraFraming('auto',1).scale*Math.cos(.19)-2.2>5.2+.6,'close driving view remains behind the rear of the truck');
});
test('presets retain their distance while interior height clearance remains shared',()=>{
 for(const [view,scale]of[['close',.82],['standard',1],['wide',1.38]]){
  assert.equal(cameraFraming(view,0).scale,scale);assert.equal(cameraFraming(view,1).scale,scale);
  assert.equal(cameraFraming(view,1).driveHeight,.85);
 }
 assert.equal(cameraFraming('invalid',0).scale,1);
});
test('bay camera clips the view ray inside rear and side walls and leaves an inside camera unchanged',()=>{
 const clipped=clampBayCamera({x:0,z:9},{x:5,z:40},bay);
 assert.ok(clipped.z<=22.35);assert.ok(clipped.x<5);
 const side=clampBayCamera({x:0,z:9},{x:30,z:10},bay);assert.ok(side.x<=8.35);
 assert.deepEqual(clampBayCamera({x:0,z:9},{x:2,z:12},bay),{x:2,z:12});
 assert.ok(Number.isFinite(clampBayCamera({x:100,z:-100},{x:100,z:100},bay).x));
});
test('camera settings apply immediately, persist, and tolerate denied storage',()=>{
 let change;const select={value:'',addEventListener:(_,fn)=>{change=fn;}};
 const saved=new Map([['ptbo.cameraView','wide']]),applied=[];
 const control=installCameraViewControl({document:{getElementById:()=>select},storage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},onChange:v=>applied.push(v)});
 assert.equal(control.view,'wide');assert.equal(select.value,'wide');
 select.value='close';change();assert.equal(control.view,'close');assert.deepEqual(applied,['close']);assert.equal(saved.get('ptbo.cameraView'),'close');
 assert.equal(control.setView('cab'),true);assert.equal(control.view,'cab');assert.equal(saved.get('ptbo.cameraView'),'cab');
 assert.equal(control.setView('invalid'),false);assert.equal(control.view,'cab');
 const fallback=installCameraViewControl({document:{getElementById:()=>null},storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});
 assert.equal(fallback.view,'auto');assert.equal(fallback.setView('standard'),true);assert.equal(fallback.view,'standard');
});

test('cab and bonnet camera poses follow vehicle heading and support independent look offsets',()=>{
 const tuning={length:10,width:2.5,height:3.2};
 const north=vehicleCameraPose({x:10,y:2,z:30,heading:0},tuning,'cab');
 assert.ok(north.position.z<30&&north.position.y>2);
 assert.ok(north.target.z<north.position.z);
 const east=vehicleCameraPose({x:10,y:2,z:30,heading:Math.PI/2},tuning,'bonnet');
 assert.ok(east.position.x<10&&Math.abs(east.position.z-30)<1e-9);
 assert.ok(east.target.x<east.position.x);
 const looked=vehicleCameraPose({x:10,y:2,z:30,heading:0},tuning,'cab',{yawOffset:Math.PI/3,pitch:.12});
 assert.ok(looked.target.x<north.target.x);
 assert.ok(looked.target.y>north.target.y);
 assert.deepEqual(looked.position,north.position,'look offset rotates the aim without moving the cab eye');
});
