import { test, expect } from '@playwright/test';
const url = '/gta-fire-response/?test=1&tiles=off&debug=1&call=structure&seed=222&time=night';

test.describe('Peterborough Fire Response Phase 2', () => {
  test('living-city systems initialize and stay capped', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await page.goto(url);
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    await page.getByTestId('start-shift').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.__PFR_PHASE2__))).toBe(true);
    await expect(page.locator('#mobile-status-strip')).toBeVisible();
    await page.evaluate(() => {
      const game = window.__PFR_GAME__;
      Object.assign(game.player, game.closestDoorPoint());
      game.enterTruck();
      Object.assign(game.truck, { lat:game.activeCall.lat, lng:game.activeCall.lng, speed:0 });
      if (game.state.current === 'DISPATCHED') game.state.transition('ENROUTE','test');
      if (game.state.current === 'ENROUTE') game.state.transition('ARRIVING','test');
      game.incident.arrive();
      game.exitTruck();
    });
    await expect(page.locator('#phase2-panel')).toHaveClass(/show/);
    const counts = await page.evaluate(() => window.__PFR_PHASE2__.entities.summary());
    expect(counts.crew).toBeLessThanOrEqual(3);
    expect(counts.hydrant).toBeLessThanOrEqual(16);
  });

  test('failed road state exposes an enabled retry action', async ({ page }) => {
    await page.goto(url);
    await page.evaluate(() => window.__PFR_GAME__.ui.setRoadStatus('failed','Road network failed. Tap Retry Road Data.'));
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    await expect(page.getByTestId('start-shift')).toHaveText(/Retry Road Data/);
  });
});
