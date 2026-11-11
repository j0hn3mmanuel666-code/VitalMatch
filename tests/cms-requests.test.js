import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../views/admin-public-cms.xian',import.meta.url),'utf8');
function helper(fetch) {
 const code=source.match(/async function cmsFetch\([\s\S]*?\r?\n}\r?\n/);
 assert.ok(code,'CMS mutations need a shared authenticated request helper');
 return runInNewContext(code[0]+'\ncmsFetch',{fetch,window:{getCsrfToken:()=> 'synthetic-token'}});
}
test('CMS JSON and image mutations send the session token without forcing multipart content type',async()=>{
 const seen=[];const response={ok:true};const request=helper(async(url,options)=>{seen.push(options);return response;});
 assert.equal(await request('/api/admin/public-content',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),response);
 await request('/api/admin/upload-image',{method:'POST',body:'synthetic multipart'});
 assert.equal(seen[0].headers['X-CSRF-Token'],'synthetic-token');assert.equal(seen[0].headers['Content-Type'],'application/json');
 assert.equal(seen[1].headers['Content-Type'],undefined);assert.equal(seen[1].headers['X-CSRF-Token'],'synthetic-token');assert.equal(seen[1].credentials,'same-origin');
});
test('CMS shows actionable session and server errors instead of a JSON parsing failure',async()=>{
 await assert.rejects(helper(async()=>({ok:false,status:403,json:async()=>({error:'CSRF token mismatch'})}))('/api',{method:'POST'}),/session expired/i);
 await assert.rejects(helper(async()=>({ok:false,status:502,json:async()=>{throw Error('HTML')}}))('/api',{method:'POST'}),/unavailable.*retained/i);
});
