import { test, expect } from '@playwright/test';

const base = '/gta-fire-response/?test=1&tiles=off&debug=1&unlock=all&seed=505';

test.describe('Peterborough Fire Response complete Phase 5 release', () => {
  test('Operations Centre changes difficulty and accessibility on the title screen', async ({ page }) => {
    await page.goto(base);
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    await expect(page.locator('#phase5-open')).toBeVisible();
    await page.locator('#phase5-open').click();
    await expect(page.locator('#phase5-panel')).toHaveClass(/show/);
    await page.locator('[data-phase5-tab="options"]').click();
    await page.locator('[data-difficulty="veteran"]').click();
    await page.locator('[data-accessibility="highContrast"]').check();
    const state = await page.evaluate(() => ({
      difficulty:window.__PFR_PHASE5__.save.data.difficulty,
      highContrast:document.body.classList.contains('phase5-high-contrast'),
      callCount:window.__PFR_PHASE5__.allCalls().length
    }));
    expect(state.difficulty).toBe('veteran');
    expect(state.highContrast).toBe(true);
    expect(state.callCount).toBe(23);
  });

  test('a new Phase 5 incident boots with randomized operational conditions', async ({ page }) => {
    await page.goto(`${base}&call=apartment-fire-bethune`);
    await page.getByTestId('start-shift').click();
    await expect.poll(() => page.evaluate(() => window.__PFR_GAME__?.activeCall?.id)).toBe('apartment-fire-bethune');
    await expect(page.locator('#phase5-call-briefing')).toHaveClass(/show/);
    const operation = await page.evaluate(() => ({
      variant:window.__PFR_PHASE5__.variant?.id,
      risk:window.__PFR_PHASE3__.operation?.template?.baseRisk,
      objectives:window.__PFR_PHASE3__.operation?.objectives?.length,
      callType:window.__PFR_GAME__.activeCall?.type
    }));
    expect(operation.variant).toBeTruthy();
    expect(operation.risk).toBeGreaterThan(0);
    expect(operation.objectives).toBeGreaterThanOrEqual(6);
    expect(operation.callType).toBe('structure-fire');
  });

  test('mobile Operations Centre and replayable tutorial remain contained', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await page.goto(base);
    await page.locator('#phase5-open').click();
    await page.locator('[data-phase5-tab="options"]').click();
    const dimensions = await page.evaluate(() => ({
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      pageHeight:document.documentElement.scrollHeight,
      viewportHeight:innerHeight,
      panelWidth:document.getElementById('phase5-panel').getBoundingClientRect().width
    }));
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.pageHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
    expect(dimensions.panelWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    await page.locator('[data-phase5="tutorial"]').click();
    await expect(page.locator('#phase5-tutorial')).toHaveClass(/show/);
    await expect(page.locator('#phase5-tutorial-title')).not.toBeEmpty();
    await page.locator('[data-phase5="skip-tutorial"]').click();
    await expect(page.locator('#phase5-tutorial')).not.toHaveClass(/show/);
  });
});
