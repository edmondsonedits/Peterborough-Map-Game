import { createHash } from 'node:crypto';

export function canonicalTextHash(value) {
  return createHash('sha256').update(String(value).replace(/\r\n?/g,'\n'),'utf8').digest('hex');
}
