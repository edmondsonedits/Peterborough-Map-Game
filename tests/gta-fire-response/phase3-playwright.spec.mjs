import { test, expect } from '@playwright/test';

const url = '/gta-fire-response/?test=1&tiles=off&debug=1&call=automatic-alarm-water&seed=303';

test.describe('Peterborough Fire Response Phase 3', () => {
  test('boots the alarm operation and exposes ordered objectives', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('start-shift')).toBeEnabled();
    await page.getByTestId('start-shift').click();
    await expect.poll(() => page.evaluate(() => window.__PFR_PHASE3__?.operation?.template?.id)).toBe('alarm');
    const snapshot = await page.evaluate(() => window.__PFR_PHASE3__.operation.snapshot());
    expect(snapshot.objectives[0].id).toBe('arrival');
    expect(snapshot.objectives[1].status).toBe('locked');
    await expect(page.locator('#phase3-open')).toBeVisible();
  });

  test('mobile command panel remains contained and scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await page.getByTestId('start-shift').click();
    await expect(page.locator('#phase3-open')).toBeVisible();
    await page.locator('#phase3-open').click();
    await expect(page.locator('#phase3-panel')).toHaveClass(/show/);
    const dimensions = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      panelWidth: document.getElementById('phase3-panel').getBoundingClientRect().width
    }));
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.pageHeight).toBeLessThanOrEqual(dimensions.viewportHeight);
    expect(dimensions.panelWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });
});
