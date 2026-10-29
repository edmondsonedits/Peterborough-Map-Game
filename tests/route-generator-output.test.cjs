'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=require('../tools/route-response-data.cjs');
const builder=require('../tools/build-local-response-calls.cjs');

test('scratch generation writes a city descriptor without changing the production source descriptor',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ptbo-route-output-')),previousRoot=data.root;
 try{
  data.root=path.join(temp,'source');
  const source=path.join(data.root,'cities','fixture-city','training-data.json');
  fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,'original source descriptor\n');
  const training={schemaVersion:1,id:'fixture-city',routeCalls:[{id:'new-call'}]};
  const outputDir=path.join(temp,'review','nested');
  builder.writeTrainingData({id:'fixture-city'},training,{outputDir});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDir,'fixture-city.json'))),training);
  assert.equal(fs.readFileSync(source,'utf8'),'original source descriptor\n');
 }finally{data.root=previousRoot;fs.rmSync(temp,{recursive:true,force:true});}
});

test('generation without a scratch directory preserves the established production output path',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ptbo-route-default-')),previousRoot=data.root;
 try{
  data.root=temp;
  const source=path.join(temp,'cities','fixture-city','training-data.json');
  fs.mkdirSync(path.dirname(source),{recursive:true});
  const training={schemaVersion:1,id:'fixture-city',routeCalls:[]};
  builder.writeTrainingData({id:'fixture-city'},training);
  assert.deepEqual(JSON.parse(fs.readFileSync(source)),training);
 }finally{data.root=previousRoot;fs.rmSync(temp,{recursive:true,force:true});}
});
