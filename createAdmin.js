/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import bcrypt from "bcrypt";
import 'dotenv/config';
import { getBcryptRounds } from "./middleware/validation.js";
import { User, sequelize } from "./models/userModel.js";

async function createAdminUser() {
  try {
    // Sync database
    await sequelize.sync({ alter: true });

    // Credentials must come from the environment - never hardcode them.
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.error("❌ Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env before running this script.");
      process.exit(1);
    }
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ where: { email: adminEmail } });
    
    if (existingAdmin) {
      console.log("❌ Admin user already exists!");
      process.exit(0);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, getBcryptRounds());
    
    // Create admin user
    await User.create({
      name: "VitalMatch Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin"
    });
    
    console.log("✅ Admin user created successfully!");
    console.log(`📧 Email: ${adminEmail}`);
    console.log("🔐 Role: admin");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

createAdminUser();
