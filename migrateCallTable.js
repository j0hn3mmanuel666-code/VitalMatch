/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Database migration script for Calls table
*/

import { Call, sequelize } from "./models/callModel.js";

async function migrateCallTable() {
  try {
    console.log("🔄 Starting Calls table migration...");
    
    // Sync the Call model with the database
    await Call.sync({ alter: true });
    
    console.log("✅ Calls table migration completed successfully!");
    console.log("📋 Table structure:");
    console.log("   - id (INTEGER, PRIMARY KEY, AUTO_INCREMENT)");
    console.log("   - callerId (INTEGER, FOREIGN KEY -> Users.id)");
    console.log("   - calleeId (INTEGER, FOREIGN KEY -> Users.id)");
    console.log("   - conversationId (STRING)");
    console.log("   - callType (ENUM: 'audio', 'video')");
    console.log("   - outcome (ENUM: 'completed', 'missed', 'declined', 'failed')");
    console.log("   - duration (INTEGER, nullable)");
    console.log("   - initiatedAt (DATETIME)");
    console.log("   - endedAt (DATETIME, nullable)");
    console.log("   - errorType (STRING, nullable)");
    console.log("   - seenByCaller (BOOLEAN)");
    console.log("   - seenByCallee (BOOLEAN)");
    console.log("   - createdAt (DATETIME)");
    console.log("   - updatedAt (DATETIME)");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrateCallTable();
