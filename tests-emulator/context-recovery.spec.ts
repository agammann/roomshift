import { expect, test } from '@playwright/test';

test('the packaged renderer restores a lost context and uploads an updated texture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/tests-emulator/multiview-harness.html');
  await page.waitForFunction(() => typeof (window as any).runContextRecovery === 'function');
  const result = await page.evaluate(() => (window as any).runContextRecovery());
  expect(result.before[0]).toBeGreaterThan(100);
  expect(result.before[1]).toBeLessThan(30);
  expect(result.after[1]).toBeGreaterThan(100);
  expect(result.after[0]).toBeLessThan(30);
  expect(result.glError).toBe(0);
  expect(errors).toEqual([]);
});
