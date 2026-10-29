import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialState } from '../src/model';
const savedFixture = structuredClone(initialState);
savedFixture.layouts.forEach(layout => { layout.room.width = 6.2; });

const storageKey = 'roomshift.v1';
async function openEditor(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make room for a better layout.' })).toBeVisible();
}
async function setWidth(page: Page, width: string) {
  await page.getByRole('spinbutton', { name: 'Room width', exact: true }).fill(width);
  await page.getByRole('spinbutton', { name: 'Room width', exact: true }).press('Enter');
}
async function exportPlan(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 2D plan', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^roomshift-layout-[ab]\.svg$/);
  return readFile((await file.path())!, 'utf8');
}

test('production scene opens without injected XR and room edits survive restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openEditor(page);
  await expect(page.locator('.scene-host canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Opening your room…')).toHaveCount(0);
  await expect(page.getByText('The 3D view could not start.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enter VR', exact: true })).toBeDisabled();
  await setWidth(page, '6.2');
  await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toHaveValue('5.4');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toHaveValue('6.2');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.layouts[0].room.width, storageKey)).toBe(6.2);
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toHaveValue('6.2');
  expect(await exportPlan(page)).toContain('620');
  expect(errors).toEqual([]);
});

test('repeated modal cancellation and invalid inputs leave the plan unchanged', async ({ page }) => {
  await openEditor(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (i === 0) await page.getByRole('button', { name: 'Close dialog' }).click();
    else await page.getByRole('dialog').press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('6 of 12 items')).toBeVisible();
  }
  await setWidth(page, '0');
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toHaveValue('5.4');
  await expect(page.getByText('Room width must be between 2 and 20.')).toBeVisible();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('button', { name: 'Bookshelf Storage with a tall footprint' }).click();
  await expect(page.getByText('7 of 12 items')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('6 of 12 items')).toBeVisible();
});

for (const original of ['{broken', '', '{"version":2,"state":{}}']) {
  test(`unreadable saved bytes survive editing, autosave and restart: ${JSON.stringify(original)}`, async ({ page }) => {
    await page.addInitScript(({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }, { key: storageKey, value: original });
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Changes not saved', exact: true })).toBeVisible();
    await setWidth(page, '6.2');
    await page.getByRole('button', { name: 'Changes not saved', exact: true }).click();
    await expect(page.getByText(/Existing saved data is preserved/)).toBeVisible();
    await expect(page.getByText(/Reloading will lose unsaved edits.*not an editable backup.*other layout or photos/)).toBeVisible();
    expect(await exportPlan(page)).toContain('620');
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(original);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Changes not saved', exact: true })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(original);
  });
}

test('quota failure retains in-memory changes and permits explicit retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, 'fixtureStorageBlocked', { value: true, writable: true });
    Storage.prototype.setItem = function(key, value) {
      if (key === 'roomshift.v1' && (window as unknown as { fixtureStorageBlocked: boolean }).fixtureStorageBlocked) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await openEditor(page);
  await setWidth(page, '6.3');
  await expect(page.getByRole('button', { name: 'Changes not saved', exact: true })).toBeVisible();
  expect(await exportPlan(page)).toContain('630');
  await page.evaluate(() => { (window as unknown as { fixtureStorageBlocked: boolean }).fixtureStorageBlocked = false; });
  await page.getByRole('button', { name: 'Changes not saved', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.layouts[0].room.width, storageKey)).toBe(6.3);
});

test('art import rejects invalid data and persists a locally generated image', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Select Wall art', exact: true }).click();
  const picker = page.getByLabel('Choose art photo');
  await picker.setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic invalid image') });
  await expect(page.getByText('Choose a JPG, PNG or WebP image.')).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext('2d')!; context.fillStyle = '#123456'; context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await picker.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('button', { name: 'Remove art photo', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => !!JSON.parse(localStorage.getItem(key) ?? 'null')?.state.layouts[0].items.find((item: { id: string }) => item.id === 'art-1').photo, storageKey)).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Select Wall art', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove art photo', exact: true })).toBeVisible();
});

test('a transient startup read failure preserves an unseen valid saved plan', async ({ page }) => {
  await page.addInitScript(({ key, original }) => {
    localStorage.setItem(key, original);
    const get = Storage.prototype.getItem;
    let failOnce = true;
    Storage.prototype.getItem = function(k) {
      if (k === key && failOnce) { failOnce = false; throw new DOMException('Synthetic read denial', 'SecurityError'); }
      return get.call(this, k);
    };
  }, { key: storageKey, original: JSON.stringify({ version: 1, state: savedFixture }) });
  await openEditor(page);
  await expect(page.getByRole('button', { name: 'Changes not saved', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).state.layouts[0].room.width, storageKey)).toBe(6.2);
});
