'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.wasm':'application/wasm'};
http.createServer((req,res)=>{
 let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{res.writeHead(404).end();return;}
 const stream=fs.createReadStream(file);stream.on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end();});
 stream.once('open',()=>{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});stream.pipe(res);});
}).listen(Number(process.argv[2])||4188,'127.0.0.1',()=>console.log('Quality preview: http://127.0.0.1:'+(Number(process.argv[2])||4188)));
