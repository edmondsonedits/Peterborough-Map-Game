import { readdir, readFile, access } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => !['.git', 'node_modules'].includes(entry.name)).map(async entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  }));
  return nested.flat();
}

const files = await htmlFiles(root);
let scriptCount = 0;
let localReferenceCount = 0;
for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const sourceMatch = match[1].match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    if (sourceMatch && !/^(https?:)?\/\//i.test(sourceMatch[1])) {
      await access(resolve(dirname(file), sourceMatch[1].split('?')[0]));
      localReferenceCount += 1;
    }
    if (/type\s*=\s*["']importmap["']/i.test(match[1])) continue;
    const source = match[2].trim();
    if (!source) continue;
    new vm.Script(source, { filename: relative(root, file) });
    scriptCount += 1;
  }
}
console.log(`Parsed ${scriptCount} inline scripts and checked ${localReferenceCount} local script references across ${files.length} HTML files.`);
