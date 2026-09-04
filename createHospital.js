/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import bcrypt from "bcrypt";
import { User, sequelize } from "./models/userModel.js";

async function createHospitalAccount() {
  try {
    await sequelize.sync({ alter: true });

    const email = "luna.goco@hospital.com";
    const existing = await User.findOne({ where: { email } });

    if (existing) {
      console.log(`❌ Hospital account already exists for ${email}`);
      console.log(`📌 ID: ${existing.id}`);
      process.exit(0);
    }

    const password = "LunaGoco@123";
    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      firstName: "Luna",
      lastName: "Goco",
      email,
      password: hashedPassword,
      phone: "09171234567",
      address: "Luna Goco Hospital, Calapan, Oriental Mindoro",
      dateOfBirth: "1990-01-01",
      gender: "other",
      role: "hospital",
      emailVerified: true
    });

    console.log("✅ Hospital account created successfully!");
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log("🏥 Role: hospital");
    console.log("➡️ Login at: /login and access /hospital/dashboard after signing in.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating hospital account:", error);
    process.exit(1);
  }
}

createHospitalAccount();
