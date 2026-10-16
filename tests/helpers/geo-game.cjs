'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function catalog(){return JSON.parse(zlib.gunzipSync(Buffer.from(read('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD = '([^']+)'/)[1],'base64')));}
async function game({storageDenied=false,savedCross=null,cityPackage=null,cityReady,locations=catalog(),baseRecords,developerMode=false}={}){
 const nodes=new Map(),storage=new Map([...(savedCross===null?[]:[['geoShowCrossStreets',savedCross]]),...(developerMode?[['ptbo-emergency-developer-mode','enabled']]:[])]),listeners={},views=[],layers=[],fits=[],removed=[];let focused=null;
 function node(id){if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,textContent:'',hidden:false,disabled:false,checked:true,dataset:{},children:[],style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;},appendChild(n){this.children.push(n);},replaceChildren(...n){this.children=n;},focus(){focused=this;},getBoundingClientRect(){return{top:0,bottom:180,width:390,height:180,left:0,right:390};}});}return nodes.get(id);}
 function getElementById(id){if(/^practice-base-\d+$/.test(id))return nodes.get('practice-stations')?.children?.find(child=>child.id===id)||null;return node(id);}
 const map={center:{lat:44,lng:-78},zoom:18,options:{},attributionControl:{setPrefix(){}},getContainer:()=>node('map'),stop(){return this;},invalidateSize(){},setView(p,z){this.center={lat:p[0],lng:p[1]};this.zoom=z;views.push({p,z});return this;},getCenter(){return this.center;},getZoom(){return this.zoom;},setZoom(z){this.zoom=z;},removeLayer(item){removed.push(item);},fitBounds(bounds,options){fits.push({bounds,options});},distance(a,b){return Math.hypot((a[0]-b[0])*111000,(a[1]-b[1])*80000);}};
 const layer=(kind,position,options)=>{const item={kind,position,options,addTo(){return this;},bindTooltip(label){this.label=label;return this;},clearLayers(){this.cleared=true;},getBounds(){return{extend(){return this;}};}};layers.push(item);return item;};
 const c=vm.createContext({console,URL,Math,Number,setTimeout:fn=>{fn();return 1;},clearTimeout(){},requestAnimationFrame:fn=>fn(),
 document:{getElementById,querySelectorAll:()=>[],createElement:tag=>({...node('created'+nodes.size),tagName:tag})},
 localStorage:{getItem(k){if(storageDenied)throw Error('Denied');return storage.get(k)||null;},setItem(k,v){if(storageDenied)throw Error('Denied');storage.set(k,String(v));}},
 location:{href:"https://example.test/game/geo-guesser/index.html",reload(){}},addEventListener:(n,fn)=>listeners[n]=fn,
 PTBO_CITY_PACKAGE:cityPackage,PTBO_GEO_CITY_READY:cityReady,PTBO_DISPATCH_STORE:{ready:async()=>{},getAll:()=>locations},PTBO_GEO_MAP_PROVIDER:{requireReady:()=>true,createStreetLayer:()=>layer()},
 PTBO_BASE_STORE:{getBases:s=>baseRecords?.filter(b=>b.service===s)||[{name:s==='ems'?'Armour Road Base':'Station 1',address:s==='ems'?'310 Armour Rd':'210 Sherbrooke St',lat:s==='ems'?44.304776:44.30102,lng:s==='ems'?-78.303384:-78.32202}]},
 L:{map:()=>map,layerGroup:()=>layer('group'),circle:(p,o)=>layer('circle',p,o),circleMarker:(p,o)=>layer('marker',p,o),polyline:(p,o)=>layer('line',p,o)}});
 c.window=c;vm.runInContext(read('geo-guesser/station-practice.js'),c);
 // Full application, with only DOM/map I/O replaced; selection and session logic stay real.
 const app=fs.existsSync(path.join(root,'geo-guesser/app.js'))?read('geo-guesser/app.js'):'';
 vm.runInContext(app,c);await c.PTBO_GEO_READY;
 return{api:c.PTBO_GEO,node,storage,map,views,c,layers,fits,removed,get activeElement(){return focused;}};
}
module.exports={game,catalog};
