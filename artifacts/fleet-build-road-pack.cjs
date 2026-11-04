'use strict';
const path=require('node:path');
process.env.NODE_PATH="C:/Users/Danny's Ultimate PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
require('node:module').Module._initPaths();
process.env.ROAD_BUILD_URL='http://127.0.0.1:4188';
(async()=>{
 const {default:clipping}=await import('../city-explorer/vendor/polygon-clipping-0.15.7.js');
 if(typeof clipping?.union!=='function')throw Error('Polygon optimizer unavailable');
 console.log('Verified polygon optimizer import from normal file entry.');
 const {chromium}=require('playwright');const launch=chromium.launch.bind(chromium);
 chromium.launch=options=>launch({...options,channel:'msedge'});
 require('../tools/build-road-pack.cjs');
})().catch(error=>{console.error(error);process.exitCode=1;});
