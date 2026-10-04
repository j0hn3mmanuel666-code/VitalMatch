import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

function browserClass(name, globals = {}) {
  const filename = { CallManager: 'callManager', WebRTCManager: 'webrtcManager', CallUI: 'callUI' }[name];
  return runInNewContext(readFileSync(new URL('../public/js/' + filename + '.js', import.meta.url), 'utf8') + '\n' + name, { console: { log() {}, error() {} }, Date, setTimeout, clearTimeout, ...globals });
}
function managerEnvironment() {
  const CallManager = browserClass('CallManager');
  const sent = [], rendered = [], stream = { synthetic: true };
  const signal = { isConnected: () => true, sendIceCandidate: (...args) => sent.push(['ice', ...args]), sendCallOffer: () => sent.push(['offer']), sendCallDecline: id => sent.push(['decline', id]), sendCallEnd: id => sent.push(['end', id]) };
  const rtc = { getLocalStream: async () => stream, createOffer: async () => ({}), closeConnection() {}, releaseLocalStream() {}, handleAnswer: async () => {}, addIceCandidate() {} };
  const ui = { attachLocalStream: value => rendered.push(['stream', value]), showCallInterface: () => rendered.push(['interface']), showCallingIndicator() {}, showError() {}, hideCallInterface() {}, hideIncomingCallNotification() {}, detachStreams() {}, showConnectedIndicator() {} };
  return { manager: new CallManager(1, signal, rtc, ui), signal, rtc, sent, rendered, stream };
}

test('early caller ICE is sent after the authoritative call ID arrives and local preview attaches after its interface', async () => {
  const env = managerEnvironment();
  await env.manager.initiateCall(2, 'video');
  env.rtc.onIceCandidate({ candidate: 'synthetic-candidate' });
  assert.equal(env.sent.some(item => item[0] === 'ice'), false);
  env.signal.onCallCreated({ callId: 9 });
  assert.equal(env.sent.find(item => item[0] === 'ice')[1], 9);
  assert.deepEqual(env.rendered.slice(-2).map(item => item[0]), ['interface', 'stream']);
  assert.equal(env.rendered.at(-1)[1], env.stream);
});

test('remote hangup and another-tab acceptance clean up locally without sending a second decline or hangup', () => {
  const env = managerEnvironment();
  env.manager.currentCallId = 9; env.manager.callState = 'ringing';
  env.signal.onAnsweredElsewhere({ callId: 9 });
  assert.equal(env.manager.callState, 'idle'); assert.equal(env.sent.length, 0);
  env.manager.currentCallId = 10; env.manager.callState = 'active';
  env.signal.onCallEnded({ callId: 9 }); assert.equal(env.manager.callState, 'active');
  env.signal.onCallEnded({ callId: 10 }); assert.equal(env.manager.callState, 'idle'); assert.equal(env.sent.length, 0);
});

test('remote ICE arriving before a description is applied after the answer and is cleared on close', async () => {
  const WebRTCManager = browserClass('WebRTCManager', { RTCIceCandidate: function (value) { Object.assign(this, value); }, RTCSessionDescription: function (value) { Object.assign(this, value); } });
  const rtc = new WebRTCManager({}), accepted = [];
  await rtc.addIceCandidate({ candidate: 'synthetic-candidate' });
  rtc.peerConnection = { remoteDescription: null, async setRemoteDescription(value) { this.remoteDescription = value; }, async addIceCandidate(value) { accepted.push(value); }, close() {} };
  await rtc.handleAnswer({ type: 'answer', sdp: 'synthetic' });
  assert.equal(accepted.length, 1); assert.equal(accepted[0].candidate, 'synthetic-candidate');
  rtc.pendingCandidates.push({ candidate: 'old' }); rtc.closeConnection(); assert.equal(rtc.pendingCandidates.length, 0);
});

test('incoming call names are text, and dynamic call dialogs use the shared focus lifecycle', () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  const registered = [], released = [];
  window.registerWorkspaceDialog = element => registered.push(element);
  window.releaseWorkspaceDialog = element => released.push(element);
  const CallUI = browserClass('CallUI', { document, window });
  const ui = new CallUI('unused', {});
  ui.showIncomingCallNotification('<img src=x onerror=bad()>', 'audio', 9);
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('h2').textContent, '<img src=x onerror=bad()>');
  assert.equal(registered.length, 1);
  assert.ok(registered[0].querySelector('[data-dialog-close="true"]'));
  ui.hideIncomingCallNotification(); assert.equal(released[0], registered[0]);
});
