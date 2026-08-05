import { test, expect } from '@playwright/test';

const base = '/gta-fire-response/?test=1&tiles=off&debug=1&unlock=all&seed=606';

test.describe('Player-benefit audit regressions', () => {
  test('partial thumb-stick travel reports precision throttle instead of legacy jump', async ({ page }) => {
    await page.goto(base);
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    const result = await page.evaluate(() => {
      const game = window.__PFR_GAME__;
      game.mode = 'truck';
      game.truck.speed = 0;
      game.truck.heading = 0;
      game.truck.desiredHeading = 0;
      game.input.analog.x = 0;
      game.input.analog.y = -.2;
      game.updateTruck(1 / 60);
      return {
        raw:game.playerBenefitMetrics?.rawThrottle,
        shaped:game.playerBenefitMetrics?.shapedThrottle,
        speed:game.truck.speed
      };
    });
    expect(result.raw).toBeCloseTo(.2, 2);
    expect(result.shaped).toBeGreaterThan(0);
    expect(result.shaped).toBeLessThan(.12);
    expect(result.speed).toBeGreaterThan(0);
  });

  test('menu typing cannot steer or trigger apparatus controls and Escape restores focus', async ({ page }) => {
    await page.goto(base);
    await page.locator('#phase5-open').click();
    await page.locator('[data-phase5-tab="options"]').click();
    const saveText = page.locator('#phase5-save-text');
    await saveText.focus();
    await page.keyboard.type('backup text');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('q');
    const inputState = await page.evaluate(() => ({
      keys:[...window.__PFR_GAME__.input.keys],
      events:[...window.__PFR_GAME__.input.events],
      actionHeld:window.__PFR_GAME__.input.actionHeld,
      value:document.getElementById('phase5-save-text').value
    }));
    expect(inputState.keys).toEqual([]);
    expect(inputState.events).toEqual([]);
    expect(inputState.actionHeld).toBe(false);
    expect(inputState.value).toContain('backup text');

    await page.keyboard.press('Escape');
    await expect(page.locator('#phase5-panel')).not.toHaveClass(/show/);
    await expect(page.locator('#phase5-open')).toBeFocused();
  });

  test('apparatus exit is refused when every safe point is occupied', async ({ page }) => {
    await page.goto(base);
    const result = await page.evaluate(() => {
      const game = window.__PFR_GAME__;
      game.mode = 'truck';
      game.truck.speed = 0;
      game.traffic.vehicles.length = 0;
      for (let index = 0; index < 5; index += 1) {
        const point = game.safeExitPoint();
        if (!point) break;
        game.traffic.vehicles.push({ active:true, lat:point.lat, lng:point.lng });
      }
      const exited = game.exitTruck();
      return {
        exited,
        mode:game.mode,
        toast:document.getElementById('toast').textContent,
        occupied:game.traffic.vehicles.length
      };
    });
    expect(result.occupied).toBeGreaterThanOrEqual(4);
    expect(result.exited).toBe(false);
    expect(result.mode).toBe('truck');
    expect(result.toast).toContain('EXIT BLOCKED');
  });
});
