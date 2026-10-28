// Real rules evaluation: these tests require the local Firestore emulator.
const {test,before,after,beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,deleteDoc,writeBatch,updateDoc,serverTimestamp,Timestamp} = require('firebase/firestore');
let env;
const base = (ownerId='alice')=>({ownerId,title:'Bridge curb',category:'map',city:'peterborough',mode:'explorer',department:'fire',version:'1.6.132',status:'new',priority:'normal',createdAt:Timestamp.fromMillis(1000),updatedAt:Timestamp.fromMillis(1000),lastMessageId:'first',lastSender:'player',playerMessages:1,developerMessages:0,playerRead:0,developerRead:0});
const message = (authorId='alice',authorRole='player')=>({authorId,authorRole,body:'The curb is too high.',createdAt:serverTimestamp()});
const db = (uid='alice',claims={})=>env.authenticatedContext(uid,claims).firestore();
async function seed() { await env.withSecurityRulesDisabled(async c=>{
 await setDoc(doc(c.firestore(),'feedbackThreads','a'),base());
 await setDoc(doc(c.firestore(),'feedbackThreads','a','messages','first'),{...message(),createdAt:Timestamp.fromMillis(1000)});
}); }
async function send(database,{id='a',mid='reply',uid='alice',role='player',create=false,body='A reply',locationReport}={}) {
 const batch=writeBatch(database), ref=doc(database,'feedbackThreads',id);
 if(create)batch.set(ref,{...base(uid),...(locationReport ? {mode:'geo',version:'1.6.134',locationReport}:{}),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastMessageId:mid});
 else batch.update(ref,{updatedAt:serverTimestamp(),lastMessageId:mid,lastSender:role,[role==='developer'?'developerMessages':'playerMessages']:role==='developer'?1:2});
 batch.set(doc(database,'feedbackWriters',uid),{lastSentAt:serverTimestamp()});
 batch.set(doc(ref,'messages',mid),{authorId:uid,authorRole:role,body,createdAt:serverTimestamp()});
 return batch.commit();
}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ptbo-feedback',firestore:{host:'127.0.0.1',port:8086,rules:fs.readFileSync('feedback/firestore.rules','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>env.clearFirestore());
test('a guest can atomically create their thread and first message',async()=>{
 await assertSucceeds(send(db(),{id:'new',mid:'first',create:true}));
 assert.equal((await getDoc(doc(db(),'feedbackThreads','new'))).data().ownerId,'alice');
});
test('owners and developer can read; other users and unauthenticated clients cannot',async()=>{
 await seed();
 await assertSucceeds(getDoc(doc(db(),'feedbackThreads','a')));
 await assertSucceeds(getDoc(doc(db('dev',{feedbackAdmin:true}),'feedbackThreads','a')));
 for(const client of [db('bob'),env.unauthenticatedContext().firestore()]){
  await assertFails(getDoc(doc(client,'feedbackThreads','a')));
  await assertFails(getDoc(doc(client,'feedbackThreads','a','messages','first')));
 }
});
test('player queries must be owner scoped, while developer may list all threads',async()=>{
 await seed();
 await assertSucceeds(getDocs(query(collection(db(),'feedbackThreads'),where('ownerId','==','alice'))));
 await assertFails(getDocs(collection(db(),'feedbackThreads')));
 await assertSucceeds(getDocs(collection(db('dev',{feedbackAdmin:true}),'feedbackThreads')));
});
test('users cannot create threads for others, forge developer messages, or inject data',async()=>{
 await seed();
 await assertFails(send(db('bob'),{id:'spoof',uid:'alice',create:true}));
 await assertFails(send(db(),{role:'developer'}));
 await assertFails(send(db('bob'),{uid:'bob'}));
 await assertFails(updateDoc(doc(db(),'feedbackThreads','a'),{ownerId:'bob'}));
 await assertFails(updateDoc(doc(db(),'feedbackThreads','a'),{status:'resolved'}));
 await assertFails(updateDoc(doc(db(),'feedbackThreads','a'),{feedbackAdmin:true}));
});
test('developer can reply and set status/priority, but cannot change ownership',async()=>{
 await seed();const admin=db('dev',{feedbackAdmin:true});
 await assertSucceeds(send(admin,{uid:'dev',role:'developer'}));
 await assertSucceeds(updateDoc(doc(admin,'feedbackThreads','a'),{status:'reviewing',priority:'high'}));
 await assertFails(updateDoc(doc(admin,'feedbackThreads','a'),{ownerId:'dev'}));
});
test('message creation requires a matching atomic thread update and real server timestamp',async()=>{
 await seed();
 await assertFails(setDoc(doc(db(),'feedbackThreads','a','messages','orphan'),message()));
 await assertFails(setDoc(doc(db(),'feedbackThreads','a','messages','first'),message()));
 await assertFails(updateDoc(doc(db(),'feedbackThreads','a'),{playerMessages:2,lastMessageId:'nonexistent',updatedAt:serverTimestamp()}));
 await assertFails(send(db(),{body:' '.repeat(4001)}));
});
test('read counters belong to each recipient and cannot be forged or decremented',async()=>{
 await seed();const admin=db('dev',{feedbackAdmin:true});
 await assertSucceeds(updateDoc(doc(admin,'feedbackThreads','a'),{developerRead:1}));
 await assertFails(updateDoc(doc(db(),'feedbackThreads','a'),{developerRead:0}));
 await assertFails(updateDoc(doc(db(),'feedbackThreads','a'),{playerRead:999}));
 await assertFails(updateDoc(doc(admin,'feedbackThreads','a'),{developerRead:0}));
});
test('developer notes stay inaccessible to players and are immutable',async()=>{
 await seed();const note='feedbackThreads/a/notes/n';const admin=db('dev',{feedbackAdmin:true});
 await assertSucceeds(setDoc(doc(admin,note),{authorId:'dev',body:'Check bridge reference.',createdAt:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(admin,note)));
 await assertFails(getDoc(doc(db(),note)));
 await assertFails(setDoc(doc(db(),note),{authorId:'alice',body:'spoof',createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(admin,note),{body:'Rewrite history'}));
});
test('sender throttle is enforced by server rules across different threads',async()=>{
 await assertSucceeds(send(db(),{id:'one',create:true,mid:'first'}));
 await assertFails(send(db(),{id:'two',create:true,mid:'first'}));
});

function locationReport() {
 return {schemaVersion:1,kind:'geo-location',reason:'point',snapshot:{resultId:'result-1',callId:'school-1',city:'peterborough',service:'fire',mode:'geo',version:'1.6.134',datasetId:'peterborough/locations',datasetRevision:null,question:{name:'School',address:'1 School Road',crossStreets:['First Street','Second Road'],difficulty:'easy'},originalCircle:{center:{lat:44.2865,lng:-78.3796},radiusMeters:60},guess:{lat:44.2867,lng:-78.3775},distanceMeters:165,result:'incorrect',baseId:'station-1'},suggestion:{center:{lat:44.2867,lng:-78.3775},radiusMeters:80}};
}
test('guest location reports create private immutable snapshots and optional circle suggestions',async()=>{
 await assertSucceeds(send(db(),{id:'location',mid:'first',create:true,locationReport:locationReport()}));
 const ref=doc(db(),'feedbackThreads','location');
 assert.equal((await getDoc(ref)).data().locationReport.suggestion.radiusMeters,80);
 await assertFails(getDoc(doc(db('bob'),'feedbackThreads','location')));
 const admin=db('dev',{feedbackAdmin:true});
 await assertSucceeds(getDoc(doc(admin,'feedbackThreads','location')));
 await assertFails(updateDoc(ref,{'locationReport.snapshot.originalCircle.radiusMeters':100}));
 await assertFails(updateDoc(doc(admin,'feedbackThreads','location'),{'locationReport.suggestion.radiusMeters':100}));
 await assertSucceeds(send(admin,{id:'location',uid:'dev',role:'developer'}));
 await assertSucceeds(updateDoc(doc(admin,'feedbackThreads','location'),{status:'reviewing'}));
});
test('location rules accept centre-only, radius-only and no suggested correction',async()=>{
 for(const [uid,suggestion] of [['centre',{center:{lat:90,lng:-180}}],['radius',{radiusMeters:5}],['none',null]]) {
  const report=locationReport();report.suggestion=suggestion;report.snapshot.question.crossStreets=['A','B','C','D'];
  await assertSucceeds(send(db(uid),{id:uid,uid,mid:'first',create:true,locationReport:report}));
 }
});
test('location rules reject malformed or unbounded nested context',async()=>{
 const edits=[r=>{r.suggestion.radiusMeters=4;},r=>{r.suggestion.radiusMeters=2001;},r=>{r.snapshot.originalCircle.radiusMeters=20001;},r=>{r.snapshot.originalCircle.center.lat=91;},r=>{r.snapshot.guess.lng='-78';},r=>{r.snapshot.question.crossStreets=['x'.repeat(151)];},r=>{r.snapshot.question.crossStreets=['a','b','c','d','e'];},r=>{r.suggestion={};},r=>{r.snapshot.email='private@example.test';},r=>{r.snapshot.city='toronto';},r=>{r.snapshot.service='ems';},r=>{r.snapshot.version='old';},r=>{r.reason='confirmed-wrong';},r=>{delete r.snapshot.baseId;r.snapshot.extra='replacement';},r=>{delete r.snapshot.question.crossStreets;r.snapshot.question.extra='replacement';},r=>{r.snapshot.originalCircle.center.lat=NaN;},r=>{r.snapshot.originalCircle.radiusMeters=0;},r=>{r.snapshot.question.name=42;},r=>{r.snapshot.question.address='x'.repeat(301);}];
 for(let i=0;i<edits.length;i++) {const report=locationReport();edits[i](report);const uid='invalid'+i;await assertFails(send(db(uid),{id:uid,uid,mid:'first',create:true,locationReport:report}));}
});
test('location reports preserve scoring contradictions as reported evidence',async()=>{
 const report=locationReport();report.snapshot.distanceMeters=10;report.snapshot.result='incorrect';
 await assertSucceeds(send(db(),{id:'scoring',mid:'first',create:true,locationReport:report}));
});
test('location reports cannot evade atomic-message requirements or cross-thread cooldown',async()=>{
 const report=locationReport();
 await assertSucceeds(send(db(),{id:'one',mid:'first',create:true,locationReport:report}));
 await assertFails(send(db(),{id:'two',mid:'first',create:true,locationReport:report}));
 await assertFails(setDoc(doc(db('bob'),'feedbackThreads','orphan'),{...base('bob'),mode:'geo',version:'1.6.134',locationReport:report,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
});

test('real service retries a structured payload once and rejects changed circles with reused IDs',async()=>{
 const {pathToFileURL}=require('node:url');
 let source=fs.readFileSync('feedback/service.mjs','utf8').replace('"./model.mjs"',JSON.stringify(pathToFileURL(require('node:path').resolve('feedback/model.mjs')).href));
 source=source.replace('"./location-report.mjs"',JSON.stringify(pathToFileURL(require('node:path').resolve('feedback/location-report.mjs')).href));
 source=source.replace('"./guest-transfer.mjs?v=feedback-workflow-20261028"',JSON.stringify(pathToFileURL(require('node:path').resolve('feedback/guest-transfer.mjs')).href));
 for(const part of ['app','auth','firestore']) source=source.replace('import(`${SDK}/firebase-'+part+'.js`)', 'import('+JSON.stringify(pathToFileURL(require.resolve('firebase/'+part)).href)+')');
 global.location={hostname:'localhost'};
 const {createFeedbackService}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const service=createFeedbackService({enabled:true,firebase:{apiKey:'demo-key',projectId:'demo-ptbo-feedback',appId:'demo-app'},emulators:{auth:'http://127.0.0.1:9098',firestore:{host:'127.0.0.1',port:8086}}});
 try {
  await service.ready;await service.ensureGuest();
  assert.equal(typeof service.sendLocationReport,'function');
  const report=locationReport();report.snapshot.question.name='';report.snapshot.question.address='';
  await service.sendLocationReport({threadId:'service-report',messageId:'first',report});
  await service.sendLocationReport({threadId:'service-report',messageId:'first',report});
  const threads=await service.loadThreads();assert.equal(threads.rows.length,1);
  assert.equal(threads.rows[0].playerMessages,1);assert.ok(threads.rows[0].title.includes('school-1'));
  assert.equal(threads.rows[0].locationReport.snapshot.originalCircle.radiusMeters,60);
  const messages=await service.loadMessages('service-report');assert.equal(messages.rows.length,1);assert.ok(messages.rows[0].body.trim());
  const changed=structuredClone(report);changed.suggestion.radiusMeters=90;
  await assert.rejects(service.sendLocationReport({threadId:'service-report',messageId:'first',report:changed}),/already|different|used/i);
  await assert.rejects(service.sendLocationReport({threadId:'service-report',messageId:'new-message',report:changed}),/already|different|used/i);
  await assert.rejects(service.sendLocationReport({threadId:'service-report',messageId:'new-message',report}),/already|different|used/i);
  await assert.rejects(service.sendLocationReport({threadId:'service-report',messageId:'first',report,note:'Different note'}),/already|different|used/i);
  assert.equal((await service.loadThreads()).rows[0].playerMessages,1);
  const email=`transfer-${Date.now()}@example.test`;
  await service.register(email,'Test-pass-739!');const destination=service.account.uid;
  await service.signOut();await service.ensureGuest();const oldGuest=service.account.uid;
  await service.sendLocationReport({threadId:'guest-transfer-report',messageId:'first',report});
  await assert.rejects(service.signIn(email,'wrong-password'));
  assert.equal(service.account.uid,oldGuest,'wrong password retains guest access');
  await service.signIn(email,'Test-pass-739!');assert.equal(service.account.uid,destination);
  assert.equal(service.transferError,null);
  const recovered=await service.loadThreads();assert.equal(recovered.rows.length,2);
  assert.equal(recovered.rows.find(t=>t.id==='guest-transfer-report').ownerId,destination);
  assert.equal((await service.loadMessages('guest-transfer-report')).rows.length,1);
  await service.recoverConversations();assert.equal((await service.loadThreads()).rows.length,2);
  await service.signOut();await service.ensureGuest();const separateGuest=service.account.uid;
  const appSdk=require('firebase/app'),firestoreSdk=require('firebase/firestore');
  const serviceDb=firestoreSdk.getFirestore(appSdk.getApp('ptbo-feedback'));
  await setDoc(doc(serviceDb,'feedbackTransfers',separateGuest),{guestId:separateGuest,targetId:destination,createdAt:serverTimestamp()});
  await service.register(`separate-${Date.now()}@example.test`,'Test-pass-739!');
  assert.equal((await getDoc(doc(serviceDb,'feedbackTransfers',separateGuest))).exists(),false,'new account registration revokes an interrupted transfer grant');
 } finally {
  await service.signOut();
  const {getApp,deleteApp}=require('firebase/app');await deleteApp(getApp('ptbo-feedback'));
  delete global.location;
 }
});

test('the largest valid location context stays within the real rules evaluation budget',async()=>{
 const report=locationReport();report.snapshot.resultId='r'.repeat(160);report.snapshot.callId='c'.repeat(160);report.snapshot.datasetId='d'.repeat(240);report.snapshot.datasetRevision='v'.repeat(160);report.snapshot.baseId='b'.repeat(160);
 report.snapshot.question={name:'n'.repeat(200),address:'a'.repeat(300),crossStreets:['A'.repeat(150),'B'.repeat(150),'C'.repeat(150),'D'.repeat(150)],difficulty:'x'.repeat(80)};
 report.snapshot.originalCircle.radiusMeters=20000;report.suggestion.radiusMeters=2000;
 await assertSucceeds(send(db(),{id:'maximum',mid:'first',create:true,locationReport:report}));
});
test('a location thread retains ordinary owner and developer conversations',async()=>{
 await assertSucceeds(send(db(),{id:'conversation',mid:'first',create:true,locationReport:locationReport()}));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'feedbackWriters','alice'),{lastSentAt:Timestamp.fromMillis(1000)}));
 await assertSucceeds(send(db(),{id:'conversation',mid:'owner-reply',body:'More detail.'}));
 await assertSucceeds(send(db('dev',{feedbackAdmin:true}),{id:'conversation',mid:'dev-reply',uid:'dev',role:'developer',body:'Thank you.'}));
 const thread=(await getDoc(doc(db(),'feedbackThreads','conversation'))).data();
 assert.equal(thread.playerMessages,2);assert.equal(thread.developerMessages,1);assert.equal(thread.locationReport.snapshot.originalCircle.radiusMeters,60);
});

test('blank displayed names and addresses remain reportable with stable location identity',async()=>{
 const report=locationReport();report.snapshot.question.name='';report.snapshot.question.address='';
 await assertSucceeds(send(db(),{id:'missing-text',mid:'first',create:true,locationReport:report}));
});

test('revealed questions can report without a guess or optional context',async()=>{
 const report=locationReport();report.snapshot.guess=null;report.snapshot.distanceMeters=null;report.snapshot.result='revealed';report.snapshot.baseId=null;report.snapshot.question.crossStreets=null;report.snapshot.question.difficulty=null;report.suggestion=null;
 await assertSucceeds(send(db(),{id:'revealed',mid:'first',create:true,locationReport:report}));
});

test('guest-authorized transfers move only ownership to the verified destination',async()=>{
 await seed();const guest=db('alice',{firebase:{sign_in_provider:'anonymous'}}),target=db('target',{firebase:{sign_in_provider:'password'}}),grant='feedbackTransfers/alice';
 await assertSucceeds(setDoc(doc(guest,grant),{guestId:'alice',targetId:'target',createdAt:serverTimestamp()}));
 await assertSucceeds(getDocs(query(collection(target,'feedbackThreads'),where('ownerId','==','alice'),where('createdAt','<=',(await getDoc(doc(target,grant))).data().createdAt))));
 await assertFails(updateDoc(doc(target,'feedbackThreads','a'),{ownerId:'target',title:'tampered'}));
 await assertSucceeds(updateDoc(doc(target,'feedbackThreads','a'),{ownerId:'target'}));
 await assertSucceeds(getDoc(doc(target,'feedbackThreads','a','messages','first')));
 await assertFails(getDoc(doc(guest,'feedbackThreads','a','messages','first')));
 await assertFails(getDoc(doc(target,'feedbackThreads','a','notes','n')));
 await assertSucceeds(send(target,{uid:'target'}));
});
test('transfers reject forged grants, registered-account merging, wrong targets and mutable grants',async()=>{
 await seed();const target=db('target',{firebase:{sign_in_provider:'password'}}),guest=db('alice',{firebase:{sign_in_provider:'anonymous'}}),grant='feedbackTransfers/alice',data={guestId:'alice',targetId:'target',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(target,grant),data));
 await assertFails(setDoc(doc(db('alice',{firebase:{sign_in_provider:'password'}}),grant),data));
 await assertFails(setDoc(doc(guest,grant),{...data,guestId:'someone-else'}));
 await assertFails(setDoc(doc(guest,grant),{...data,targetId:'alice'}));
 await assertFails(setDoc(doc(guest,grant),{...data,admin:true}));
 await assertSucceeds(setDoc(doc(guest,grant),data));
 await assertFails(updateDoc(doc(target,grant),{targetId:'bob'}));
 await assertFails(getDocs(collection(db('bob'),'feedbackTransfers')));
 await assertSucceeds(getDocs(query(collection(target,'feedbackTransfers'),where('targetId','==','target'))));
 await assertFails(updateDoc(doc(db('bob'),'feedbackThreads','a'),{ownerId:'bob'}));
 await assertFails(getDoc(doc(db('bob'),'feedbackThreads','a')));
});

test('an old guest grant cannot capture new conversations after source registration and can be revoked',async()=>{
 await seed();const guest=db('alice',{firebase:{sign_in_provider:'anonymous'}}),target=db('target',{firebase:{sign_in_provider:'password'}});
 const grant='feedbackTransfers/alice';
 await assertSucceeds(setDoc(doc(guest,grant),{guestId:'alice',targetId:'target',createdAt:serverTimestamp()}));
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'feedbackThreads','future'),{...base('alice'),createdAt:Timestamp.fromMillis(Date.now()+10000),updatedAt:Timestamp.fromMillis(Date.now()+10000)});});
 await assertFails(getDoc(doc(target,'feedbackThreads','future')));
 await assertFails(updateDoc(doc(target,'feedbackThreads','future'),{ownerId:'target'}));
 await assertSucceeds(deleteDoc(doc(guest,grant)));
 await assertFails(updateDoc(doc(target,'feedbackThreads','a'),{ownerId:'target'}));
});
