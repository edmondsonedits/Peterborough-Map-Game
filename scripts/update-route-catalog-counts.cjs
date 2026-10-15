'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),file=path.join(root,'cities/city-registry.js'),source=fs.readFileSync(file,'utf8'),context={window:{}};
vm.runInNewContext(source,context);const counts={};
for(const {id} of [...context.window.PTBO_CITIES].sort((a,b)=>a.id.localeCompare(b.id))){const locations=id==='peterborough'?JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root,'shared/dispatch-data-1.4.4.js'),'utf8').match(/const PAYLOAD = '([^']+)'/)[1],'base64'))):JSON.parse(fs.readFileSync(path.join(root,'cities',id,'geo-data.json'),'utf8')).locations;counts[id]=locations.length;}
const line=`const catalogCounts = ${JSON.stringify(counts)};`;
fs.writeFileSync(file,/const catalogCounts = \{[^\n]+\};/.test(source)?source.replace(/const catalogCounts = \{[^\n]+\};/,line):source.replace('  window.PTBO_CITIES =','  '+line+'\n  window.PTBO_CITIES =').replace('...city,dispatch:simulatorRoutes,','...city,dispatch:simulatorRoutes,callCount:catalogCounts[city.id]??0,'));
console.log(JSON.stringify({cities:Object.keys(counts).length,calls:Object.values(counts).reduce((a,b)=>a+b,0)}));
