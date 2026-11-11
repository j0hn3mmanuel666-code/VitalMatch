import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import hbs from 'hbs';
const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
const html=hbs.handlebars.compile(read('views/admin-users.xian'))({});
for(const width of [1660,1280,390])test(`users fit and paginate at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const queries=[];let mutations=0;
 await page.route('http://localhost:3335/**',route=>{
  const url=new URL(route.request().url());
  if(route.request().method()!=='GET'){mutations++;return route.fulfill({status:500,json:{success:false}});}
  if(url.pathname==='/admin/users/api'){
   const p=Number(url.searchParams.get('page')),limit=Number(url.searchParams.get('limit'));queries.push(url.searchParams);
   const users=Array.from({length:5},(_,i)=>({id:(p-1)*5+i+1,firstName:'Sample Long First Name',lastName:'Long Family Name',email:'long.sample.email.address@example.test',phone:'09123456789',role:'donor',isActive:true,createdAt:'2026-11-01'}));
   return route.fulfill({json:{success:true,users,pagination:{currentPage:p,limit,totalCount:12,totalPages:3,hasPrevPage:p>1,hasNextPage:p<3}}});
  }
  if(url.pathname.startsWith('/css/')||url.pathname==='/js/internal-ui.js')return route.fulfill({body:read('public'+url.pathname),contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript'});
  if(url.pathname.startsWith('/js/vendor/'))return route.fulfill({body:'',contentType:'application/javascript'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"><script src="/js/internal-ui.js" defer></script></head><body class="vm-internal"><div style="margin-left:'+(width>1000?260:0)+'px">'+html+'</div></body></html>'});
 });
 await page.goto('http://localhost:3335/admin/users');
 await expect(page.locator('#usersTableBody tr')).toHaveCount(5);
 expect(queries[0].get('limit')).toBe('5');
 expect(await page.locator('.user-register').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.getByRole('navigation',{name:'User pages'})).toHaveCount(2);
 await page.getByRole('button',{name:'Next',exact:true}).first().click();
 await expect(page.locator('[data-user-page-summary]').first()).toContainText('Showing 6–10 of 12');
 await page.getByRole('button',{name:'Previous',exact:true}).last().click();
 await expect(page.locator('[data-user-page-summary]').first()).toContainText('Showing 1–5 of 12');
 await page.getByLabel('Filter users by role').selectOption('donor');
 await expect.poll(()=>queries.at(-1).get('role')).toBe('donor');
 await page.getByLabel('Search users',{exact:true}).fill('Sample');
 await expect.poll(()=>queries.at(-1).get('search')).toBe('Sample');
 expect(queries.at(-1).get('page')).toBe('1');
 await page.locator('.user-checkbox').first().check();
 await expect(page.locator('#selectedCount')).toHaveText('1');
 expect(mutations).toBe(0);
});
