/* Dependency-free local preview. Run: node tools/serve-preview.cjs [port] */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.argv[2]||4177);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm'};
http.createServer((req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+pathname);
  if((file!==root&&!file.startsWith(root+path.sep))||pathname.split('/').some(part=>part.startsWith('.'))){res.writeHead(403).end('Forbidden');return;}
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  const resolved=fs.realpathSync(file);
  if(!resolved.startsWith(root+path.sep)){res.writeHead(403).end('Forbidden');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  const stream=fs.createReadStream(resolved);stream.on('error',()=>res.destroy());stream.pipe(res);
 }catch{res.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Game preview: http://127.0.0.1:${port}/`));
