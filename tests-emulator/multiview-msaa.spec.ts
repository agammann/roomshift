import { expect, test } from '@playwright/test';

for (const normalRtt of [false, true]) {
  test(`multiview MSAA uses the multiview framebuffer with ordinary RTT ${normalRtt ? 'present' : 'absent'}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests-emulator/multiview-harness.html');
    await page.waitForFunction(() => typeof (window as any).checkMultiviewMsaaTarget === 'function');
    const result = await page.evaluate(value => (window as any).checkMultiviewMsaaTarget(value), normalRtt);
    expect(result.multisampleCalls).toBe(2);
    expect(result.boundMultiview).toBe(true);
    expect(result.boundOrdinaryMsaa).toBe(false);
    expect(result.ordinaryDisablesRtt).toBe(true);
    expect(result.status).toBe(result.complete);
    expect(result.glError).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const supportsMsaa of [false, true]) {
  test(`XR multiview ${supportsMsaa ? 'uses available' : 'safely disables unavailable'} multisampling`, async ({ page }) => {
    await page.goto('/tests-emulator/multiview-harness.html');
    await page.waitForFunction(() => typeof (window as any).checkXrMsaaNegotiation === 'function');
    const result = await page.evaluate(value => (window as any).checkXrMsaaNegotiation(value), supportsMsaa);
    expect(result.samples).toBe(supportsMsaa ? 4 : 0);
    expect(result.isMultiview).toBe(true);
    expect(result.textureType).toBe('texture-array');
    expect(result.glError).toBe(0);
  });
}

test('a manually requested unsupported multiview multisample target fails explicitly', async ({ page }) => {
  await page.goto('/tests-emulator/multiview-harness.html');
  await page.waitForFunction(() => typeof (window as any).checkUnsupportedMultiviewMsaa === 'function');
  const message = await page.evaluate(() => (window as any).checkUnsupportedMultiviewMsaa());
  expect(message).toContain('multisampled multiview requires the Oculus multiview multisample extension');
});

for (const autoDepth of [false, true]) {
  for (const disposeRenderer of [false, true]) {
    test(`multiview ${autoDepth ? 'auto' : 'external'} depth survives resize and ${disposeRenderer ? 'renderer' : 'target'} disposal`, async ({ page }) => {
      await page.goto('/tests-emulator/multiview-harness.html');
      const result = await page.evaluate(([auto, dispose]) => (window as any).checkMultiviewOwnership(auto, dispose), [autoDepth, disposeRenderer]);
      expect(result.internalCount).toBe(autoDepth ? 2 : 0);
      expect(result.internalDeleted).toEqual(Array(result.internalCount).fill(1));
      expect(result.internalAlive).toEqual(Array(result.internalCount).fill(false));
      expect(result.externalDeleted).toEqual([false, false, false, false]);
      expect(result.externalAlive).toEqual([true, true, true, true]);
      expect(result.statuses).toEqual(Array(4).fill(result.complete));
      expect(result.glError).toBe(0);
    });
  }
}

test('multiview auto-depth ownership remains correct after context restoration', async ({ page }) => {
  await page.goto('/tests-emulator/multiview-harness.html');
  const result = await page.evaluate(() => (window as any).checkMultiviewOwnershipAfterContextLoss());
  expect(result.before).toBe(result.complete); expect(result.after).toBe(result.complete);
  expect(result.internalCount).toBe(2); expect(result.newInternalDistinct).toBe(true);
  expect(result.newInternalAlive).toBe(false); expect(result.newInternalDeletes).toBe(1);
  expect(result.externalDeletes).toEqual([false, false, false, false]);
  expect(result.restoredExternalAlive).toEqual([true, true]); expect(result.glError).toBe(0);
});

for (const availableAfter of [false, true]) {
  test(`XR uses ${availableAfter ? 'newly available' : 'removed'} extension state after context restoration`, async ({ page }) => {
    await page.goto('/tests-emulator/multiview-harness.html');
    const result = await page.evaluate(value => (window as any).checkXrExtensionsAfterContextLoss(value), availableAfter);
    expect(result.before).toBe(!availableAfter); expect(result.after).toBe(availableAfter);
    expect(result.textureType).toBe(availableAfter ? 'texture-array' : undefined); expect(result.glError).toBe(0);
  });
}

test('default multiview target allocates and releases its depth texture', async ({ page }) => {
  await page.goto('/tests-emulator/multiview-harness.html');
  const result = await page.evaluate(() => (window as any).checkDefaultMultiviewTarget());
  expect(result.status).toBe(result.complete); expect(result.owned).toBe(true);
  expect(result.alive).toBe(false); expect(result.glError).toBe(0);
});

for (const effect of [false, true]) {
  for (const hasTarget of [false, true]) {
    test(`multiview XR rejects HDR ${effect ? 'effects' : 'tone mapping'} with ${hasTarget ? 'an active' : 'no active'} target before mutating state`, async ({ page }) => {
      await page.goto('/tests-emulator/multiview-harness.html');
      const result = await page.evaluate(([useEffect, target]) => (window as any).checkMultiviewHdrRejected(useEffect, target), [effect, hasTarget]);
      expect(result.message).toContain('multiview XR HDR output and post-processing effects are not supported');
      expect(result.preservedTarget).toBe(true); expect(result.preservedToneMapping).toBe(true);
      expect(result.recovered).toBe(true); expect(result.glError).toBe(0);
    });
  }
}

test('multiview shader programs track the exact view count and reuse the matching variant', async ({ page }) => {
  await page.goto('/tests-emulator/multiview-harness.html');
  const result = await page.evaluate(() => (window as any).checkMultiviewViewCountVariants());
  expect(result.observed).toEqual([1, 2, 1]); expect(result.versions).toEqual([1, 2]); expect(result.glError).toBe(0);
});

for (const [override, grouped, callback] of [[false, false, false], [true, false, false], [false, true, false], [false, false, true]]) {
  test(`multiview rejects ${callback ? 'callback-mutated' : grouped ? 'grouped' : override ? 'override' : 'direct'} transmissive materials and recovers`, async ({ page }) => {
    await page.goto('/tests-emulator/multiview-harness.html');
    const result = await page.evaluate(([useOverride, useGroups, useCallback]) => (window as any).checkMultiviewTransmissionRejected(useOverride, useGroups, useCallback), [override, grouped, callback]);
    expect(result.message).toContain('transmissive materials are not supported in multiview XR');
    expect(result.preservedTarget).toBe(true); expect(result.recovered).toBe(true); expect(result.mono).toBe(true); expect(result.glError).toBe(0);
  });
}
