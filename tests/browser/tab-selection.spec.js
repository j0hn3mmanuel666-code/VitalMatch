import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import hbs from 'hbs';
const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
hbs.handlebars.registerHelper('equals',function(a,b,options){return a===b?options.fn(this):options.inverse(this);});
for(const theme of ['','dark'])for(const kind of ['settings','cms'])test(`${kind} only selected tab is red in ${theme||'light'} mode`,async({page})=>{
 const source=read(kind==='settings'?'views/admin-settings.xian':'views/admin-public-cms.xian');
 const tabs=source.match(/<div class="vm-tabs[^>]*>[\s\S]*?<\/div>/)[0];
 const buttons=hbs.handlebars.compile(tabs)({content:[{section:'hero'},{section:'about'}]});
 const start=source.indexOf('// Tab switching'),end=source.indexOf(kind==='settings'?'// Load settings from API':'const popup',start);
 const script=source.slice(start,end);
 const panels=kind==='settings'?['general','email','notifications','security'].map(s=>`<div id="${s}-tab" class="settings-content ${s==='general'?'':'hidden'}"></div>`).join(''):'<div class="tab-content" data-section="hero"></div><div class="tab-content" data-section="about" style="display:none"></div>';
 await page.route('http://localhost:3335/**',route=>{
  const p=new URL(route.request().url()).pathname;
  if(p.startsWith('/css/')||p.startsWith('/js/'))return route.fulfill({body:read('public'+p),contentType:p.endsWith('.css')?'text/css':'application/javascript'});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><html class="${theme}"><head><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"><script src="/js/internal-ui.js" defer></script></head><body class="vm-internal">${buttons}${panels}<script>document.addEventListener('DOMContentLoaded',()=>{${script}});</script></body></html>`});
 });
 await page.goto('http://localhost:3335/tabs');
 const tabsLocator=page.locator('.vm-tabs button');
 const assertSelection=async selected=>{
  await expect.poll(async()=>tabsLocator.evaluateAll(es=>es.every(e=>e.getAttribute('aria-pressed')==='true'||getComputedStyle(e).borderBottomColor==='rgba(0, 0, 0, 0)'))).toBe(true);
  const states=await tabsLocator.evaluateAll(es=>es.map(e=>({selected:e.getAttribute('aria-pressed'),border:getComputedStyle(e).borderBottomColor,color:getComputedStyle(e).color,brand:getComputedStyle(e).getPropertyValue('--vm-brand').trim()})));
  states.forEach((s,i)=>{expect(s.selected).toBe(String(i===selected));if(i===selected)expect(s.border).not.toBe('rgba(0, 0, 0, 0)');else expect(s.border).toBe('rgba(0, 0, 0, 0)');});
  expect(states[selected].color).not.toBe(states[(selected+1)%states.length].color);
 };
 await assertSelection(0);await tabsLocator.nth(1).click();await assertSelection(1);
});
