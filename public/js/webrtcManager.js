/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

WebRTC Manager - Handles peer-to-peer audio/video connections
*/

class WebRTCManager {
  constructor(signalingClient) {
    this.signalingClient = signalingClient;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // ICE servers configuration
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
    
    // Callbacks
    this.onLocalStream = null;
    this.onRemoteStream = null;
    this.onIceCandidate = null;
    this.onConnectionStateChange = null;
    this.onError = null;
  }
  
  // Request media permissions
  async requestMediaPermissions(audio, video) {
    try {
      const constraints = {
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false,
        video: video ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user'
        } : false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error('Permission denied:', error);
      throw error;
    }
  }
  
  // Get local media stream
  async getLocalStream(audio, video) {
    try {
      this.localStream = await this.requestMediaPermissions(audio, video);
      console.log('✅ Local stream obtained:', {
        audio: this.localStream.getAudioTracks().length > 0,
        video: this.localStream.getVideoTracks().length > 0
      });
      
      // Log track details
      this.localStream.getTracks().forEach(track => {
        console.log(`📹 Local ${track.kind} track:`, {
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        });
      });
      
      if (this.onLocalStream) {
        this.onLocalStream(this.localStream);
      }
      return this.localStream;
    } catch (error) {
      console.error('❌ Error getting local stream:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }
  
  // Create peer connection
  createPeerConnection() {
    const config = {
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };
    
    this.peerConnection = new RTCPeerConnection(config);
    
    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }
    
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };
    
  // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('📹 Received remote track:', event.track.kind);
      console.log('📹 Track readyState:', event.track.readyState);
      console.log('📹 Track enabled:', event.track.enabled);
      
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        console.log('📹 Created new remote stream');
      }
      
      // Add track to remote stream
      this.remoteStream.addTrack(event.track);
      console.log('✅ Remote stream tracks:', this.remoteStream.getTracks().length);
      
      // Notify callback immediately when we have tracks
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
      
      // Log track events
      event.track.onended = () => {
        console.log('📹 Remote track ended:', event.track.kind);
      };
      
      event.track.onmute = () => {
        console.log('📹 Remote track muted:', event.track.kind);
      };
      
      event.track.onunmute = () => {
        console.log('📹 Remote track unmuted:', event.track.kind);
      };
    };
    
    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };
    
    return this.peerConnection;
  }
  
  // Create offer
  async createOffer(callType) {
    try {
      if (!this.peerConnection) {
        this.createPeerConnection();
      }
      
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video'
      });
      
      await this.peerConnection.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }
  
  // Create answer
  async createAnswer(offer, callType) {
    try {
      if (!this.peerConnection) {
        this.createPeerConnection();
      }
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      return answer;
    } catch (error) {
      console.error('Error creating answer:', error);
      throw error;
    }
  }
  
  // Handle answer
  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
      throw error;
    }
  }
  
  // Add ICE candidate
  async addIceCandidate(candidate) {
    try {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
  
  // Toggle mute
  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // Return muted state
      }
    }
    return false;
  }
  
  // Toggle video
  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled; // Return video enabled state
      }
    }
    return false;
  }
  
  // Switch camera (mobile)
  async switchCamera() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        const currentFacingMode = videoTrack.getSettings().facingMode;
        const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        
        // Stop current track
        videoTrack.stop();
        
        // Get new stream with different camera
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode }
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Replace track in peer connection
        const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
        
        // Update local stream
        this.localStream.removeTrack(videoTrack);
        this.localStream.addTrack(newVideoTrack);
        
        if (this.onLocalStream) {
          this.onLocalStream(this.localStream);
        }
      }
    }
  }
  
  // Get connection state
  getConnectionState() {
    return this.peerConnection ? this.peerConnection.connectionState : 'closed';
  }
  
  // Get network quality (simplified)
  async getNetworkQuality() {
    if (!this.peerConnection) return 'unknown';
    
    try {
      const stats = await this.peerConnection.getStats();
      let quality = 'good';
      
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const rtt = report.currentRoundTripTime;
          if (rtt > 0.3) quality = 'poor';
          else if (rtt > 0.15) quality = 'fair';
        }
      });
      
      return quality;
    } catch (error) {
      return 'unknown';
    }
  }
  
  // Release local stream
  releaseLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
  
  // Close connection
  closeConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.releaseLocalStream();
    
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
  }
}
