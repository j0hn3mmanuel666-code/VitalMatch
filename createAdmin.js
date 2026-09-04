/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import bcrypt from "bcrypt";
import { User, sequelize } from "./models/userModel.js";

async function createAdminUser() {
  try {
    // Sync database
    await sequelize.sync({ alter: true });
    
    const adminEmail = "Vmadmin@gmail.com";
    const adminPassword = "vmadmin123";
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ where: { email: adminEmail } });
    
    if (existingAdmin) {
      console.log("❌ Admin user already exists!");
      process.exit(0);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Create admin user
    await User.create({
      name: "VitalMatch Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin"
    });
    
    console.log("✅ Admin user created successfully!");
    console.log("📧 Email: Vmadmin@gmail.com");
    console.log("🔑 Password: vmadmin123");
    console.log("🔐 Role: admin");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

createAdminUser();
