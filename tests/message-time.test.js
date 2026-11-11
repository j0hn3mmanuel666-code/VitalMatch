import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatMessageTime,messageTimeAgo} from '../services/messageTime.js';
test('message time uses Manila across the UTC date boundary',()=>{
 assert.equal(formatMessageTime('2026-11-05T17:45:00Z','Asia/Manila'),'01:45 AM');
 assert.equal(formatMessageTime('2026-11-05T17:45:00Z','UTC'),'05:45 PM');
});
test('relative labels advance and old dates respect the workspace zone',()=>{
 const sent=Date.parse('2026-11-05T17:45:00Z');
 assert.equal(messageTimeAgo(sent,sent+59000,'Asia/Manila'),'Just now');
 assert.equal(messageTimeAgo(sent,sent+60000,'Asia/Manila'),'1m ago');
 assert.equal(messageTimeAgo(sent,sent+3600000,'Asia/Manila'),'1h ago');
 assert.equal(messageTimeAgo(sent,sent-5000,'Asia/Manila'),'Just now');
 assert.equal(messageTimeAgo(sent,sent+8*86400000,'Asia/Manila'),new Date(sent).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'}));
});
