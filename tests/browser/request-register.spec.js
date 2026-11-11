import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import hbs from 'hbs';
const h = hbs.handlebars;
h.registerHelper('eq', (a,b) => a===b);
h.registerHelper('formatDate', () => '5 Nov 2026');
for (const name of ['record-search','pagination','status-badge']) h.registerPartial(name,'');
h.registerPartial('request-pagination',readFileSync(new URL('../../views/partials/request-pagination.xian',import.meta.url),'utf8'));
const requests=Array.from({length:10},(_,i)=>({id:52-i,patientName:'Sample Patient With A Long Name',patientReference:'VM5200-2600002',hospitalName:'Sample Hospital With A Long Facility Name',city:'Calapan City',bloodType:'AB+',urgency:'critical',status:i===0?'active':'pending',unitsRemaining:8,unitsRequired:8,unitsFulfilled:0}));
const html=h.compile(readFileSync(new URL('../../views/admin-requests.xian',import.meta.url),'utf8'))({requests,pagination:{page:2,totalPages:3,total:27,limit:10,hasPrev:true,hasNext:true,pageParam:'page',previousUrl:'/admin/requests?filter=pending&search=Sample&page=1',nextUrl:'/admin/requests?filter=pending&search=Sample&page=3'}});
for(const width of [1660,1280,390]) test(`request details and pagination fit at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('http://localhost:3335/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/css/')||path.startsWith('/js/'))return route.fulfill({body:readFileSync(new URL('../../public'+path,import.meta.url)),contentType:path.endsWith('.css')?'text/css':'application/javascript'});
  if(path.startsWith('/api/'))return route.fulfill({json:{success:true,count:0}});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"><script src="/js/workspace-pagination.js" defer></script></head><body class="vm-internal"><div style="margin-left:'+(width>1000?'260':'0')+'px">'+html+'</div></body></html>'});
 });
 await page.goto('http://localhost:3335/admin/requests?filter=pending&search=Sample&page=2');
 const register=page.locator('.request-register');
 expect(await register.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await expect(page.locator('.request-register tbody tr')).toHaveCount(10);
 for(const cell of await page.locator('.request-register tbody tr').first().locator('td').all()){
  const box=await cell.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
 }
 await expect(page.getByRole('navigation',{name:'Blood request pages'})).toHaveCount(2);
 await expect(page.getByRole('link',{name:'Next',exact:true}).first()).toHaveAttribute('href','/admin/requests?filter=pending&search=Sample&page=3');
 await page.getByRole('button',{name:'Coordinate',exact:true}).click();
 await expect(page.locator('#schedule-modal-52')).toBeVisible();
});
