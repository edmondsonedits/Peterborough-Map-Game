'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
test('every eligible non-Peterborough dispatch base has explicit fitted driving geometry',()=>{
 const c={window:{}};vm.runInNewContext(read('cities/city-registry.js'),c);
 const missing=[],invalid=[];let total=0;
 for(const city of c.window.PTBO_CITIES){
  if(city.id==='peterborough')continue; // Its authored package geometry is covered by runtime exit checks.
  const geo=JSON.parse(read(`cities/${city.id}/geo-data.json`));
  for(const base of geo.bases.filter(b=>b.status==='active'&&b.selectionEligible!==false&&['fire','ems'].includes(b.service))){
   total++;const a=base.drivingArea,id=`${city.id}/${base.id}`;
   if(!a){missing.push(id);continue;}
   const required=['lat','lng','yardWidth','yardLength','yardRotation','spawnLat','spawnLng'];
   if(required.some(k=>!Number.isFinite(a[k]))||a.yardWidth<10||a.yardWidth>600||a.yardLength<10||a.yardLength>600||a.yardRotation<0||a.yardRotation>=360)invalid.push(id);
  }
 }
 assert.ok(total>0,'registered roster must be populated');
 assert.equal(invalid.length,0,`Invalid fitted areas: ${invalid.join(', ')}`);
 assert.equal(missing.length,0,`${missing.length}/${total} eligible bases still lack fitted areas: ${missing.join(', ')}`);
});
