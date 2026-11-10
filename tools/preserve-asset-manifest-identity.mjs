import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

export function preserveManifestIdentity(previousText, rebuiltText) {
  const previous = JSON.parse(previousText), rebuilt = JSON.parse(rebuiltText);
  delete previous.generated_at;
  delete rebuilt.generated_at;
  return isDeepStrictEqual(previous, rebuilt) ? previousText : rebuiltText;
}

// Run after both the generator and road validator have finalized the manifest.
// Real source assets are separately hashed by the road-pack compiler.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const path = 'city-explorer/data/manifest.json';
  const previous = execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' });
  const current = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const result = preserveManifestIdentity(previous, current);
  if (result !== current) writeFileSync(new URL('../' + path, import.meta.url), result);
  console.log(result === previous ? 'Asset manifest identity unchanged.' : 'Asset manifest metadata changed; rebuild identity retained.');
}
