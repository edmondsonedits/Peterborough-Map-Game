/** Recoverable asset failure policy; source generation remains independently usable. */
export function createRoadRecovery({onFallback,maxAttempts=3}){
 if(typeof onFallback!=='function'||!Number.isInteger(maxAttempts)||maxAttempts<1)throw new TypeError('Invalid road recovery policy');
 const attempts=new Map();let triggered=false;
 return {failed(id){if(triggered)return false;const count=(attempts.get(id)||0)+1;attempts.set(id,count);if(count<maxAttempts)return false;triggered=true;onFallback(id);return true;},succeeded(id){attempts.delete(id);}};
}
export function roadFallbackUrl(href,pose){
 const url=new URL(href);url.searchParams.set('roadPack','0');
 const resume={x:pose.x,z:pose.z,y:pose.y,heading:pose.heading,mode:pose.mode==='driving'?'driving':'onFoot'};
 if(![resume.x,resume.z,resume.y,resume.heading].every(Number.isFinite))throw new TypeError('Invalid road recovery pose');
 url.searchParams.set('roadResume',JSON.stringify(resume));return url.href;
}
export function readRoadResume(search,bounds){
 try{const value=JSON.parse(new URLSearchParams(search).get('roadResume'));if(!value||![value.x,value.z,value.y,value.heading].every(Number.isFinite)||!['driving','onFoot'].includes(value.mode)||value.x<bounds.minX||value.x>bounds.maxX||value.z<bounds.minZ||value.z>bounds.maxZ||Math.abs(value.y)>10000)return null;return{x:value.x,z:value.z,y:value.y,heading:value.heading,mode:value.mode};}catch{return null;}
}
