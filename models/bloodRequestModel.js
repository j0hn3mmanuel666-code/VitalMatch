/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Donor } from "./donorModel.js";

export const BloodRequest = sequelize.define("BloodRequest", {
  patientName: { type: DataTypes.STRING, allowNull: false },
  patientAge: { type: DataTypes.INTEGER, allowNull: false },
  bloodType: { type: DataTypes.STRING, allowNull: false },
  unitsRequired: { type: DataTypes.INTEGER, allowNull: false },

  // New fields for blood components and transfusion indication
  bloodComponents: { type: DataTypes.JSON, allowNull: true }, // Store array of selected components with volumes
  indicationOfTransfusion: { type: DataTypes.TEXT, allowNull: true },

  hospitalName: { type: DataTypes.STRING, allowNull: false },
  hospitalAddress: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  province: { type: DataTypes.STRING, allowNull: false },
  latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  contactPerson: { type: DataTypes.STRING, allowNull: false },
  contactNumber: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  urgency: { type: DataTypes.STRING, allowNull: false }, // 'critical', 'urgent', 'moderate'
  requiredByDate: { type: DataTypes.DATE, allowNull: false },
  notes: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: "active" }, // 'active', 'scheduled', 'fulfilled', 'cancelled', 'pending'
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Allow null for guest requests
    references: { model: User, key: "id" },
    onDelete: "CASCADE"
  },
  assignedDonorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: Donor, key: "id" },
    onDelete: "SET NULL"
  },
  scheduledDate: { type: DataTypes.DATE, allowNull: true },
  fulfillmentNotes: { type: DataTypes.TEXT, allowNull: true },
  requesterConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
  donorConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
  // Emergency escalation: jumps the queue with full-radius broadcast.
  // Expires automatically; cleared on fulfill/cancel.
  isEmergency: { type: DataTypes.BOOLEAN, defaultValue: false },
  emergencyAt: { type: DataTypes.DATE, allowNull: true },
  emergencyExpiresAt: { type: DataTypes.DATE, allowNull: true },
  // Facility review: when the typed hospital matches a verified hospital account,
  // that facility must approve before the request counts as theirs.
  hospitalId: { type: DataTypes.INTEGER, allowNull: true },
  hospitalStatus: { type: DataTypes.STRING, defaultValue: "approved" } // approved | pending | declined
});

BloodRequest.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });
User.hasMany(BloodRequest, { foreignKey: "userId", onDelete: "CASCADE" });
BloodRequest.belongsTo(Donor, { foreignKey: "assignedDonorId", onDelete: "SET NULL" });

export { sequelize };
