/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

export class RealTimeNotifications {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.userRooms = new Map(); // userId -> Set of room names
  }

  // Register user socket
  registerUser(userId, socketId) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socketId);
    console.log(`📱 User ${userId} registered with socket ${socketId}`);
  }

  // Unregister user socket
  unregisterUser(userId, socketId) {
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socketId);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }
    console.log(`📱 User ${userId} unregistered socket ${socketId}`);
  }

  // Join user to room
  joinRoom(userId, roomName, socketId) {
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId).add(roomName);
    
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(roomName);
      console.log(`🏠 User ${userId} joined room ${roomName}`);
    }
  }

  // Leave room
  leaveRoom(userId, roomName, socketId) {
    if (this.userRooms.has(userId)) {
      this.userRooms.get(userId).delete(roomName);
    }
    
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(roomName);
      console.log(`🏠 User ${userId} left room ${roomName}`);
    }
  }

  // Send notification to specific user
  sendToUser(userId, event, data) {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit(event, data);
        }
      });
      console.log(`📤 Sent ${event} to user ${userId}`);
      return true;
    }
    return false;
  }

  // Send notification to multiple users
  sendToUsers(userIds, event, data) {
    let sentCount = 0;
    userIds.forEach(userId => {
      if (this.sendToUser(userId, event, data)) {
        sentCount++;
      }
    });
    return sentCount;
  }

  // Send to room
  sendToRoom(roomName, event, data) {
    this.io.to(roomName).emit(event, data);
    console.log(`📤 Sent ${event} to room ${roomName}`);
  }

  // Broadcast to all users
  broadcast(event, data) {
    this.io.emit(event, data);
    console.log(`📢 Broadcasted ${event} to all users`);
  }

  // Get online users
  getOnlineUsers() {
    return Array.from(this.userSockets.keys());
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  // Get user's active rooms
  getUserRooms(userId) {
    return this.userRooms.get(userId) || new Set();
  }

  // Send emergency blood request notification
  sendEmergencyBloodRequest(bloodType, location, urgency, requestData) {
    const event = 'emergency:blood-request';
    const data = {
      id: requestData.id,
      bloodType,
      location,
      urgency,
      patientName: requestData.patientName,
      hospitalName: requestData.hospitalName,
      unitsNeeded: requestData.unitsNeeded,
      contactPhone: requestData.contactPhone,
      timestamp: new Date().toISOString()
    };

    // Send to all online users (they can filter based on their blood type/location)
    this.broadcast(event, data);

    // Send to location-specific room if exists
    const locationRoom = `location:${location.toLowerCase().replace(/\s+/g, '-')}`;
    this.sendToRoom(locationRoom, event, data);

    // Send to blood type specific room if exists
    const bloodTypeRoom = `blood-type:${bloodType}`;
    this.sendToRoom(bloodTypeRoom, event, data);

    console.log(`🚨 Emergency blood request broadcasted: ${bloodType} in ${location}`);
  }

  // Send blood request update
  sendBloodRequestUpdate(requestId, status, recipientIds) {
    const event = 'blood-request:update';
    const data = {
      requestId,
      status,
      timestamp: new Date().toISOString()
    };

    if (recipientIds && recipientIds.length > 0) {
      this.sendToUsers(recipientIds, event, data);
    } else {
      this.broadcast(event, data);
    }

    console.log(`📋 Blood request update sent: ${requestId} - ${status}`);
  }

  // Send donor availability update
  sendDonorAvailabilityUpdate(donorId, isAvailable, bloodType, location) {
    const event = 'donor:availability-update';
    const data = {
      donorId,
      isAvailable,
      bloodType,
      location,
      timestamp: new Date().toISOString()
    };

    // Send to blood type specific room
    const bloodTypeRoom = `blood-type:${bloodType}`;
    this.sendToRoom(bloodTypeRoom, event, data);

    // Send to location-specific room
    const locationRoom = `location:${location.toLowerCase().replace(/\s+/g, '-')}`;
    this.sendToRoom(locationRoom, event, data);

    console.log(`👤 Donor availability update: ${donorId} - ${isAvailable ? 'available' : 'unavailable'}`);
  }

  // Send message notification
  sendMessageNotification(recipientId, senderId, messageData) {
    const event = 'message:new';
    const data = {
      id: messageData.id,
      senderId,
      senderName: messageData.senderName,
      message: messageData.message,
      messageType: messageData.messageType,
      timestamp: messageData.timestamp,
      conversationId: messageData.conversationId
    };

    this.sendToUser(recipientId, event, data);
    console.log(`💬 Message notification sent to user ${recipientId}`);
  }

  // Send typing indicator
  sendTypingIndicator(recipientId, senderId, isTyping) {
    const event = 'message:typing';
    const data = {
      senderId,
      isTyping,
      timestamp: new Date().toISOString()
    };

    this.sendToUser(recipientId, event, data);
  }

  // Send system notification
  sendSystemNotification(userId, type, title, message, actionUrl = null) {
    const event = 'system:notification';
    const data = {
      type, // 'info', 'warning', 'error', 'success'
      title,
      message,
      actionUrl,
      timestamp: new Date().toISOString()
    };

    if (userId) {
      this.sendToUser(userId, event, data);
    } else {
      this.broadcast(event, data);
    }

    console.log(`🔔 System notification sent: ${type} - ${title}`);
  }

  // Send call notification
  sendCallNotification(recipientId, callerId, callType, callData) {
    const event = 'call:notification';
    const data = {
      callId: callData.id,
      callerId,
      callerName: callData.callerName,
      callType,
      timestamp: new Date().toISOString()
    };

    this.sendToUser(recipientId, event, data);
    console.log(`📞 Call notification sent to user ${recipientId}`);
  }

  // Send presence update
  sendPresenceUpdate(userId, status, lastSeen = null) {
    const event = 'presence:update';
    const data = {
      userId,
      status, // 'online', 'offline', 'away', 'busy'
      lastSeen: lastSeen || new Date().toISOString()
    };

    // Send to all users who might be interested (contacts, active conversations)
    this.broadcast(event, data);
    console.log(`👤 Presence update: ${userId} - ${status}`);
  }

  // Send location-based updates
  sendLocationUpdate(location, event, data) {
    const locationRoom = `location:${location.toLowerCase().replace(/\s+/g, '-')}`;
    this.sendToRoom(locationRoom, event, {
      ...data,
      location,
      timestamp: new Date().toISOString()
    });
  }

  // Send admin notification
  sendAdminNotification(type, title, message, data = {}) {
    const event = 'admin:notification';
    const notificationData = {
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    // Send to admin room
    this.sendToRoom('admin', event, notificationData);
    console.log(`👑 Admin notification sent: ${type} - ${title}`);
  }

  // Get connection statistics
  getStats() {
    const totalConnections = this.io.sockets.sockets.size;
    const uniqueUsers = this.userSockets.size;
    const totalRooms = this.io.sockets.adapter.rooms.size;

    return {
      totalConnections,
      uniqueUsers,
      totalRooms,
      onlineUsers: this.getOnlineUsers(),
      timestamp: new Date().toISOString()
    };
  }
}