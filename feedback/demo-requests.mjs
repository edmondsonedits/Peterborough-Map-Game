import {normalizeNewThread} from './model.mjs?v=demo-feedback-20261028';

const modes=Object.freeze({geo:'Geo Guesser',route:'Route Mapping',dispatch:'Dispatch Simulator',explorer:'City Explorer'});

// Reuse the feedback transaction, server timestamps and owner-scoped access.
// Attempts stay in memory; a legacy browser counter is never a delivery receipt.
export function createDemoRequests(service,context){
 const attempts=new Map();
 let epoch=0;
 const key=(city,mode)=>`${service.account?.uid}:${city}:${mode}`;
 function status(city,mode){
  const attempt=attempts.get(key(city,mode));
  return {remoteSaved:attempt?.received===true,...(attempt?.received?{thread:attempt.thread}: {})};
 }
 async function send({city,cityName,mode}={}){
  if(typeof city!=='string'||city.length>60||!(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).test(city)||Object.hasOwn(Object.prototype,city)||!Object.hasOwn(modes,mode)||typeof cityName!=='string'||!cityName.trim()||cityName.length>80)
   throw new Error('Choose a valid city and demo mode.');
  await service.ensureGuest();
  const uid=service.account?.uid,token=epoch;
  if(!uid)throw new Error('Could not open a private request session. Please try again.');
  const requestKey=key(city,mode);
  if(!attempts.has(requestKey)){
   const title = `${mode === 'explorer' ? 'City demo request' : 'Full version request'} · ${cityName} · ${modes[mode]}`;
   const body = mode === 'explorer'
     ? `I would like a demo of ${modes[mode]} for ${cityName}.`
     : `I would like the full version of ${modes[mode]} for ${cityName}.`;
   const value=normalizeNewThread({category:'demo',title,body,city,mode},context());
   attempts.set(requestKey,{thread:{id:service.id(),ownerId:uid,...value,status:'new',priority:'normal'},messageId:service.id(),received:false});
  }
  const attempt=attempts.get(requestKey);
  if(attempt.received)return attempt.thread;
  if(!attempt.pending){
   attempt.pending=(async()=>{
    const {id,ownerId,status,priority,...value}=attempt.thread;
    await service.send({threadId:id,messageId:attempt.messageId,body:value.body,newThread:value});
    if(service.account?.uid!==uid||epoch!==token)throw new Error('Your account changed. Reopen demo requests to continue.');
    attempt.received=true;
    return attempt.thread;
   })().finally(()=>{attempt.pending=null;});
  }
  return attempt.pending;
 }
 return{send,status,reset(){epoch++;attempts.clear();}};
}
