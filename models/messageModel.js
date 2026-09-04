/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Message = sequelize.define("Message", {
  senderId: { type: DataTypes.INTEGER, allowNull: false },
  receiverId: { type: DataTypes.INTEGER, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: true }, // Made nullable for voice messages
  messageType: { type: DataTypes.ENUM('text', 'voice'), defaultValue: 'text', allowNull: false },
  audioFilePath: { type: DataTypes.STRING, allowNull: true }, // Path to audio file for voice messages
  audioDuration: { type: DataTypes.INTEGER, allowNull: true }, // Duration in seconds
  waveformData: { type: DataTypes.TEXT, allowNull: true }, // JSON array of waveform amplitudes
  isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
  conversationId: { type: DataTypes.STRING, allowNull: false } // Format: "userId1-userId2" (smaller ID first)
});

export { sequelize };
