'use strict';
// Compare deployed changed public files with committed Git blobs, including
// compressed city roads. Test artifacts and tools are intentionally not served.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/')}`,...args],{cwd:root,maxBuffer:32*1024*1024});
const revision=process.argv[2]||git('rev-parse','HEAD').toString().trim(),base=(process.argv[3]||'https://edmondsonedits.github.io/Peterborough-Map-Game/').replace(/\/?$/,'/');
const out=path.resolve(process.env.PTBO_QA_OUTPUT||'test-artifacts/city-expansion/live');fs.mkdirSync(out,{recursive:true});
const baseRevision=process.env.PTBO_VERIFY_BASE_REVISION;
const changed=baseRevision?git('diff','--name-only',baseRevision,revision):git('diff-tree','--no-commit-id','--name-only','-r',revision);
const files=changed.toString().trim().split(/\r?\n/).filter(f=>/^(cities|shared|geo-guesser|response-simulator|route-mapping|homepage|city-explorer|dispatch-editor)\//.test(f)&&!f.endsWith('.md')||f==='index.html');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{let cursor=0;const results=[];await Promise.all(Array.from({length:4},async()=>{
 while(cursor<files.length){const file=files[cursor++];try{
  const expected=hash(git('show',`${revision}:${file}`)),response=await fetch(new URL(file+'?release-check='+revision,base),{signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),actual=hash(bytes);results.push({file,pass:actual===expected,bytes:bytes.length,expected,actual});
 }catch(e){results.push({file,pass:false,error:e.message});}}
}));results.sort((a,b)=>a.file.localeCompare(b.file));const report={revision,baseRevision,base,checkedAt:new Date().toISOString(),files:results.length,pass:results.every(r=>r.pass),results};fs.writeFileSync(path.join(out,'source-hashes.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({revision,files:report.files,pass:report.pass,failures:results.filter(r=>!r.pass)}));if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
