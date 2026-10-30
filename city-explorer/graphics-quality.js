const PROFILES=Object.freeze({
 low:Object.freeze({name:'low',pixelRatio:0.85,shadows:false,roadRadius:650,roadRetainRadius:1000,buildingRadius:1700,streetDetailRadius:700,fogDensity:0.00145,roadSurface:'canonical'}),
 balanced:Object.freeze({name:'balanced',pixelRatio:1.1,shadows:false,roadRadius:900,roadRetainRadius:1350,buildingRadius:2400,streetDetailRadius:1050,fogDensity:0.001,roadSurface:'canonical'}),
 high:Object.freeze({name:'high',pixelRatio:1.65,shadows:true,roadRadius:1450,roadRetainRadius:1950,buildingRadius:4200,streetDetailRadius:1800,fogDensity:0.00065,roadSurface:'canonical'}),
});
export function resolveGraphicsQuality({search='',saved=null}={}){
 const params=new URLSearchParams(search);const requested=params.get('quality');
 const name=PROFILES[requested]?requested:params.get('lite')==='1'?'low':PROFILES[saved]?saved:'balanced';
 return PROFILES[name];
}
export function readGraphicsPreference(storage){try{return storage?.getItem('ptbo.graphicsQuality')||null;}catch{return null;}}
export function installGraphicsQualityControl({document,location,storage,profile}){
 const open=document.getElementById('graphics-quality-open'),dialog=document.getElementById('graphics-quality-dialog'),select=document.getElementById('graphics-quality-select'),apply=document.getElementById('graphics-quality-apply');
 if(!open||!dialog||!select||!apply)return;
 select.value=profile.name;open.addEventListener('click',()=>dialog.showModal());
 apply.addEventListener('click',()=>{const name=select.value;if(!PROFILES[name])return;try{storage?.setItem('ptbo.graphicsQuality',name);}catch{}const url=new URL(location.href);url.searchParams.set('quality',name);url.searchParams.delete('lite');location.assign(url.href);});
}
