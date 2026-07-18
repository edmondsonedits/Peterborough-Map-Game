import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8" };
createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const safePath = normalize(join(root, relativePath));
  if (!safePath.startsWith(root)) { response.writeHead(403).end(); return; }
  try { const info = await stat(safePath); const filePath = info.isDirectory() ? join(safePath, "index.html") : safePath; response.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" }); createReadStream(filePath).pipe(response); } catch { response.writeHead(404).end("Not found"); }
}).listen(4173, () => console.log("Serving http://localhost:4173"));
