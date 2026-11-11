import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('a received voice track reaches an unmuted playing audio element',async({page})=>{
 await page.route('http://localhost:3335/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script>'+readFileSync(new URL('../../public/js/callUI.js',import.meta.url),'utf8')+';window.testUI=new CallUI(1,{});</script></body></html>'}));
 await page.goto('http://localhost:3335/voice-test');
 await page.getByRole('document').count();
 const result=await page.evaluate(async()=>{
  const ui=window.testUI;ui.showCallInterface('audio',false);
  const context=new AudioContext();await context.resume();
  const tone=context.createOscillator(),destination=context.createMediaStreamDestination();
  tone.connect(destination);tone.start();
  const sender=new RTCPeerConnection(),receiver=new RTCPeerConnection();
  sender.onicecandidate=e=>{if(e.candidate)receiver.addIceCandidate(e.candidate);};
  receiver.onicecandidate=e=>{if(e.candidate)sender.addIceCandidate(e.candidate);};
  receiver.ontrack=e=>ui.attachRemoteStream(e.streams[0]);
  destination.stream.getTracks().forEach(track=>sender.addTrack(track,destination.stream));
  await sender.setLocalDescription(await sender.createOffer());await receiver.setRemoteDescription(sender.localDescription);
  await receiver.setLocalDescription(await receiver.createAnswer());await sender.setRemoteDescription(receiver.localDescription);
  let energy=0,playing=false;
  try{
   for(let i=0;i<50;i++){
    const stats=await receiver.getStats();stats.forEach(r=>{if(r.type==='inbound-rtp'&&r.kind==='audio')energy=r.totalAudioEnergy||0;});
    const audio=document.getElementById('remote-audio');const enable=document.getElementById('enable-call-audio');
    if(enable&&!enable.hidden)enable.click();
    playing=!!audio.srcObject&&!audio.paused&&!audio.muted&&audio.currentTime>0;
    if(energy>0&&playing)break;
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   return {energy,playing};
  }finally{sender.close();receiver.close();tone.stop();destination.stream.getTracks().forEach(t=>t.stop());await context.close();ui.detachStreams();ui.hideCallInterface();}
 });
 expect(result.energy).toBeGreaterThan(0);expect(result.playing).toBe(true);
});
