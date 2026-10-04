/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Call Manager - Orchestrates the call lifecycle
*/

class CallManager {
  constructor(userId, signalingClient, webrtcManager, callUI) {
    this.userId = userId;
    this.signalingClient = signalingClient;
    this.webrtcManager = webrtcManager;
    this.callUI = callUI;
    
    // Call state
    this.callState = 'idle'; // idle, calling, ringing, active, ended
    this.currentCallId = null;
    this.currentCallType = null;
    this.isInitiator = false;
    this.otherUserId = null;
    this.callStartTime = null;
    this.autoDeclineTimeout = null;
    
    this.setupSignalingCallbacks();
    this.setupWebRTCCallbacks();
  }
  
  setupSignalingCallbacks() {
    this.pendingLocalCandidates = [];
    this.signalingClient.onCallCreated = (data) => {
      if (this.callState !== 'calling') return;
      this.currentCallId = data.callId;
      this.pendingLocalCandidates.splice(0).forEach(candidate => this.signalingClient.sendIceCandidate(this.currentCallId, candidate));
    };
    this.signalingClient.onAnsweredElsewhere = (data) => { if (this.currentCallId === data.callId) this.endCall(false); };
    this.signalingClient.onIncomingCall = (data) => this.handleIncomingCall(data);
    this.signalingClient.onCallAccepted = (data) => this.handleCallAccepted(data);
    this.signalingClient.onCallDeclined = (data) => this.handleCallDeclined(data);
    this.signalingClient.onCallEnded = (data) => this.handleCallEnded(data);
    this.signalingClient.onIceCandidate = (data) => this.handleIceCandidate(data);
    this.signalingClient.onError = (data) => this.handleError(data);
  }
  
  setupWebRTCCallbacks() {
    this.webrtcManager.onLocalStream = (stream) => {
      this.callUI.attachLocalStream(stream);
    };
    
    this.webrtcManager.onRemoteStream = (stream) => {
      this.callUI.attachRemoteStream(stream);
    };
    
    this.webrtcManager.onIceCandidate = (candidate) => {
      if (this.currentCallId) {
        this.signalingClient.sendIceCandidate(this.currentCallId, candidate);
      } else this.pendingLocalCandidates.push(candidate);
    };
    
    this.webrtcManager.onConnectionStateChange = (state) => {
      if (state === 'connected') {
        this.callState = 'active';
        if (!this.callStartTime) this.callStartTime = Date.now();
        this.callUI.showConnectedIndicator();
      } else if (state === 'failed' || state === 'disconnected') {
        this.callUI.showReconnectingIndicator();
      }
    };
  }
  
  // Initiate call
  async initiateCall(recipientId, callType) {
    if (!this.signalingClient.isConnected()) { this.callUI.showError('Calling is unavailable. Retry the connection or use messages.'); return; }
    if (this.callState !== 'idle') {
      console.error('Already in a call');
      return;
    }
    
    try {
      this.callState = 'calling';
      this.isInitiator = true;
      this.otherUserId = recipientId;
      this.currentCallType = callType;
      
      // Request media permissions
      const localStream = await this.webrtcManager.getLocalStream(true, callType === 'video');
      if (this.callState !== 'calling') { this.webrtcManager.releaseLocalStream(); return; }
      
      // Show calling UI
      this.callUI.showCallInterface(callType, true);
      this.callUI.attachLocalStream(localStream);
      this.callUI.showCallingIndicator();
      
      // Create offer
      const offer = await this.webrtcManager.createOffer(callType);
      
      // Send offer
      this.signalingClient.sendCallOffer(recipientId, offer, callType);
      
    } catch (error) {
      console.error('Error initiating call:', error);
      this.callUI.showError('Failed to start call. Please check your camera and microphone permissions.');
      this.endCall();
    }
  }
  
  // Handle incoming call
  async handleIncomingCall(data) {
    if (this.callState !== 'idle') {
      // Already in a call, auto-decline
      this.signalingClient.sendCallDecline(data.callId);
      return;
    }
    
    this.callState = 'ringing';
    this.currentCallId = data.callId;
    this.currentCallType = data.callType;
    this.isInitiator = false;
    this.otherUserId = data.caller.id;
    
    // Store offer for later
    this.pendingOffer = data.offer;
    
    // Show incoming call notification
    this.callUI.showIncomingCallNotification(data.caller.name || 'Unknown', data.callType, data.callId);
    
    // Auto-decline after 30 seconds
    this.autoDeclineTimeout = setTimeout(() => {
      if (this.callState === 'ringing') {
        this.declineCall(data.callId);
      }
    }, 30000);
  }
  
  // Accept call
  async acceptCall(callId) {
    if (this.callState !== 'ringing' || this.currentCallId !== callId) {
      return;
    }
    
    try {
      // Clear auto-decline timeout
      if (this.autoDeclineTimeout) {
        clearTimeout(this.autoDeclineTimeout);
        this.autoDeclineTimeout = null;
      }
      
      // Hide incoming call notification
      this.callUI.hideIncomingCallNotification();
      
      // Request media permissions
      const localStream = await this.webrtcManager.getLocalStream(true, this.currentCallType === 'video');
      if (this.callState !== 'ringing' || this.currentCallId !== callId) { this.webrtcManager.releaseLocalStream(); return; }
      
      // Show call interface
      this.callUI.showCallInterface(this.currentCallType, false);
      this.callUI.attachLocalStream(localStream);
      
      // Create answer
      const answer = await this.webrtcManager.createAnswer(this.pendingOffer, this.currentCallType);
      
      // Send answer
      this.signalingClient.sendCallAnswer(callId, answer);
      
      // Duration begins when the media connection succeeds.
      
    } catch (error) {
      console.error('Error accepting call:', error);
      this.callUI.showError('Failed to accept call. Please check your camera and microphone permissions.');
      this.declineCall(callId);
    }
  }
  
  // Decline call
  declineCall(callId) {
    if (this.autoDeclineTimeout) {
      clearTimeout(this.autoDeclineTimeout);
      this.autoDeclineTimeout = null;
    }
    
    this.callUI.hideIncomingCallNotification();
    this.signalingClient.sendCallDecline(callId);
    this.endCall(false);
  }
  
  // Handle call accepted
  async handleCallAccepted(data) {
    if (this.callState !== 'calling') {
      return;
    }
    
    try {
      this.currentCallId = data.callId;
      await this.webrtcManager.handleAnswer(data.answer);
      
      // Connection will transition to active via onConnectionStateChange
      
    } catch (error) {
      console.error('Error handling call accepted:', error);
      this.endCall();
    }
  }
  
  // Handle call declined
  handleCallDeclined(data) {
    if (data.callId !== this.currentCallId) return;
    this.callUI.showError('Call declined by the other user');
    this.endCall(false);
  }
  
  // Handle call ended
  handleCallEnded(data) {
    if (data.callId === this.currentCallId) this.endCall(false);
  }
  
  // Handle ICE candidate
  handleIceCandidate(data) {
    if (data.callId === this.currentCallId) {
      this.webrtcManager.addIceCandidate(data.candidate);
    }
  }
  
  // Handle error
  handleError(data) {
    this.callUI.showError(data.error);
    this.endCall();
  }
  
  // End call
  endCall(notify = true) {
    const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
    
    if (notify && this.currentCallId && this.callState !== 'idle') {
      this.signalingClient.sendCallEnd(this.currentCallId, duration);
    }
    
    // Clean up
    this.webrtcManager.closeConnection();
    this.callUI.hideCallInterface();
    this.callUI.hideIncomingCallNotification();
    this.callUI.detachStreams();
    
    if (this.autoDeclineTimeout) {
      clearTimeout(this.autoDeclineTimeout);
      this.autoDeclineTimeout = null;
    }
    
    // Reset state
    this.callState = 'idle';
    this.currentCallId = null;
    this.currentCallType = null;
    this.isInitiator = false;
    this.otherUserId = null;
    this.callStartTime = null;
    this.pendingLocalCandidates = [];
    this.pendingOffer = null;
  }
  
  // Toggle mute
  toggleMute() {
    const isMuted = this.webrtcManager.toggleMute();
    this.callUI.setMuteState(isMuted);
    return isMuted;
  }
  
  // Toggle video
  toggleVideo() {
    const isVideoEnabled = this.webrtcManager.toggleVideo();
    this.callUI.setVideoState(isVideoEnabled);
    return isVideoEnabled;
  }
  
  // Get call state
  getCallState() {
    return this.callState;
  }
  
  // Check if in call
  isInCall() {
    return this.callState !== 'idle';
  }
  
  // Get current call ID
  getCurrentCallId() {
    return this.currentCallId;
  }
}
