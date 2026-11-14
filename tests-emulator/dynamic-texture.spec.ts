import { test, expect } from '@playwright/test';

test('a synthetic art-file update reaches an already-active emulated VR session', async ({page}) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await expect(page.locator('.scene-host canvas')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Select Wall art',exact:true}).click();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas'); c.width=8;c.height=8; const x=c.getContext('2d')!; x.fillStyle='#c01f30';x.fillRect(0,0,8,8); return c.toDataURL('image/png').split(',')[1];});
  const renderer=await page.locator('.scene-host canvas').getAttribute('data-engine');
  console.log('Application canvas engine:', renderer);
  expect(renderer).toContain('r187');
  const enter=page.getByRole('button',{name:'Enter VR',exact:true});
  await expect(enter).toBeEnabled({timeout:30000});
  await enter.click();
  await expect(page.getByRole('button',{name:'VR active',exact:true})).toBeVisible({timeout:30000});
  await page.getByLabel('Choose art photo').setInputFiles({name:'xr-synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByRole('button',{name:'Remove art photo',exact:true})).toBeAttached();
  await expect.poll(()=>page.evaluate(()=>!!JSON.parse(localStorage.getItem('roomshift.v1') ?? 'null')?.state.layouts[0].items.find((item:{id:string})=>item.id==='art-1').photo)).toBe(true);
  await page.waitForTimeout(1500);
  expect(failures).toEqual([]);
});
