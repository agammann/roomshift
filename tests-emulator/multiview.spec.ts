import { expect, test } from '@playwright/test';

for (const [name, external, autoDepth] of [
  ['renderer-allocated', false, false],
  ['XR-like external color and depth', true, false],
  ['XR-like external color with automatic depth', true, true],
] as const) {
  test(`synthetic multiview renders and updates both eyes: ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests-emulator/multiview-harness.html');
    await page.waitForFunction(() => typeof (window as any).runMultiviewFixture === 'function');
    const result = await page.evaluate(async ({ external, autoDepth }) => {
      return (window as any).runMultiviewFixture(external, autoDepth);
    }, { external, autoDepth });
    expect(result.initialError).toBe(0);
    expect(result.setupError).toBe(0);
    expect(result.framebuffer).toBe(result.framebufferComplete);
    expect(result.renderError).toBe(0);
    for (const pixel of result.before) { expect(pixel[0]).toBeGreaterThan(100); expect(pixel[1]).toBeLessThan(30); }
    for (const pixel of result.after) { expect(pixel[1]).toBeGreaterThan(100); expect(pixel[0]).toBeLessThan(30); }
    expect(errors).toEqual([]);
  });
}
