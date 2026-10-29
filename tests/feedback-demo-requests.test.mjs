import {test} from 'node:test';
import assert from 'node:assert/strict';
const {createDemoRequests} = await import('../feedback/demo-requests.mjs').catch(()=>({}));

function fixture(){
 let account={uid:'guest-one'},id=0,ack,fail=false;
 const writes=[];
 const service={get account(){return account;},id:()=>`id-${++id}`,async ensureGuest(){return account;},
  async send(payload){writes.push(structuredClone(payload));if(fail)throw Error('offline');await new Promise(r=>ack=r);}};
 const controller=createDemoRequests(service,()=>({department:'ems',version:'1.6.148'}));
 return{controller,writes,release(){ack();},setFail(value){fail=value;},change(uid){account={uid};}};
}
const request={city:'oshawa',cityName:'Oshawa',mode:'route'};
test('demo requests become feedback messages only after acknowledgement; duplicate clicks reuse one immutable attempt',async()=>{
 const f=fixture(),first=f.controller.send(request),second=f.controller.send(request);
 await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.controller.status('oshawa','route').remoteSaved,false);
 const p=f.writes[0];assert.equal(p.newThread.category,'demo');assert.equal(p.newThread.city,'oshawa');assert.equal(p.newThread.mode,'route');assert.equal(p.newThread.department,'ems');assert.match(p.body,/Route Mapping.*Oshawa/);
 f.release();const receipt=await first;assert.equal((await second).id,receipt.id);assert.equal(f.controller.status('oshawa','route').remoteSaved,true);
 assert.equal((await f.controller.send(request)).id,receipt.id);assert.equal(f.writes.length,1);
});
test('a failed demo retry retains IDs and original payload even if page context changes',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.controller.send(request),/offline/);assert.equal(f.controller.status('oshawa','route').remoteSaved,false);
 f.setFail(false);const retry=f.controller.send({...request,cityName:'Changed'});await new Promise(r=>setImmediate(r));assert.deepEqual(f.writes[1],f.writes[0]);f.release();await retry;
});
test('account switching cannot reveal a pending or completed demo receipt to another account',async()=>{
 const f=fixture(),pending=f.controller.send(request);await new Promise(r=>setImmediate(r));f.change('player-two');f.release();await assert.rejects(pending,/account|session/i);assert.equal(f.controller.status('oshawa','route').remoteSaved,false);
 const next=f.controller.send(request);await new Promise(r=>setImmediate(r));assert.notEqual(f.writes[0].threadId,f.writes[1].threadId);f.release();await next;assert.equal(f.controller.status('oshawa','route').remoteSaved,true);f.change('third');assert.equal(f.controller.status('oshawa','route').thread,undefined);
});
test('invalid city and mode inputs cannot create feedback or a guest session',async()=>{
 const f=fixture();for(const input of [{...request,city:'constructor'},{...request,city:'../x'},{...request,mode:'other'},{...request,cityName:'x'.repeat(121)}])await assert.rejects(f.controller.send(input));assert.equal(f.writes.length,0);
});

test('full-version requests have explicit wording and a separate acknowledged identity from demo requests',async()=>{
 const f=fixture(),input={city:'richmond-hill',cityName:'Richmond Hill',mode:'dispatch',requestType:'full-version'};
 const first=f.controller.send(input);await new Promise(r=>setImmediate(r));
 assert.match(f.writes[0].newThread.title,/Full version request.*Richmond Hill.*Dispatch Simulator/);
 assert.match(f.writes[0].body,/full version of Dispatch Simulator for Richmond Hill/);
 assert.equal(f.writes[0].newThread.category,'demo','use the existing private developer inbox');
 assert.equal(f.controller.status(input.city,input.mode,'full-version').remoteSaved,false);
 f.release();await first;
 assert.equal(f.controller.status(input.city,input.mode,'full-version').remoteSaved,true);
 assert.equal(f.controller.status(input.city,input.mode).remoteSaved,false);
 const demo=f.controller.send({...input,requestType:'demo'});await new Promise(r=>setImmediate(r));
 assert.equal(f.writes.length,2);assert.notEqual(f.writes[0].threadId,f.writes[1].threadId);
 f.release();await demo;
});

test('unsupported request types cannot create feedback',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.controller.send({...request,requestType:'purchase'}));assert.equal(f.writes.length,0);
});
