import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const source=f=>readFileSync(new URL('../../public/js/'+f,import.meta.url),'utf8');
for(const width of [1280,390])test(`incoming tone plays and stops at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.route('http://localhost:3335/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="show">Test incoming call</button><script>'+source('call-ringtone.js')+source('callUI.js')+';window.ui=new CallUI("none",{});document.getElementById("show").onclick=()=>ui.showIncomingCallNotification("Synthetic caller","audio",7);</script></body></html>'}));
 await page.goto('http://localhost:3335/test');await page.getByRole('button',{name:'Test incoming call'}).click();
 await expect.poll(()=>page.evaluate(()=>window.ui.ringtone.context.state)).toBe('running');
 const energy=await page.evaluate(async()=>{
  const ring=window.ui.ringtone,analyser=ring.context.createAnalyser();ring.output.connect(analyser);window.testAnalyser=analyser;
  const data=new Uint8Array(analyser.frequencyBinCount);let peak=0;
  for(let i=0;i<50;i++){analyser.getByteFrequencyData(data);peak=Math.max(peak,...data);if(peak>0)break;await new Promise(r=>setTimeout(r,100));}
  return peak;
 });expect(energy).toBeGreaterThan(0);
 const stopped=await page.evaluate(()=>{window.ui.hideIncomingCallNotification();const r=window.ui.ringtone;return !r.ringing&&r.timer===null&&r.voices.size===0;});expect(stopped).toBe(true);
 await expect.poll(()=>page.evaluate(()=>{const data=new Float32Array(window.testAnalyser.fftSize);window.testAnalyser.getFloatTimeDomainData(data);return Math.max(...data.map(Math.abs));})).toBeLessThan(0.00001);
});
