import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalTextHash } from '../city-explorer/multiplayer/canonical-source-hash.mjs';

test('canonical source hashes match LF and CRLF text checkouts',()=>{
 const source='export const value = 1;\nexport const other = 2;\n';
 assert.equal(canonicalTextHash(source),canonicalTextHash(source.replace(/\n/g,'\r\n')));
 assert.notEqual(canonicalTextHash(source),canonicalTextHash(source.replace('value = 1','value = 3')));
});
