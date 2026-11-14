import { test, expect } from '@playwright/test';

test('the emulated hand can select the life-size spatial control', async ({page}) => {
  await page.goto('/');
  const enter=page.getByRole('button',{name:'Enter VR',exact:true});
  await expect(enter).toBeEnabled({timeout:30000});
  await enter.click();
  await expect(page.getByRole('button',{name:'VR active',exact:true})).toBeVisible({timeout:30000});
  await page.evaluate(async () => {
    const remote=(window as any).IWER_DEVICE.remote;
    const head=await remote.dispatch('get_transform',{device:'headset'});
    const h=head.position;
    await remote.dispatch('set_transform',{device:'hand-right', position:{x:h.x,y:h.y,z:h.z-.25}});
    await remote.dispatch('look_at',{device:'hand-right',target:{x:h.x-.1815,y:h.y+.0605,z:h.z-.56}});
    await remote.dispatch('select',{device:'hand-right',duration:0.3});
  });
  await expect(page.getByRole('button',{name:'Life-size',exact:true})).toHaveAttribute('aria-pressed','true',{timeout:10000});
});
