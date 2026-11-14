import { expect, test } from '@playwright/test';

for (const kind of ['room', 'point', 'spot', 'area', 'probe', 'envmap', 'shadow']) {
  test(`divergent-eye multiview matches separate-eye ${kind} rendering`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests-emulator/multiview-harness.html');
    await page.waitForFunction(() => typeof (window as any).compareStereoLighting === 'function');
    const result = await page.evaluate(kind => (window as any).compareStereoLighting(kind), kind);
    expect(result.glError).toBe(0);
    expect(result.actual).toHaveLength(2);
    for (let eye = 0; eye < 2; eye++) {
      for (let i = 0; i < result.actual[eye].length; i++) {
        if (i % 4 !== 3) expect(Math.abs(result.actual[eye][i] - result.reference[eye][i])).toBeLessThanOrEqual(3);
      }
    }
    expect(errors).toEqual([]);
  });
}
