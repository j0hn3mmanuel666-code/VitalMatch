/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { Message, sequelize } from "../models/messageModel.js";
import { User } from "../models/userModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { Op } from "sequelize";
import multer from "multer";
import path from "path";
import fs from "fs";

await sequelize.sync();

// Helper function to create conversation ID
function createConversationId(userId1, userId2) {
  const ids = [userId1, userId2].sort((a, b) => a - b);
  return `${ids[0]}-${ids[1]}`;
}

// Helper function to format time ago
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

// Messages page
export const messagesPage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const currentUserId = req.session.userId;
    const selectedUserId = req.query.userId ? parseInt(req.query.userId) : null;

    // Get current user info
    const currentUser = await User.findByPk(currentUserId);
    const userName = `${currentUser.firstName} ${currentUser.lastName}`;
    const userInitial = currentUser.firstName.charAt(0).toUpperCase();

    // Get all conversations for current user
    const allMessages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId },
          { receiverId: currentUserId }
        ]
      },
      order: [['createdAt', 'DESC']]
    });

    // Group messages by conversation
    const conversationsMap = new Map();

    for (const msg of allMessages) {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;

      if (!conversationsMap.has(otherUserId)) {
        const otherUser = await User.findByPk(otherUserId);

        // Skip if user doesn't exist
        if (!otherUser) {
          continue;
        }

        const unreadCount = await Message.count({
          where: {
            senderId: otherUserId,
            receiverId: currentUserId,
            isRead: false
          }
        });

        conversationsMap.set(otherUserId, {
          otherUserId,
          otherUserName: `${otherUser.firstName} ${otherUser.lastName}`,
          otherUserInitial: otherUser.firstName.charAt(0).toUpperCase(),
          lastMessage: msg.message,
          timeAgo: timeAgo(msg.createdAt),
          unreadCount,
          isActive: selectedUserId === otherUserId
        });
      }
    }

    const conversations = Array.from(conversationsMap.values());

    // Get total unread count
    const unreadCount = await Message.count({
      where: {
        receiverId: currentUserId,
        isRead: false
      }
    });

    // If a user is selected, get messages for that conversation
    let selectedUser = null;
    let messages = [];

    if (selectedUserId) {
      const otherUser = await User.findByPk(selectedUserId);

      if (otherUser) {
        selectedUser = {
          selectedUserId,
          selectedUserName: `${otherUser.firstName} ${otherUser.lastName}`,
          selectedUserInitial: otherUser.firstName.charAt(0).toUpperCase()
        };

        const conversationId = createConversationId(currentUserId, selectedUserId);

        const conversationMessages = await Message.findAll({
          where: { conversationId },
          order: [['createdAt', 'ASC']]
        });

        messages = conversationMessages.map(msg => ({
          message: msg.message,
          messageType: msg.messageType,
          audioFilePath: msg.audioFilePath,
          audioDuration: msg.audioDuration,
          waveformData: msg.waveformData,
          isSender: msg.senderId === currentUserId,
          timestamp: new Date(msg.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          })
        }));

        // Mark messages as read
        await Message.update(
          { isRead: true },
          {
            where: {
              senderId: selectedUserId,
              receiverId: currentUserId,
              isRead: false
            }
          }
        );
      }
    }

    res.render("messages", {
      title: "Messages",
      userName,
      userInitial,
      currentUserId,
      conversations,
      unreadCount,
      selectedUser: selectedUser ? selectedUser : null,
      messages,
      isAdmin: req.session.userRole === 'admin'
    });

  } catch (error) {
    console.error("Error loading messages:", error);
    res.render("messages", {
      title: "Messages",
      userName: "User",
      userInitial: "U",
      conversations: [],
      unreadCount: 0,
      selectedUser: null,
      messages: [],
      isAdmin: req.session.userRole === 'admin'
    });
  }
};

// Send message
export const sendMessage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const { recipientId, message } = req.body;
    const senderId = req.session.userId;

    console.log(`📤 Sending message from ${senderId} to ${recipientId}`);

    const conversationId = createConversationId(senderId, parseInt(recipientId));

    await Message.create({
      senderId,
      receiverId: parseInt(recipientId),
      message,
      conversationId,
      isRead: false
    });

    console.log(`✅ Message sent successfully`);

    // Redirect back to the conversation
    res.redirect(`/messages?userId=${recipientId}`);

  } catch (error) {
    console.error("Error sending message:", error);
    res.redirect("/messages");
  }
};

// Contact donor - Admin initiates conversation with automatic message
export const contactDonor = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const { requestId, donorUserId } = req.params;
    const adminUserId = req.session.userId;

    console.log(`🔍 Contact Donor - RequestID: ${requestId}, DonorUserID: ${donorUserId}, AdminID: ${adminUserId}`);

    // Get blood request details
    const bloodRequest = await BloodRequest.findByPk(requestId);
    if (!bloodRequest) {
      console.log("❌ Blood request not found");
      return res.redirect("/admin/requests");
    }

    console.log(`📋 Found blood request: ${bloodRequest.patientName} - ${bloodRequest.bloodType}`);

    // Get donor details
    const donor = await Donor.findOne({ where: { userId: donorUserId } });
    const donorUser = await User.findByPk(donorUserId);

    if (!donor || !donorUser) {
      console.log("❌ Donor or donor user not found");
      return res.redirect("/admin/requests");
    }

    console.log(`👤 Found donor: ${donorUser.firstName} ${donorUser.lastName} (${donor.bloodType})`);

    // Create conversation ID
    const conversationId = createConversationId(adminUserId, parseInt(donorUserId));
    console.log(`💬 Conversation ID: ${conversationId}`);

    // Create automatic initial message from admin to donor
    const initialMessage = `Dear, ${donorUser.firstName}

This is an urgent notification from the VitalMatch Admin Team. We have identified a critical blood request that matches your registered blood type (${donor.bloodType}). 

Please review the following details: 
Hospital: ${bloodRequest.hospitalName}  Location: ${bloodRequest.hospitalAddress} 
Blood Type Needed: ${bloodRequest.bloodType} 
Units Required: ${bloodRequest.unitsRequired}
Urgency: ${bloodRequest.urgency} 
Patient: ${bloodRequest.patientName} Contact Information: ${bloodRequest.contactNumber} 

Your prompt assistance could significantly impact the patient's recovery. 

Kindly reply to this message to confirm if you are available to donate.

Thank you for your continued support as a registered donor. 

Sincerely, 
VitalMatch Admin Team`;

    // Send the initial message
    await Message.create({
      senderId: adminUserId,
      receiverId: parseInt(donorUserId),
      message: initialMessage,
      conversationId,
      isRead: false
    });

    console.log("✅ Message sent successfully");

    // Redirect to messages page with the donor conversation
    res.redirect(`/messages?userId=${donorUserId}`);

  } catch (error) {
    console.error("❌ Error contacting donor:", error);
    res.redirect("/admin/requests");
  }
};


// Configure multer for voice message uploads
const voiceMessageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads/voice-messages';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `voice_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`;
    cb(null, uniqueName);
  }
});

const voiceMessageUpload = multer({
  storage: voiceMessageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'audio/webm' || file.mimetype === 'audio/ogg' || file.mimetype === 'audio/wav') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

export const uploadVoiceMessage = voiceMessageUpload.single('audio');

// Send voice message
export const sendVoiceMessage = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const { recipientId, duration, waveformData } = req.body;
    const senderId = req.session.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log(`🎤 Sending voice message from ${senderId} to ${recipientId}`);

    const conversationId = createConversationId(senderId, parseInt(recipientId));
    const audioFilePath = `/uploads/voice-messages/${req.file.filename}`;

    await Message.create({
      senderId,
      receiverId: parseInt(recipientId),
      messageType: 'voice',
      audioFilePath,
      audioDuration: parseInt(duration) || 0,
      waveformData: waveformData || null,
      conversationId,
      isRead: false
    });

    console.log(`✅ Voice message sent successfully`);

    res.json({ success: true, audioFilePath });

  } catch (error) {
    console.error("Error sending voice message:", error);
    res.status(500).json({ error: 'Failed to send voice message' });
  }
};
