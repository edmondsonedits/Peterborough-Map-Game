import { test, expect } from '@playwright/test';

const url = '/gta-fire-response/?test=1&tiles=off&debug=1&call=structure&seed=123';

test.describe('Peterborough Fire Response Phase 1', () => {
  test('desktop structure-fire smoke journey', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    await page.getByTestId('start-shift').click();
    await expect.poll(() => page.evaluate(() => window.__PFR_PHASE1_GAME__?.state.current)).toBe('DISPATCHED');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    const moved = await page.evaluate(() => window.__PFR_PHASE1_GAME__.player.lng);
    expect(moved).toBeGreaterThan(-78.322206);
    await page.evaluate(() => {
      const game = window.__PFR_PHASE1_GAME__;
      Object.assign(game.player, game.closestDoorPoint());
      game.enterTruck();
    });
    await expect.poll(() => page.evaluate(() => window.__PFR_PHASE1_GAME__.mode)).toBe('truck');
    await page.keyboard.press('KeyL');
    await page.keyboard.press('KeyQ');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    await expect.poll(() => page.evaluate(() => Math.abs(window.__PFR_PHASE1_GAME__.truck.speed))).toBeGreaterThan(0);
    await expect(page.getByTestId('fire-truck')).toBeVisible();
    await page.screenshot({ path: 'test-results/phase1-driving-desktop.png', fullPage: true });
  });

  test('mobile start screen has no document scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    const dimensions = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight }));
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.innerHeight);
    await page.screenshot({ path: 'test-results/phase1-start-mobile.png', fullPage: true });
  });
});
