import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../../public/js/message-time.js',import.meta.url),'utf8');
for(const [width,zone] of [[1280,'UTC'],[390,'America/New_York']])test.describe(`message times ${width}px`,()=>{
 test.use({viewport:{width,height:844},timezoneId:zone});
 test('Manila time stays correct and relative time advances without losing the draft',async({page})=>{
  await page.clock.install({time:new Date('2026-11-05T17:45:00Z')});
  await page.route('http://localhost:3335/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><main data-message-time-zone="Asia/Manila" data-message-server-now="'+Date.parse('2026-11-05T17:45:00Z')+'"><time id="absolute" datetime="2026-11-05T17:45:00Z" data-message-time>Old server time</time><time id="relative" datetime="2026-11-05T17:44:30Z" data-message-time data-message-relative>Just now</time><textarea aria-label="Message draft"></textarea></main><script>'+script+'</script></body></html>'}));
  await page.goto('http://localhost:3335/messages');
  await expect(page.locator('#absolute')).toHaveText('01:45 AM');
  await expect(page.locator('#absolute')).toHaveAttribute('title',/Nov 6, 2026.*Asia\/Manila/);
  await page.getByLabel('Message draft').fill('Keep this unsent draft');
  await page.clock.fastForward(40000);
  await expect(page.locator('#relative')).toHaveText('1m ago');
  await expect(page.locator('#absolute')).toHaveText('01:45 AM');
  await expect(page.getByLabel('Message draft')).toHaveValue('Keep this unsent draft');
  await expect(page.locator('#absolute')).toHaveAttribute('datetime','2026-11-05T17:45:00Z');
 });
});
