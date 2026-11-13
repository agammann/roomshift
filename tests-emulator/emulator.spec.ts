import { test, expect } from '@playwright/test';

test('the development Quest emulator enters and exits an immersive session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make room for a better layout.' })).toBeVisible();
  await expect(page.locator('.scene-host canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('The 3D view could not start.')).toHaveCount(0);
  const enter = page.getByRole('button', { name: 'Enter VR', exact: true });
  await expect(enter).toBeEnabled({ timeout: 30_000 });

  // Keep the actual request and session intact, retaining only a reference so
  // the test can simulate the device ending its immersive session.
  const supported = await page.evaluate(async () => {
    const xr = (navigator as any).xr;
    if (!(window as any).IWER_DEVICE || !xr) return false;
    const available = await xr.isSessionSupported('immersive-vr');
    const request = xr.requestSession.bind(xr);
    xr.requestSession = (...args: unknown[]) => request(...args).then((session: unknown) => {
      (window as any).__roomshiftTestSession = session;
      return session;
    });
    return available;
  });
  expect(supported).toBe(true);
  await enter.click();
  await expect(page.getByRole('button', { name: 'VR active', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => !!(window as any).__roomshiftTestSession)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).IWER_DEVICE?.devui?.devUIContainer?.style.display)).toBe('');

  await page.evaluate(() => (window as any).__roomshiftTestSession.end());
  await expect(enter).toBeEnabled({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as any).IWER_DEVICE?.devui?.devUIContainer?.style.display)).toBe('none');
  expect(errors).toEqual([]);
});
