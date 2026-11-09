import { PROTOCOL_VERSION } from '../city-explorer/multiplayer/protocol.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function verifyDeployedWorld({ serverUrl, expectedWorldVersion, fetchImpl = fetch, attempts = 24, retryMs = 3000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const endpoint = new URL('/healthz', serverUrl);
  if (endpoint.protocol !== 'https:') throw new Error('Public multiplayer endpoint must use HTTPS');
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status !== 'ready') throw new Error('Multiplayer backend is not ready');
      if (body.worldVersion !== expectedWorldVersion) throw new Error(`Backend world ${body.worldVersion} does not match frontend ${expectedWorldVersion}`);
      if (body.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Backend protocol ${body.protocolVersion ?? 'unknown'} does not match frontend ${PROTOCOL_VERSION}`);
      return { worldVersion: body.worldVersion, protocolVersion: body.protocolVersion, status: 'matched' };
    } catch (error) { lastError = error; }
    if (attempt + 1 < attempts) await wait(retryMs);
  }
  throw lastError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const serverUrl = process.env.MULTIPLAYER_SERVER_URL;
  if (!serverUrl) throw new Error('MULTIPLAYER_SERVER_URL is required before publishing multiplayer');
  const html = await readFile(new URL('../city-explorer/index.html', import.meta.url), 'utf8');
  const configured = html.match(/globalThis\.PTBO_MULTIPLAYER_SERVER_URL\s*=\s*("[^"\r\n]+")\s*;/);
  if (!configured || JSON.parse(configured[1]) !== serverUrl) throw new Error('Published browser endpoint does not match MULTIPLAYER_SERVER_URL');
  const manifest = JSON.parse(await readFile(new URL('../city-explorer/multiplayer/world-data/v1/world-manifest.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(await verifyDeployedWorld({ serverUrl, expectedWorldVersion: manifest.worldVersion })));
}
