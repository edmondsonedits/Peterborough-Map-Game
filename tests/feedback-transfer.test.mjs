import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signInPreservingGuest,resumeGuestTransfers} from '../feedback/guest-transfer.mjs';
function fixture(){
 const state={auth:{currentUser:{uid:'guest',isAnonymous:true}},events:[],failGrant:false,failPassword:false,failBatch:false,threads:[{id:'t',ownerId:'guest'}]};
 const api={collection:(db,...path)=>path.join('/'),doc:(db,...path)=>path.join('/'),where:(...x)=>x,limit:n=>n,query:(...x)=>x,serverTimestamp:()=>123,
  async getDocsFromServer(q){const path=Array.isArray(q)?q[0]:q;if(path.startsWith('feedbackTransfers'))return{docs:[{id:'guest',data:()=>({guestId:'guest',targetId:'target'})}]};const rows=state.threads.filter(t=>t.ownerId==='guest');return{docs:rows.map(t=>({id:t.id,ref:t.id,data:()=>t})),empty:!rows.length};},
  async getDocFromServer(){return{exists:()=>false};},
  async setDoc(){state.events.push('grant');if(state.failGrant)throw Error('grant failed');},
  async signInWithEmailAndPassword(auth){state.events.push(auth===state.auth?'main-signin':'verify');if(state.failPassword)throw Error('wrong password');auth.currentUser={uid:'target',isAnonymous:false};return{user:auth.currentUser};},
  writeBatch(){return{update(ref,data){state.events.push('owner-update');this.updateData=data;},async commit(){if(state.failBatch)throw Error('offline');state.threads.forEach(t=>t.ownerId='target');}};}
 };
 const verifyCredentials=async(email,password)=>{const auth={};try{return await api.signInWithEmailAndPassword(auth,email,password);}finally{state.events.push('secondary-cleanup');}};
 return{state,api,db:{},auth:state.auth,verifyCredentials};
}
test('verify target and persist guest authorization before replacing the primary identity',async()=>{
 const f=fixture();await signInPreservingGuest(f,'a@example.test','password');assert.deepEqual(f.state.events.slice(0,4),['verify','secondary-cleanup','grant','main-signin']);await resumeGuestTransfers(f);assert.equal(f.state.threads[0].ownerId,'target');
});
test('wrong password or unavailable transfer rules keep the guest identity and history accessible',async()=>{
 for(const failure of ['failPassword','failGrant']){const f=fixture();f.state[failure]=true;await assert.rejects(signInPreservingGuest(f,'a','p'));assert.equal(f.auth.currentUser.uid,'guest');assert.equal(f.state.threads[0].ownerId,'guest');}
});
test('interrupted ownership moves resume without duplicating or deleting messages',async()=>{
 const f=fixture();await signInPreservingGuest(f,'a','p');f.state.failBatch=true;await assert.rejects(resumeGuestTransfers(f));assert.equal(f.state.threads[0].ownerId,'guest');f.state.failBatch=false;await resumeGuestTransfers(f);await resumeGuestTransfers(f);assert.equal(f.state.threads.length,1);assert.equal(f.state.events.filter(x=>x==='owner-update').length,2);
});
