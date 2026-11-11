import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

async function callPage(page) {
  const confirm = readFileSync(new URL('../../views/partials/confirm-dialog.xian', import.meta.url), 'utf8');
  await page.route('http://localhost:3335/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
      return route.fulfill({ body: readFileSync(new URL(`../../public${url.pathname}`, import.meta.url)), contentType: (url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css') + '; charset=utf-8' });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/internal-utilities.css"><link rel="stylesheet" href="/css/internal.css"></head><body class="vm-internal"><main><button id="background">Workspace action</button></main>${confirm}<script src="/js/internal-ui.js"></script><script src="/js/webrtcManager.js"></script><script src="/js/callUI.js"></script><script src="/js/callManager.js"></script><script>
      window.events=[];
      const signal={isConnected:()=>true,sendCallOffer:()=>{},sendIceCandidate:()=>{},sendCallDecline:id=>events.push(['decline',id]),sendCallEnd:id=>events.push(['end',id])};
      window.rtc=new WebRTCManager(signal);rtc.iceServers=[];
      const ui=new CallUI('unused',null);
      window.callManager=new CallManager(2,signal,rtc,ui);ui.callManager=callManager;
      window.receive=()=>callManager.handleIncomingCall({callId:9,caller:{id:1,name:'Synthetic Caller'},callType:'video',offer:{}});
      window.start=async()=>{await callManager.initiateCall(1,'video');signal.onCallCreated({callId:10});window.tracks=rtc.localStream.getTracks();rtc.onConnectionStateChange('connected');};
    </script></body></html>` });
  });
  await page.goto('http://localhost:3335/');
}

for (const mobile of [false, true]) {
  test(`incoming decline and immediate video hangup work at ${mobile ? 'phone' : 'desktop'} size`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 });
    await callPage(page);
    await page.evaluate(() => window.receive());
    await expect(page.getByRole('heading', { name: 'Synthetic Caller' })).toBeVisible();
    await page.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(page.locator('#incoming-call-notification')).toHaveCount(0);
    expect(await page.evaluate(() => window.events)).toEqual([['decline', 9]]);
    await expect(page.locator('#background')).toBeEnabled();
    await page.evaluate(() => window.start());
    await expect(page.locator('#call-interface')).toBeVisible();
    await page.getByRole('button', { name: 'End call', exact: true }).click();
    await expect(page.locator('#call-interface')).toHaveCount(0);
    expect(await page.evaluate(() => ({ state:callManager.getCallState(), stopped:tracks.every(track=>track.readyState==='ended'), sent:events })))
      .toEqual({ state:'idle', stopped:true, sent:[['decline',9],['end',10]] });
    await expect(page.locator('#confirmModal')).toBeHidden();
    await page.locator('#background').click();
  });
}
