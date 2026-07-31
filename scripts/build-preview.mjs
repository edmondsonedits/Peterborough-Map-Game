import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const excludedTopLevel = new Set(['.git', '.openai', 'dist', 'node_modules', 'test-artifacts']);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(root)) {
  if (excludedTopLevel.has(entry)) continue;
  await cp(resolve(root, entry), resolve(output, entry), {
    recursive: true,
    filter(source) {
      const firstPathPart = relative(root, source).split(/[\\/]/)[0];
      return !excludedTopLevel.has(firstPathPart);
    }
  });
}
await mkdir(resolve(output, 'server'), { recursive: true });
await mkdir(resolve(output, '.openai'), { recursive: true });
await cp(resolve(root, '.openai/hosting.json'), resolve(output, '.openai/hosting.json'));
await writeFile(resolve(output, 'server/index.js'), `export default {
  async fetch(request) {
    const url = new URL(request.url);
    const requestedPath = url.pathname.endsWith('/')
      ? url.pathname + 'index.html'
      : url.pathname;
    const pathParts = requestedPath.split('/').filter(Boolean);
    if (pathParts.some((part) => part === '.' || part === '..')) {
      return new Response('Invalid path.', { status: 400 });
    }

    const sourceUrl = new URL(pathParts.map(encodeURIComponent).join('/'),
      'https://raw.githubusercontent.com/edmondsonedits/Peterborough-Map-Game/a89832835e3c94e0f1d72fc0265f0263e554b591/');
    const sourceResponse = await fetch(sourceUrl);
    const extension = requestedPath.slice(requestedPath.lastIndexOf('.') + 1).toLowerCase();
    const contentTypes = {
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'text/javascript; charset=utf-8',
      json: 'application/json; charset=utf-8',
      geojson: 'application/geo+json; charset=utf-8',
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      webm: 'audio/webm'
    };
    const headers = new Headers(sourceResponse.headers);
    // GitHub Raw adds a restrictive document policy intended for source-file
    // viewing. The preview serves these files as a real site, so retain the
    // safe response headers but drop that incompatible policy.
    headers.delete('content-security-policy');
    headers.delete('content-security-policy-report-only');
    // A preview must never keep an earlier, incompatible revision in a
    // player's phone cache while it is being tested.
    headers.set('cache-control', 'no-store, max-age=0');
    if (contentTypes[extension]) {
      headers.set('content-type', contentTypes[extension]);
    }
    return new Response(sourceResponse.body, {
      status: sourceResponse.status,
      statusText: sourceResponse.statusText,
      headers
    });
  }
};
`, 'utf8');
console.log('Built static phone-preview package.');
