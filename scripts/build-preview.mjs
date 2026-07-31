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
    return fetch(sourceUrl);
  }
};
`, 'utf8');
console.log('Built static phone-preview package.');
