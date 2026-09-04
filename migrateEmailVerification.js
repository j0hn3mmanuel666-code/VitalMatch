/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { sequelize } from "./models/db.js";

async function migrateEmailVerification() {
  try {
    console.log("🔄 Starting email verification migration...");
    
    // Add email verification columns to Users table
    await sequelize.query(`
      ALTER TABLE Users 
      ADD COLUMN emailVerified BOOLEAN DEFAULT FALSE,
      ADD COLUMN emailVerificationToken VARCHAR(255) NULL,
      ADD COLUMN emailVerificationExpires DATETIME NULL
    `);
    
    console.log("✅ Email verification columns added successfully!");
    
    // Update existing users to be verified (so they can still login)
    await sequelize.query(`
      UPDATE Users 
      SET emailVerified = TRUE 
      WHERE emailVerified IS NULL OR emailVerified = FALSE
    `);
    
    console.log("✅ Existing users marked as verified!");
    console.log("🎉 Email verification migration completed successfully!");
    
  } catch (error) {
    if (error.message.includes('Duplicate column name')) {
      console.log("ℹ️  Email verification columns already exist, skipping migration.");
    } else {
      console.error("❌ Migration failed:", error);
    }
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

migrateEmailVerification();