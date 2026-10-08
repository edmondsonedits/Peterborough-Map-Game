'use strict';
// Compile/inventory coverage complements call-chain and browser review.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/quality-audit');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
fs.mkdirSync(out,{recursive:true});
const report={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),trackedFiles:files.length,groups:{},scripts:0,inlineScripts:0,json:0,errors:[],missingResources:[],duplicates:[]},hashes=new Map();
function compile(source,file,module=false){try{if(module)new vm.SourceTextModule(source,{identifier:file});else{try{new vm.Script(source,{filename:file});}catch{new vm.SourceTextModule(source,{identifier:file});}}}catch(e){report.errors.push({file,error:e.message});}}
for(const file of files){
 const data=fs.readFileSync(path.join(root,file)),ext=path.extname(file),group=file.includes('/')?file.split('/')[0]:'(root)',g=report.groups[group]||={files:0,bytes:0};
 g.files++;g.bytes+=data.length;
 if(/^\.(?:js|mjs|cjs|html|css)$/.test(ext)){const h=crypto.createHash('sha256').update(data).digest('hex'),v=hashes.get(h)||[];v.push(file);hashes.set(h,v);}
 if(/^\.(?:js|mjs|cjs)$/.test(ext)){report.scripts++;compile(data.toString('utf8'),file,ext==='.mjs');}
 else if(ext==='.html'){
  const html=data.toString('utf8');
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(/\bsrc\s*=/.test(m[1])||/\btype\s*=\s*["'](?:importmap|application\/[^"']+|text\/plain)/i.test(m[1])||!m[2].trim())continue;
   report.inlineScripts++;compile(m[2],file+':'+html.slice(0,m.index).split('\n').length,/\btype\s*=\s*["']module/i.test(m[1]));
  }
  for(const m of html.matchAll(/<(?:script|link|img|iframe|audio|video|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)){
   const url=m[1].replace(/&amp;/g,'&').split(/[?#]/)[0];if(!url||/^(?:[a-z]+:|\/\/|#|\$|\{)/i.test(url))continue;
   if(!fs.existsSync(path.resolve(root,path.dirname(file),url)))report.missingResources.push({file,url});
  }
 }else if(/^\.(?:json|geojson)$/.test(ext)){report.json++;try{JSON.parse(data.toString('utf8'));}catch(e){report.errors.push({file,error:e.message});}}
}
report.duplicates=[...hashes.values()].filter(v=>v.length>1);
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exitCode=report.errors.length||report.missingResources.length?1:0;
