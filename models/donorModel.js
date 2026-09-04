/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Donor = sequelize.define("Donor", {
  fullName: { type: DataTypes.STRING, allowNull: false },
  dateOfBirth: { type: DataTypes.DATE, allowNull: false },
  gender: { type: DataTypes.STRING, allowNull: false },
  bloodType: { type: DataTypes.STRING, allowNull: false },
  weight: { type: DataTypes.INTEGER, allowNull: false },
  height: { type: DataTypes.INTEGER, allowNull: false },
  mobileNumber: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  province: { type: DataTypes.STRING, allowNull: false },
  zipCode: { type: DataTypes.STRING, allowNull: false },
  latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  lastDonationDate: { type: DataTypes.DATE },
  medicalConditions: { type: DataTypes.TEXT },
  isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true },
  emergencyContactName: { type: DataTypes.STRING, allowNull: false },
  emergencyContactNumber: { type: DataTypes.STRING, allowNull: false },
  emergencyContactRelationship: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false }
});

export { sequelize };
