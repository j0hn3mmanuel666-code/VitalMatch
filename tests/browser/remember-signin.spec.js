import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import hbs from 'hbs';
const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
for(const p of ['head-public','public-nav','public-footer'])hbs.handlebars.registerPartial(p,'');
const render=hbs.handlebars.compile(read('views/login.xian'));
for(const width of [1280,390])test(`stay signed in is visible, optional and default on at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.route('http://localhost:3335/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/css/'))return route.fulfill({body:read('public'+url.pathname),contentType:'text/css'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/public-journey.css"></head><body class="vitalmatch-public">'+render(url.searchParams.has('short')?{shortSession:true,error:'Please try again'}:{})+'</body></html>'});
 });
 await page.goto('http://localhost:3335/login');
 const checkbox=page.getByRole('checkbox',{name:'Keep me signed in'});await expect(checkbox).toBeChecked();await expect(checkbox).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await checkbox.uncheck();expect(await page.locator('form').evaluate(e=>new FormData(e).has('rememberMe'))).toBe(false);
 await page.goto('http://localhost:3335/login?short');await expect(checkbox).not.toBeChecked();
});
