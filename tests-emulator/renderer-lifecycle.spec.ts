import { expect, test } from '@playwright/test';

test('shared textures update independently in two multiview renderers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/tests-emulator/multiview-harness.html');
  await page.waitForFunction(() => typeof (window as any).checkSharedTextureRenderers === 'function');
  const result = await page.evaluate(() => (window as any).checkSharedTextureRenderers());
  for (const views of result.before) for (const pixel of views) { expect(pixel[0]).toBeGreaterThan(180); expect(pixel[1]).toBeLessThan(30); }
  for (const views of result.after) for (const pixel of views) { expect(pixel[1]).toBeGreaterThan(180); expect(pixel[0]).toBeLessThan(30); }
  expect(result.versions).toEqual([result.expectedVersion, result.expectedVersion]);
  expect(result.errors).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('a caught nested render failure does not upload its abandoned texture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/tests-emulator/multiview-harness.html');
  await page.waitForFunction(() => typeof (window as any).checkNestedRenderRecovery === 'function');
  const result = await page.evaluate(() => (window as any).checkNestedRenderRecovery());
  expect(result.caught).toBe(true);
  expect(result.innerVersion).toBeNull();
  expect(result.outerVersion).toBe(result.expectedVersion);
  for (const pixel of result.pixels) { expect(pixel[0]).toBeGreaterThan(180); expect(pixel[1]).toBeLessThan(30); }
  expect(result.glError).toBe(0);
  expect(errors).toEqual([]);
});
