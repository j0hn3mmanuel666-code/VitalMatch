/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Signaling Client - Handles Socket.io communication for call signaling
*/

class SignalingClient {
  constructor(userId) {
    this.userId = userId;
    this.socket = null;
    this.connected = false;
    
    // Callbacks
    this.onIncomingCall = null;
    this.onCallAccepted = null;
    this.onCallDeclined = null;
    this.onCallEnded = null;
    this.onIceCandidate = null;
    this.onAnswer = null;
    this.onError = null;
  }
  
  // Connect to Socket.io server
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io();
        
        this.socket.on('connect', () => {
          console.log('✅ Connected to signaling server');
          this.connected = true;
          this.setupEventListeners();
          resolve();
        });
        
        this.socket.on('connect_error', (error) => {
          console.error('❌ Connection error:', error);
          this.connected = false;
          reject(error);
        });
        
        this.socket.on('disconnect', () => {
          console.log('❌ Disconnected from signaling server');
          this.connected = false;
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Set up event listeners
  setupEventListeners() {
    // Incoming call
    this.socket.on('call:incoming', (data) => {
      console.log('📞 Incoming call:', data);
      if (this.onIncomingCall) {
        this.onIncomingCall(data);
      }
    });
    
    // Call accepted
    this.socket.on('call:accepted', (data) => {
      console.log('✅ Call accepted:', data);
      if (this.onCallAccepted) {
        this.onCallAccepted(data);
      }
    });
    
    // Call declined
    this.socket.on('call:declined', (data) => {
      console.log('❌ Call declined:', data);
      if (this.onCallDeclined) {
        this.onCallDeclined(data);
      }
    });
    
    // Call ended
    this.socket.on('call:ended', (data) => {
      console.log('📴 Call ended:', data);
      if (this.onCallEnded) {
        this.onCallEnded(data);
      }
    });
    
    // ICE candidate
    this.socket.on('call:ice-candidate', (data) => {
      if (this.onIceCandidate) {
        this.onIceCandidate(data);
      }
    });
    
    // Error
    this.socket.on('call:error', (data) => {
      console.error('❌ Call error:', data);
      if (this.onError) {
        this.onError(data);
      }
    });
  }
  
  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
  
  // Check if connected
  isConnected() {
    return this.connected;
  }
  
  // Send call offer
  sendCallOffer(recipientId, offer, callType) {
    if (!this.connected) {
      console.error('Not connected to signaling server');
      return;
    }
    
    this.socket.emit('call:offer', {
      recipientId,
      offer,
      callType
    });
  }
  
  // Send call answer
  sendCallAnswer(callId, answer) {
    if (!this.connected) {
      console.error('Not connected to signaling server');
      return;
    }
    
    this.socket.emit('call:answer', {
      callId,
      answer
    });
  }
  
  // Send ICE candidate
  sendIceCandidate(callId, candidate) {
    if (!this.connected) {
      console.error('Not connected to signaling server');
      return;
    }
    
    this.socket.emit('call:ice-candidate', {
      callId,
      candidate
    });
  }
  
  // Send call decline
  sendCallDecline(callId) {
    if (!this.connected) {
      console.error('Not connected to signaling server');
      return;
    }
    
    this.socket.emit('call:decline', {
      callId
    });
  }
  
  // Send call end
  sendCallEnd(callId, duration) {
    if (!this.connected) {
      console.error('Not connected to signaling server');
      return;
    }
    
    this.socket.emit('call:end', {
      callId,
      duration
    });
  }
}
