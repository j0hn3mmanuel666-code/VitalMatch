/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import bcrypt from "bcrypt";
import 'dotenv/config';
import { getBcryptRounds } from "./middleware/validation.js";
import { User, sequelize } from "./models/userModel.js";

async function createHospitalAccount() {
  try {
    await sequelize.sync({ alter: true });

    // Credentials must come from the environment - never hardcode them.
    const email = process.env.HOSPITAL_EMAIL;
    const password = process.env.HOSPITAL_PASSWORD;
    const hospitalName = process.env.HOSPITAL_NAME;
    if (!email || !password || !hospitalName) {
      console.error("❌ Set HOSPITAL_EMAIL, HOSPITAL_PASSWORD and HOSPITAL_NAME in your .env before running this script.");
      process.exit(1);
    }

    const existing = await User.findOne({ where: { email } });

    if (existing) {
      console.log(`❌ Hospital account already exists for ${email}`);
      console.log(`📌 ID: ${existing.id}`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, getBcryptRounds());

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
      // hospitalName is required: review/approve matching is done by facility
      // name, and a NULL name locks the account out of the review inbox.
      hospitalName,
      isActive: true,
      emailVerified: true
    });

    console.log("✅ Hospital account created successfully!");
    console.log(`📧 Email: ${email}`);
    console.log("🏥 Role: hospital");
    console.log("➡️ Login at: /login and access /hospital/dashboard after signing in.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating hospital account:", error);
    process.exit(1);
  }
}

createHospitalAccount();
