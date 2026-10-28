import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorUrlForReport,exportFeedback} from '../feedback/agent-tools.mjs';
const report={schemaVersion:1,kind:'geo-location',reason:'point',snapshot:{resultId:'result-1',callId:'school-17',city:'peterborough',service:'fire',mode:'geo',version:'1.6.145',datasetId:'peterborough/locations',datasetRevision:null,question:{name:'School',address:'Brealey Drive',crossStreets:null,difficulty:'easy'},originalCircle:{center:{lat:44.28,lng:-78.37},radiusMeters:60},guess:null,distanceMeters:null,result:'revealed',baseId:null},suggestion:{radiusMeters:90}};
test('editor link selects original city and call without applying a player suggestion',()=>{
 const u=new URL(editorUrlForReport(report,new URL('https://game.test/Peterborough-Map-Game/'),'thread-1'));
 assert.equal(u.pathname,'/Peterborough-Map-Game/dispatch-editor/');assert.equal(u.searchParams.get('city'),'peterborough');assert.equal(u.searchParams.get('callId'),'school-17');assert.equal(u.searchParams.get('feedback'),'thread-1');assert.equal(u.searchParams.has('radius'),false);assert.equal(u.searchParams.has('lat'),false);
});
test('agent export retrieves every message page without marking read or altering the report',async()=>{
 const t={id:'thread-1',title:'Please fix',locationReport:report};let pages=0;
 const service={account:{uid:'dev',isDeveloper:true},async loadMessages(id,cursor){pages++;return cursor?{rows:[{id:'old',body:'old message'}],more:false}:{rows:[{id:'new',body:'new message'}],more:true,cursor:'older'};},async loadNotes(){return[{id:'n',body:'Private developer note'}];}};
 const data=await exportFeedback(service,[t],new URL('https://game.test/'));
 assert.equal(pages,2);assert.equal(data.conversations[0].messages.length,2);assert.equal(data.conversations[0].notes.length,1);assert.deepEqual(data.conversations[0].locationReport,report);assert.match(data.instructions,/untrusted/i);assert.match(data.conversations[0].editorUrl,/callId=school-17/);
});
test('an export is discarded if the developer identity changes while loading',async()=>{
 const service={account:{uid:'dev',isDeveloper:true},async loadMessages(){this.account={uid:'other',isDeveloper:false};return{rows:[{body:'private'}],more:false};}};
 await assert.rejects(exportFeedback(service,[{id:'t'}],new URL('https://game.test/')),/account|access/i);
});
