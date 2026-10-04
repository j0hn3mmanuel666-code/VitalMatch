/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { Message } from "../models/messageModel.js";
import { User } from "../models/userModel.js";
import { BloodRequest } from "../models/bloodRequestModel.js";
import { Donor } from "../models/donorModel.js";
import { Op } from "sequelize";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";

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
          audioFilePath: msg.messageType === 'voice' ? `/messages/voice/${msg.id}` : null,
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
    console.error("Error loading messages:");
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
    if (!/^\d+$/.test(String(recipientId)) || Number(recipientId) === Number(senderId) ||
      typeof message !== 'string' || !message.trim() || message.length > 4000) {
      return res.status(400).json({ success: false, error: 'Invalid message or recipient' });
    }
    const recipient = await User.findOne({ where: { id: Number(recipientId), isActive: true, emailVerified: true }, attributes: ['id'] });
    if (!recipient) return res.status(400).json({ success: false, error: 'Recipient unavailable' });


    const conversationId = createConversationId(senderId, parseInt(recipientId));

    await Message.create({
      senderId,
      receiverId: parseInt(recipientId),
      message,
      conversationId,
      isRead: false
    });


    // Redirect back to the conversation
    res.redirect(`/messages?userId=${recipientId}`);

  } catch (error) {
    console.error("Error sending message:");
    res.redirect("/messages");
  }
};

// Contact admin - hospital opens a direct conversation with an administrator
export const contactAdmin = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const admin = await User.findOne({
      where: { role: "admin", isActive: true },
      order: [["createdAt", "ASC"]]
    });

    if (!admin) {
      req.flash("error_msg", "No administrator account is available right now. Please try again later.");
      return res.redirect(req.get("Referer") || "/hospital/dashboard");
    }

    res.redirect(`/messages?userId=${admin.id}`);
  } catch (error) {
    console.error("Error contacting admin:");
    req.flash("error_msg", "Could not open admin chat. Please try again.");
    res.redirect(req.get("Referer") || "/hospital/dashboard");
  }
};

// Contact donor - Admin initiates conversation with automatic message
export const contactDonor = async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const { requestId, donorUserId } = req.params;
    const adminUserId = req.session.userId;


    // Get blood request details
    const bloodRequest = await BloodRequest.findByPk(requestId);
    if (!bloodRequest) {
      return res.redirect("/admin/requests");
    }


    // Get donor details
    const donor = await Donor.findOne({ where: { userId: donorUserId } });
    const donorUser = await User.findByPk(donorUserId);

    if (!donor || !donorUser?.isActive || !donorUser.emailVerified) {
      return res.redirect("/admin/requests");
    }
    // A navigation opens the conversation; only a CSRF-protected POST sends.
    if (req.method === 'GET') return res.redirect(`/messages?userId=${donorUserId}`);


    // Create conversation ID
    const conversationId = createConversationId(adminUserId, parseInt(donorUserId));

    // Create automatic initial message from admin to donor
    const initialMessage = `Dear, ${donorUser.firstName}

This is an urgent notification from the VitalMatch Admin Team. We have identified a critical blood request that matches your registered blood type (${donor.bloodType}). 

Please review the following details: 
Hospital: ${bloodRequest.hospitalName}  Location: ${bloodRequest.hospitalAddress} 
Blood Type Needed: ${bloodRequest.bloodType} 
Units Required: ${bloodRequest.unitsRequired}
Urgency: ${bloodRequest.urgency} 
Request: #${bloodRequest.id}

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


    // Redirect to messages page with the donor conversation
    res.redirect(`/messages?userId=${donorUserId}`);

  } catch (error) {
    console.error("❌ Error contacting donor:");
    res.redirect("/admin/requests");
  }
};


// Private voice files never enter the public static directory. Legacy files are
// preserved and served only through the same participant-authorized endpoint.
export const privateVoiceDirectory = path.resolve(process.cwd(), 'storage/private/voice-messages');
const audioTypes = { 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/wav': '.wav' };
const voiceMessageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(privateVoiceDirectory, { recursive: true });
    cb(null, privateVoiceDirectory);
  },
  filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(24).toString('hex')}${audioTypes[file.mimetype]}`)
});
const voiceMessageUpload = multer({
  storage: voiceMessageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 10000 },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(audioTypes, file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Unsupported media'), { code: 'INVALID_MEDIA' }));
  }
});
export const uploadVoiceMessage = voiceMessageUpload.single('audio');

export function audioSignatureMatches(buffer, mime) {
  if (mime === 'audio/webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === 'audio/ogg') return buffer.subarray(0, 4).toString() === 'OggS';
  return mime === 'audio/wav' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE';
}
function discardUploadedAudio(req) {
  if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch {} }
}
export const sendVoiceMessage = async (req, res) => {
  try {
    const { recipientId, duration, waveformData } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    const recipient = typeof recipientId === 'string' && /^\d+$/.test(recipientId) && Number.isSafeInteger(Number(recipientId)) && Number(recipientId) > 0 && Number(recipientId) !== Number(req.session.userId)
      ? await User.findOne({ where: { id: Number(recipientId), isActive: true, emailVerified: true }, attributes: ['id'] }) : null;
    const bytes = await fs.promises.readFile(req.file.path);
    if (!recipient || !audioSignatureMatches(bytes, req.file.mimetype)) {
      discardUploadedAudio(req);
      return res.status(400).json({ error: 'Invalid audio file or recipient' });
    }
    const seconds = typeof duration === 'string' && duration.trim() ? Number(duration) : NaN;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 600) {
      discardUploadedAudio(req);
      return res.status(400).json({ error: 'Audio duration must be between 0 and 600 seconds' });
    }
    let waveform = null;
    if (waveformData) {
      const parsed = JSON.parse(waveformData);
      if (!Array.isArray(parsed) || parsed.length > 1000 || !parsed.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) {
        discardUploadedAudio(req);
        return res.status(400).json({ error: 'Invalid waveform data' });
      }
      waveform = JSON.stringify(parsed);
    }
    const message = await Message.create({
      senderId: req.session.userId, receiverId: recipient.id,
      messageType: 'voice', audioFilePath: `private:${req.file.filename}`,
      audioDuration: Math.round(seconds), waveformData: waveform,
      conversationId: createConversationId(req.session.userId, recipient.id), isRead: false
    });
    res.json({ success: true, audioFilePath: `/messages/voice/${message.id}` });
  } catch (error) {
    discardUploadedAudio(req);
    const malformed = error instanceof SyntaxError;
    res.status(malformed ? 400 : 500).json({ error: malformed ? 'Invalid waveform data' : 'Failed to send voice message' });
  }
};

export const serveVoiceMessage = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.sendStatus(404);
    const message = await Message.findOne({ where: {
      id: Number(req.params.id), messageType: 'voice',
      [Op.or]: [{ senderId: req.session.userId }, { receiverId: req.session.userId }]
    } });
    if (!message?.audioFilePath) return res.sendStatus(404);
    const stored = message.audioFilePath;
    let file;
    if (/^private:[a-f0-9]{48}\.(webm|ogg|wav)$/.test(stored)) {
      file = path.join(privateVoiceDirectory, stored.slice(8));
    } else if (/^\/uploads\/voice-messages\/voice_[A-Za-z0-9_]+\.webm$/.test(stored)) {
      file = path.resolve(process.cwd(), 'public/uploads/voice-messages', path.basename(stored));
    } else return res.sendStatus(404);
    res.set('Cache-Control', 'private, no-store, no-cache');
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(file, error => {
      if (!error || res.headersSent) return;
      if (error.status === 404) return res.sendStatus(404);
      next(error);
    });
  } catch (error) { next(error); }
};
