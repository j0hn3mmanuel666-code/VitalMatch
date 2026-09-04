/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import callHistoryService from "./callHistoryService.js";

export class SignalingServer {
  constructor(io, sessionMiddleware) {
    this.io = io;
    this.sessionMiddleware = sessionMiddleware;
    this.activeUsers = new Map(); // userId -> socketId
    this.activeCalls = new Map(); // callId -> { callerId, calleeId, callType }
  }
  
  initialize() {
    // Wrap session middleware for Socket.io
    this.io.use((socket, next) => {
      this.sessionMiddleware(socket.request, {}, next);
    });
    
    // Authentication middleware
    this.io.use((socket, next) => {
      const session = socket.request.session;
      console.log(`Socket connection attempt. Session: ${!!session}, userId: ${session ? session.userId : 'none'}`);
      if (session && session.userId) {
        socket.userId = session.userId;
        next();
      } else {
        next(new Error('Authentication error'));
      }
    });
    
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    
    console.log('📞 Signaling server initialized');
  }
  
  handleConnection(socket) {
    const userId = socket.userId;
    console.log(`✅ User ${userId} connected to signaling server`);
    
    // Store active user
    this.activeUsers.set(userId, socket.id);
    
    // Handle call offer
    socket.on('call:offer', (data) => this.handleCallOffer(socket, data));
    
    // Handle call answer
    socket.on('call:answer', (data) => this.handleCallAnswer(socket, data));
    
    // Handle ICE candidate
    socket.on('call:ice-candidate', (data) => this.handleIceCandidate(socket, data));
    
    // Handle call decline
    socket.on('call:decline', (data) => this.handleCallDecline(socket, data));
    
    // Handle call end
    socket.on('call:end', (data) => this.handleCallEnd(socket, data));
    
    // Handle disconnection
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }
  
  async handleCallOffer(socket, data) {
    try {
      const { recipientId, offer, callType } = data;
      const callerId = socket.userId;
      
      console.log(`📞 Call offer from ${callerId} to ${recipientId} (${callType})`);
      
      // Check if recipient is online
      if (!this.isUserOnline(recipientId)) {
        socket.emit('call:error', {
          code: 'RECIPIENT_OFFLINE',
          error: 'The user you are trying to call is currently offline'
        });
        return;
      }
      
      // Check for simultaneous calls
      const existingCall = Array.from(this.activeCalls.values()).find(
        call => (call.callerId === recipientId && call.calleeId === callerId)
      );
      
      if (existingCall) {
        // Auto-connect simultaneous calls
        console.log(`🔄 Simultaneous call detected, auto-connecting`);
        // Let the existing call proceed
        return;
      }
      
      // Create call record
      const callId = await callHistoryService.createCallRecord(callerId, recipientId, callType);
      
      // Store active call
      this.activeCalls.set(callId, { callerId, calleeId: recipientId, callType });
      
      // Forward offer to recipient
      this.broadcastToUser(recipientId, 'call:incoming', {
        callId,
        caller: {
          id: callerId
        },
        callType,
        offer
      });
      
    } catch (error) {
      console.error('Error handling call offer:', error);
      socket.emit('call:error', {
        code: 'SIGNALING_FAILED',
        error: 'Failed to initiate call'
      });
    }
  }
  
  async handleCallAnswer(socket, data) {
    try {
      const { callId, answer } = data;
      const calleeId = socket.userId;
      
      console.log(`✅ Call ${callId} answered by ${calleeId}`);
      
      const call = this.activeCalls.get(callId);
      if (!call) {
        socket.emit('call:error', {
          code: 'CALL_NOT_FOUND',
          error: 'Call not found'
        });
        return;
      }
      
      // Forward answer to caller
      this.broadcastToUser(call.callerId, 'call:accepted', {
        callId,
        answer
      });
      
    } catch (error) {
      console.error('Error handling call answer:', error);
    }
  }
  
  handleIceCandidate(socket, data) {
    try {
      const { callId, candidate } = data;
      const userId = socket.userId;
      
      const call = this.activeCalls.get(callId);
      if (!call) return;
      
      // Forward ICE candidate to the other party
      const recipientId = call.callerId === userId ? call.calleeId : call.callerId;
      this.broadcastToUser(recipientId, 'call:ice-candidate', {
        callId,
        candidate
      });
      
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }
  
  async handleCallDecline(socket, data) {
    try {
      const { callId } = data;
      const calleeId = socket.userId;
      
      console.log(`❌ Call ${callId} declined by ${calleeId}`);
      
      const call = this.activeCalls.get(callId);
      if (!call) return;
      
      // Update call record
      await callHistoryService.updateCallOutcome(callId, 'declined');
      
      // Notify caller
      this.broadcastToUser(call.callerId, 'call:declined', {
        callId,
        reason: 'user_declined'
      });
      
      // Remove from active calls
      this.activeCalls.delete(callId);
      
    } catch (error) {
      console.error('Error handling call decline:', error);
    }
  }
  
  async handleCallEnd(socket, data) {
    try {
      const { callId, duration } = data;
      const userId = socket.userId;
      
      console.log(`📴 Call ${callId} ended by ${userId}`);
      
      const call = this.activeCalls.get(callId);
      if (!call) return;
      
      // Update call record
      await callHistoryService.updateCallOutcome(callId, 'completed', duration);
      
      // Notify other party
      const recipientId = call.callerId === userId ? call.calleeId : call.callerId;
      this.broadcastToUser(recipientId, 'call:ended', {
        callId,
        reason: 'other_party_ended'
      });
      
      // Remove from active calls
      this.activeCalls.delete(callId);
      
    } catch (error) {
      console.error('Error handling call end:', error);
    }
  }
  
  handleDisconnect(socket) {
    const userId = socket.userId;
    console.log(`❌ User ${userId} disconnected from signaling server`);
    
    // Remove from active users
    this.activeUsers.delete(userId);
    
    // End any active calls
    for (const [callId, call] of this.activeCalls.entries()) {
      if (call.callerId === userId || call.calleeId === userId) {
        const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
        this.broadcastToUser(otherUserId, 'call:ended', {
          callId,
          reason: 'connection_failed'
        });
        this.activeCalls.delete(callId);
      }
    }
  }
  
  getUserSocket(userId) {
    const socketId = this.activeUsers.get(userId);
    if (!socketId) return null;
    return this.io.sockets.sockets.get(socketId);
  }
  
  isUserOnline(userId) {
    return this.activeUsers.has(userId);
  }
  
  broadcastToUser(userId, event, data) {
    const socket = this.getUserSocket(userId);
    if (socket) {
      socket.emit(event, data);
    }
  }
}
