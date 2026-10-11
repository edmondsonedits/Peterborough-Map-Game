'use strict';

async function diagnostics(page) {
  return page.evaluate(() => ({
    status: document.documentElement.dataset.authoredSceneStatus || '',
    error: document.documentElement.dataset.authoredSceneError || '',
    firefighterAsset: document.documentElement.dataset.firefighterAsset || '',
    pumperAsset: document.documentElement.dataset.pumperAsset || '',
    enabled: document.documentElement.dataset.authoredSceneEnabled || '',
    count: Number(document.documentElement.dataset.authoredSceneCount || 0),
    gameplayReady: document.documentElement.dataset.gameplayReady || '',
    api: globalThis.__PTBO_AUTHORED_SCENE__?.status?.() || null,
  }));
}

async function waitForAuthoredScene(page, expected, timeout) {
  try {
    await page.waitForFunction(expected => {
      const status = document.documentElement.dataset.authoredSceneStatus;
      return status === expected || status === 'failed';
    }, expected, { timeout });
  } catch (error) {
    const state = await diagnostics(page);
    throw new Error(`Authored scene expected ${expected}: ${error.message}; diagnostics: ${JSON.stringify(state)}`, { cause: error });
  }
  const state = await diagnostics(page);
  if (state.status !== expected) {
    throw new Error(`Authored scene expected ${expected}; diagnostics: ${JSON.stringify(state)}`);
  }
}
module.exports = { diagnostics, waitForAuthoredScene };
