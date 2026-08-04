import { test, expect } from '@playwright/test';

const url = '/gta-fire-response/?test=1&tiles=off&debug=1&unlock=all&seed=404';

test.describe('Peterborough Fire Response Phase 4', () => {
  test('station and apparatus selection changes the actual deployment', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    await expect(page.locator('#phase4-open')).toBeVisible();
    await page.locator('#phase4-open').click();
    await page.locator('[data-station="station-3"]').click();
    await page.locator('[data-apparatus="rescue-3"]').click();
    const deployment = await page.evaluate(() => ({
      station: window.__PFR_PHASE4__.save.data.selectedStation,
      apparatus: window.__PFR_PHASE4__.save.data.selectedApparatus,
      player: { lat:window.__PFR_GAME__.player.lat, lng:window.__PFR_GAME__.player.lng },
      tank: window.__PFR_PHASE2__.hydrants.maxTank
    }));
    expect(deployment.station).toBe('station-3');
    expect(deployment.apparatus).toBe('rescue-3');
    expect(deployment.player.lat).toBeCloseTo(44.28488, 4);
    expect(deployment.tank).toBe(350);
  });

  test('mobile HQ panel is contained without page scrolling', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await page.goto(url);
    await expect(page.locator('#phase4-open')).toBeVisible();
    await page.locator('#phase4-open').click();
    await expect(page.locator('#phase4-panel')).toHaveClass(/show/);
    const dimensions = await page.evaluate(() => ({
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      pageHeight:document.documentElement.scrollHeight,
      viewportHeight:innerHeight,
      panelWidth:document.getElementById('phase4-panel').getBoundingClientRect().width
    }));
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.pageHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
    expect(dimensions.panelWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });
});
