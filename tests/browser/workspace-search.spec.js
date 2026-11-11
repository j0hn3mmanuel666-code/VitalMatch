import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import hbs from 'hbs';
const handlebars = hbs.create().handlebars;
handlebars.registerHelper('eq', (a,b)=>a===b);
handlebars.registerPartial('brand-mark','');
const header = handlebars.compile(readFileSync(new URL('../../views/partials/internal-header.xian',import.meta.url),'utf8'));

for(const mobile of [false,true]) {
  test(`workspace search handles pasted input, Enter, clearing and Escape on ${mobile?'phone':'desktop'}`,async({page})=>{
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1366,height:900});
    await page.route('http://search.test/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/js/')||url.pathname.startsWith('/css/')) return route.fulfill({body:readFileSync(new URL(`../../public${url.pathname}`,import.meta.url)),contentType:(url.pathname.endsWith('.js')?'application/javascript':'text/css')+'; charset=utf-8'});
      if(url.pathname==='/api/search')return route.fulfill({json:{results:url.searchParams.get('q')==='nothing'?[]:[{title:'Messages',subtitle:'Open your inbox',url:'/messages'}]}});
      return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"></head><body class="vm-internal">${header({dashboard:true,navUser:{role:'user',firstName:'Synthetic',lastName:'Account'}})}<main class="vm-page"><h1>Workspace</h1></main></body></html>`});
    });
    await page.goto('http://search.test/dashboard');
    if(mobile)await page.getByRole('button',{name:'Search workspace',exact:true}).click();
    const field=page.locator(mobile?'#dashboardMobileSearchInput':'#dashboardSearch');
    const results=page.locator(mobile?'#dashboardMobileSearchResults':'#dashboardSearchResults');
    await field.fill('message');
    await expect(results.getByRole('link',{name:/Messages/})).toBeVisible();
    await field.fill('');await expect(results).toBeHidden();
    await field.fill('nothing');await expect(results).toContainText('No results found');
    await field.press('Escape');await expect(results).toBeHidden();
    if(mobile)await page.getByRole('button',{name:'Search workspace',exact:true}).click();
    await field.fill('message');await field.press('Enter');
    await expect(page).toHaveURL('http://search.test/messages');
  });
}
