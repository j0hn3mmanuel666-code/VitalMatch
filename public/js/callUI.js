/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Call UI - Manages the visual interface for calls
*/

class CallUI {
  constructor(containerId, callManager) {
    this.container = document.getElementById(containerId);
    this.callManager = callManager;
    this.callDurationInterval = null;
  }
  
  // Show incoming call notification
  showIncomingCallNotification(callerName, callType, callId) {
    const notification = document.createElement('div');
    notification.id = 'incoming-call-notification';
    notification.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
    notification.innerHTML = `
      <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center">
        <div class="mb-6">
          <div class="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">
            ${callerName.charAt(0).toUpperCase()}
          </div>
          <h2 class="text-2xl font-bold text-gray-800 mb-2">${callerName}</h2>
          <p class="text-gray-600">Incoming ${callType} call...</p>
        </div>
        <div class="flex space-x-4">
          <button onclick="window.callManager.declineCall(${callId})" class="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition">
            <svg class="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Decline
          </button>
          <button onclick="window.callManager.acceptCall(${callId})" class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition">
            <svg class="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            Accept
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(notification);
  }
  
  // Hide incoming call notification
  hideIncomingCallNotification() {
    const notification = document.getElementById('incoming-call-notification');
    if (notification) {
      notification.remove();
    }
  }
  
  // Show call interface
  showCallInterface(callType, isInitiator) {
    const callInterface = document.createElement('div');
    callInterface.id = 'call-interface';
    callInterface.className = 'fixed inset-0 bg-gray-900 flex flex-col';
    callInterface.style.zIndex = '9999';
    callInterface.innerHTML = `
      <!-- Video Display -->
      <div class="flex-1 relative bg-gray-900">
        ${callType === 'video' ? `
          <video id="remote-video" autoplay playsinline class="w-full h-full object-cover bg-black"></video>
          <video id="local-video" autoplay playsinline muted class="absolute bottom-24 right-4 w-48 h-36 object-cover rounded-lg shadow-lg bg-gray-800"></video>
        ` : `
          <div class="w-full h-full flex items-center justify-center">
            <div class="text-center">
              <div class="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-5xl mx-auto mb-4">
                U
              </div>
              <p id="call-status" class="text-white text-xl mb-2">Calling...</p>
              <p id="call-duration" class="text-gray-400 text-lg">00:00</p>
            </div>
          </div>
        `}
      </div>
      
      <!-- Call Controls -->
      <div class="bg-gray-800 p-6" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 10000;">
        <div class="flex justify-center space-x-4">
          <button id="mute-btn" onclick="window.callManager.toggleMute()" class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 transition shadow-lg">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
          </button>
          
          ${callType === 'video' ? `
            <button id="video-btn" onclick="window.callManager.toggleVideo()" class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 transition shadow-lg">
              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
          ` : ''}
          
          <button onclick="window.callManager.endCall()" class="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition shadow-lg">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(callInterface);
    
    // Start call duration timer
    this.startCallDurationTimer();
  }
  
  // Hide call interface
  hideCallInterface() {
    const callInterface = document.getElementById('call-interface');
    if (callInterface) {
      callInterface.remove();
    }
    
    if (this.callDurationInterval) {
      clearInterval(this.callDurationInterval);
      this.callDurationInterval = null;
    }
  }
  
  // Attach local stream
  attachLocalStream(stream) {
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.srcObject = stream;
      localVideo.onloadedmetadata = () => {
        localVideo.play().catch(e => console.error('Error playing local video:', e));
      };
      console.log('✅ Local video attached');
    } else {
      console.error('❌ Local video element not found');
    }
  }
  
  // Attach remote stream
  attachRemoteStream(stream) {
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
      remoteVideo.srcObject = stream;
      remoteVideo.onloadedmetadata = () => {
        remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
      };
      console.log('✅ Remote video attached');
    } else {
      console.error('❌ Remote video element not found');
    }
  }
  
  // Detach streams
  detachStreams() {
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
  }
  
  // Show calling indicator
  showCallingIndicator() {
    const status = document.getElementById('call-status');
    if (status) {
      status.textContent = 'Calling...';
    }
  }
  
  // Show connected indicator
  showConnectedIndicator() {
    const status = document.getElementById('call-status');
    if (status) {
      status.textContent = 'Connected';
    }
  }
  
  // Show reconnecting indicator
  showReconnectingIndicator() {
    const status = document.getElementById('call-status');
    if (status) {
      status.textContent = 'Reconnecting...';
    }
  }
  
  // Set mute state
  setMuteState(isMuted) {
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      if (isMuted) {
        muteBtn.classList.add('bg-red-600');
        muteBtn.classList.remove('bg-gray-700');
      } else {
        muteBtn.classList.remove('bg-red-600');
        muteBtn.classList.add('bg-gray-700');
      }
    }
  }
  
  // Set video state
  setVideoState(isVideoEnabled) {
    const videoBtn = document.getElementById('video-btn');
    if (videoBtn) {
      if (!isVideoEnabled) {
        videoBtn.classList.add('bg-red-600');
        videoBtn.classList.remove('bg-gray-700');
      } else {
        videoBtn.classList.remove('bg-red-600');
        videoBtn.classList.add('bg-gray-700');
      }
    }
  }
  
  // Start call duration timer
  startCallDurationTimer() {
    let seconds = 0;
    this.callDurationInterval = setInterval(() => {
      seconds++;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const durationText = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      
      const durationEl = document.getElementById('call-duration');
      if (durationEl) {
        durationEl.textContent = durationText;
      }
    }, 1000);
  }
  
  // Show error
  showError(message) {
    alert(message); // Simple for now, can be improved with better UI
  }
}
