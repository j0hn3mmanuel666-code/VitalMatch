/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Database migration script for Messages table - Add voice message support
*/

import { Message, sequelize } from "./models/messageModel.js";

async function migrateMessageTable() {
  try {
    console.log("🔄 Starting Messages table migration for voice messages...");
    
    // Sync the Message model with the database
    await Message.sync({ alter: true });
    
    console.log("✅ Messages table migration completed successfully!");
    console.log("📋 New fields added:");
    console.log("   - messageType (ENUM: 'text', 'voice')");
    console.log("   - audioFilePath (STRING, nullable)");
    console.log("   - audioDuration (INTEGER, nullable)");
    console.log("   - waveformData (TEXT, nullable)");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrateMessageTable();
