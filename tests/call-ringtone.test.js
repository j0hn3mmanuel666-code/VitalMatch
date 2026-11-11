import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
const code=readFileSync(new URL('../public/js/call-ringtone.js',import.meta.url),'utf8');
function environment(resume){
 const listeners=new Map(),timers=new Map(),voices=[],blocked=[];let next=0;
 const document={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 class AudioContext {
  constructor(){this.state='suspended';this.currentTime=1;this.destination={};}
  resume(){return resume?resume(this):Promise.resolve(this.state='running');}
  createGain(){return {connect(){},gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}}};}
  createOscillator(){const voice={frequency:{},connect(){},disconnect(){},start(){this.started=true;},stop(when){if(when===undefined)this.stopped=true;}};voices.push(voice);return voice;}
 }
 const window={AudioContext,addEventListener:(k,f)=>listeners.set(k,f)};
 const Ringtone=runInNewContext(code+'\nCallRingtone',{window,document,Set,setInterval:(f,ms)=>{timers.set(++next,{f,ms});return next;},clearInterval:id=>timers.delete(id)});
 const ring=new Ringtone(v=>blocked.push(v));return {ring,listeners,timers,voices,blocked};
}
test('a user gesture primes sound silently, incoming calls repeat a tone and stop cleanly',async()=>{
 const e=environment();await e.listeners.get('pointerdown')();assert.equal(e.voices.length,0);
 await e.ring.start();assert.equal(e.voices.length,2);assert.deepEqual(e.voices.map(v=>v.frequency.value),[440,480]);
 assert.equal(e.timers.size,1);assert.equal([...e.timers.values()][0].ms,3000);
 [...e.timers.values()][0].f();assert.equal(e.voices.length,4);
 e.ring.stop();assert.equal(e.timers.size,0);assert.equal(e.ring.voices.size,0);assert.equal(e.ring.output.gain.value,0);assert.ok(e.voices.every(v=>v.stopped));
});
test('blocked mobile sound exposes a tap fallback and a late unlock cannot restart a cancelled ring',async()=>{
 let release;const e=environment(context=>new Promise(resolve=>{release=()=>{context.state='running';resolve();};}));
 const pending=e.ring.start();assert.equal(e.blocked.at(-1),true);assert.equal(e.voices.length,0);
 e.ring.stop();release();await pending;assert.equal(e.voices.length,0);assert.equal(e.timers.size,0);
});
test('failed resume can be retried and page exit stops ringing',async()=>{
 let allowed=false;const e=environment(context=>{if(!allowed)return Promise.reject(Error('blocked'));context.state='running';return Promise.resolve();});
 assert.equal(await e.ring.start(),false);assert.equal(e.blocked.at(-1),true);
 allowed=true;assert.equal(await e.ring.start(),true);assert.equal(e.voices.length,2);
 e.listeners.get('pagehide')();assert.equal(e.ring.ringing,false);assert.equal(e.timers.size,0);
});
test('incoming-call UI starts the ringtone and stops it when dismissed',()=>{
 const {document,window}=parseHTML('<html><body></body></html>');let starts=0,stops=0;
 class Ringtone{start(){starts++;}stop(){stops++;}}
 const UI=runInNewContext(readFileSync(new URL('../public/js/callUI.js',import.meta.url),'utf8')+'\nCallUI',{document,window,CallRingtone:Ringtone});
 const ui=new UI('none',{});ui.showIncomingCallNotification('Sample caller','audio',7);assert.equal(starts,1);
 ui.hideIncomingCallNotification();assert.equal(stops,1);assert.equal(document.getElementById('incoming-call-notification'),null);
});
