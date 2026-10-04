(function () {
  'use strict';
  var user = document.getElementById('workspace-call-user');
  if (!user || window.callManager || typeof SignalingClient === 'undefined') return;
  var userId = Number(user.dataset.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  var signaling = new SignalingClient(userId), rtc = new WebRTCManager(signaling), ui = new CallUI('call-container', null);
  window.callManager = new CallManager(userId, signaling, rtc, ui); ui.callManager = window.callManager;
  var status = document.getElementById('callAvailability');
  var connected = false, failed = false, configured = false, relay = false, configFailed = false;
  function renderStatus() {
    if (!status) return;
    status.textContent = failed ? 'Calling is unavailable. Text messages remain available; reload to retry.' :
      !connected ? 'Connecting calling service...' :
      configFailed ? 'Calling connected, but relay configuration is unavailable. Some networks may not connect; use messages if a call fails.' :
      !configured ? 'Calling connected. Checking network fallback...' :
      !relay ? 'Calling connected without a relay fallback. Some hospital or mobile networks may not connect; use messages if a call fails.' :
      'Calling connected with a relay fallback. Keep VitalMatch open to receive calls.';
  }
  signaling.onConnectionChange = function (available) { connected = available; failed = !available; renderStatus(); };
  renderStatus();
  signaling.connect().then(function () { connected = true; renderStatus(); }).catch(function () { failed = true; renderStatus(); });
  fetch('/api/calls/config').then(function (response) { if (!response.ok) throw new Error('Call configuration unavailable'); return response.json(); }).then(function (config) {
    if (Array.isArray(config.iceServers) && config.iceServers.length) rtc.iceServers = config.iceServers;
    configured = true; relay = !!config.relayConfigured; renderStatus();
  }).catch(function () { configFailed = true; renderStatus(); });
  window.addEventListener('pagehide', function () { window.callManager.endCall(); signaling.disconnect(); });
})();
