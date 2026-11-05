#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=createRequire(path.join("C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules",'package.json'))('playwright')); }
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  let rejectedTiles=0,sidecarLoaded=false;
  page.on('response',response=>{if(response.url().endsWith('/multiplayer/world-data/v1/station-heights.json')&&response.status()===200)sidecarLoaded=true;});
  await page.route(/\/data\/road-pack\/.*\.bin\.gz(?:\?.*)?$/,route=>{rejectedTiles++;return route.fulfill({status:503,body:'simulated tile failure'});});
  const base=process.env.MAP_QA_URL||'http://127.0.0.1:4188';
  await page.goto(`${base}/city-explorer/?station=1&quality=balanced`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true'&&Boolean(document.documentElement.dataset.officialRoadDetail),null,{timeout:180000});
  const state=await page.evaluate(()=>({roadPackId:document.documentElement.dataset.roadPackId??null,stationHeightRecord:document.documentElement.dataset.stationHeightRecord??null,officialRoadDetail:document.documentElement.dataset.officialRoadDetail,stationOneModel:document.documentElement.dataset.stationOneModel??null}));
  assert.ok(rejectedTiles>0,'the test must fail at least one packed road tile');
  assert.ok(sidecarLoaded,'the pinned station height record must have been read before tile failure');
  assert.equal(state.roadPackId,null,'failed packed roads cannot become active');
  assert.equal(state.stationHeightRecord,null,'failed packed roads cannot leave pinned station heights active');
  assert.match(state.officialRoadDetail,/municipal|fallback/,'source road fallback should load');
  console.log(JSON.stringify({rejectedTiles,sidecarLoaded,state,result:'pass'}));
} finally { await browser.close(); }
