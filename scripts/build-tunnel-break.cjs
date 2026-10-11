'use strict';
// The readable source is kept under tools so GitHub Pages publishes only the
// existing compressed game. Rebuild deterministically after source changes.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'tools/tunnel-break/game.html'));
const packed=zlib.gzipSync(source,{level:9}).toString('base64'),size=Math.ceil(packed.length/13);
for(let i=0;i<13;i++)fs.writeFileSync(path.join(root,'tunnel-break',`v311-${String(i+1).padStart(2,'0')}.b64`),packed.slice(i*size,(i+1)*size)+'\n');
const digest=crypto.createHash('sha256').update(source).digest('hex'),entry=path.join(root,'tunnel-break/index.html');
const html=fs.readFileSync(entry,'utf8');
const names=Array.from({length:13},(_,i)=>`v311-${String(i+1).padStart(2,'0')}.b64`);
if(!/digest!=='[a-f0-9]{64}'/.test(html))throw new Error('Missing Tunnel Break integrity check');
fs.writeFileSync(entry,html.replace(/const fs=\[[^\]]*\]/,'const fs='+JSON.stringify(names)).replace(/digest!=='[a-f0-9]{64}'/,`digest!=='${digest}'`));
console.log(JSON.stringify({bytes:source.length,chunks:13,sha256:digest}));
